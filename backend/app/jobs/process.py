"""Bounded framed IPC with independently controlled child lifetime."""

import ctypes
import json
import os
import queue
import re
import struct
import subprocess
import sys
import threading
import time
from collections import deque
from ctypes import wintypes
from pathlib import Path

from app.jobs.solver_child import read_exact, write_frame


class SolverFailure(RuntimeError):
    pass


class SolverStopped(SolverFailure):
    pass


class ReapFailure(SolverFailure):
    """Fatal worker fault: do not claim another job."""


class WindowsJob:
    def __init__(self, process, memory_mb):
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel, self.handle = kernel, None
        kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        kernel.CreateJobObjectW.restype = wintypes.HANDLE
        kernel.SetInformationJobObject.argtypes = [
            wintypes.HANDLE,
            ctypes.c_int,
            ctypes.c_void_p,
            wintypes.DWORD,
        ]
        kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]

        class Basic(ctypes.Structure):
            _fields_ = [
                ("process_time", ctypes.c_int64),
                ("job_time", ctypes.c_int64),
                ("flags", wintypes.DWORD),
                ("min_ws", ctypes.c_size_t),
                ("max_ws", ctypes.c_size_t),
                ("active", wintypes.DWORD),
                ("affinity", ctypes.c_size_t),
                ("priority", wintypes.DWORD),
                ("scheduling", wintypes.DWORD),
            ]

        class IO(ctypes.Structure):
            _fields_ = [
                (name, ctypes.c_uint64)
                for name in (
                    "read_ops",
                    "write_ops",
                    "other_ops",
                    "read_bytes",
                    "write_bytes",
                    "other_bytes",
                )
            ]

        class Extended(ctypes.Structure):
            _fields_ = [
                ("basic", Basic),
                ("io", IO),
                ("process_memory", ctypes.c_size_t),
                ("job_memory", ctypes.c_size_t),
                ("peak_process", ctypes.c_size_t),
                ("peak_job", ctypes.c_size_t),
            ]

        handle = kernel.CreateJobObjectW(
            None, None
        )  # non-inheritable, parent owns sole handle
        if not handle:
            raise SolverFailure("containment_failed")
        self.handle = handle
        info = Extended()
        info.basic.flags = (
            0x2000 | 0x100 | 0x8
        )  # kill-on-close, process memory, active process limit
        info.basic.active = 1
        info.process_memory = memory_mb * 1024**2
        if not kernel.SetInformationJobObject(
            handle, 9, ctypes.byref(info), ctypes.sizeof(info)
        ) or not kernel.AssignProcessToJobObject(handle, int(process._handle)):
            self.close()
            raise SolverFailure("containment_failed")

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


def sanitized_environment():
    env = {
        key: os.environ[key]
        for key in ("SystemRoot", "WINDIR", "TEMP", "TMP")
        if key in os.environ
    }
    env.update(OMP_NUM_THREADS="1", OPENBLAS_NUM_THREADS="1", MKL_NUM_THREADS="1")
    return env


def stop_and_reap(process):
    if process.poll() is None:
        process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired as error:
            raise ReapFailure("solver_reap_failed") from error


def run_solver(
    request,
    *,
    deadline_seconds,
    stop,
    progress=None,
    memory_mb=2048,
    input_limit=16 * 1024**2,
    output_limit=64 * 1024**2,
    command=None,
):
    # Serialize/validate before spawning; the input writer never blocks control/heartbeat.
    if (
        len(json.dumps(request, ensure_ascii=True, allow_nan=False).encode())
        > input_limit
    ):
        raise SolverFailure("solver_input_too_large")
    if command is None:
        command = [
            sys._base_executable if os.name == "nt" else sys.executable,
            "-I",
            str(Path(__file__).with_name("solver_child.py")),
            str(os.getpid()),
            str(memory_mb),
            str(
                Path(sys.prefix)
                / (
                    "Lib/site-packages"
                    if os.name == "nt"
                    else f"lib/python{sys.version_info.major}.{sys.version_info.minor}/site-packages"
                )
            ),
        ]
    process = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        env=sanitized_environment(),
        close_fds=True,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    containment = None
    events = queue.Queue(maxsize=64)
    closing = threading.Event()
    recent_progress = deque(maxlen=60)
    progress_events = queue.Queue(maxsize=60)
    progress_done = threading.Event()

    def report_progress():
        # Persistence can block on SQL. It must never block the child control loop.
        while not progress_done.is_set() or not progress_events.empty():
            try:
                value = progress_events.get(timeout=0.1)
            except queue.Empty:
                continue
            try:
                progress(value.get("stage", "searching"), **value.get("values", {}))
            except Exception:  # noqa: BLE001 - progress is best effort; no raw child data in logs
                return

    reporter = (
        threading.Thread(target=report_progress, daemon=True) if progress else None
    )

    def offer(value):
        while not closing.is_set():
            try:
                events.put(value, timeout=0.1)
                return
            except queue.Full:
                continue

    def read_output():
        try:
            while not closing.is_set():
                size = struct.unpack("!I", read_exact(process.stdout, 4))[0]
                if size > output_limit:
                    raise SolverFailure("solver_output_too_large")
                # Protocol output always places type first. Inspect a bounded prefix
                # before allocating the full message, so progress cannot consume 64 MiB.
                prefix = read_exact(process.stdout, min(size, 128))
                kind = re.match(
                    rb'^\s*\{\s*"type"\s*:\s*"(result|progress|error)"', prefix
                )
                if kind is None or (kind[1] != b"result" and size > 8192):
                    raise SolverFailure("solver_protocol_error")
                value = json.loads(
                    prefix + read_exact(process.stdout, size - len(prefix))
                )
                if not isinstance(value, dict):
                    raise SolverFailure("solver_protocol_error")
                if value.get("type") != "result" and size > 8192:
                    raise SolverFailure("solver_progress_too_large")
                offer(value)
                if value.get("type") in {"result", "error"}:
                    return
        except Exception as error:  # noqa: BLE001 - forward IPC thread failures to control loop
            offer(error)

    def send_input():
        try:
            write_frame(process.stdin, request, input_limit)
            process.stdin.close()
        except Exception as error:  # noqa: BLE001 - forward IPC thread failures to control loop
            offer(error)

    try:
        if os.name == "nt":
            containment = WindowsJob(process, memory_mb)
        elif sys.platform != "linux":
            raise SolverFailure("unsupported_containment_platform")
        reader = threading.Thread(target=read_output, daemon=True)
        writer = threading.Thread(target=send_input, daemon=True)
        reader.start()
        writer.start()
        if reporter:
            reporter.start()
        deadline = time.monotonic() + deadline_seconds
        while True:
            if stop.is_set():
                raise SolverStopped("solver_stopped")
            if time.monotonic() >= deadline:
                raise SolverFailure("solver_deadline")
            try:
                value = events.get(timeout=0.1)
            except queue.Empty:
                continue
            if isinstance(value, Exception):
                raise SolverFailure("solver_protocol_error") from value
            if value.get("type") == "progress":
                recent_progress.append(value)
                if progress:
                    try:
                        progress_events.put_nowait(value)
                    except queue.Full:
                        # Keep the most recent bounded stage history under SQL backpressure.
                        try:
                            progress_events.get_nowait()
                        except queue.Empty:
                            pass
                        progress_events.put_nowait(value)
            elif value.get("type") == "result" and isinstance(
                value.get("result"), dict
            ):
                # A result is accepted only after the child has exited and been reaped.
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired as error:
                    raise SolverFailure("solver_exit_timeout") from error
                if process.returncode:
                    raise SolverFailure("solver_child_failed")
                progress_done.set()
                if reporter:
                    reporter.join(timeout=1)
                return value["result"]
            else:
                raise SolverFailure("solver_child_failed")
    finally:
        closing.set()
        progress_done.set()
        try:
            stop_and_reap(process)
        finally:
            if containment:
                containment.close()
            for stream in (process.stdin, process.stdout):
                try:
                    stream.close()
                except (OSError, ValueError):
                    pass
