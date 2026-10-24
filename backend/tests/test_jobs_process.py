import ctypes
import io
import os
import signal
import struct
import subprocess
import sys
import threading
import time
from ctypes import wintypes
from pathlib import Path

import pytest

from app.jobs.process import (
    SolverFailure,
    SolverStopped,
    run_solver,
    sanitized_environment,
)
from app.jobs.solver_child import read_frame, write_frame

BASE = sys._base_executable if os.name == "nt" else sys.executable
SITE = str(
    Path(sys.prefix)
    / (
        "Lib/site-packages"
        if os.name == "nt"
        else f"lib/python{sys.version_info.major}.{sys.version_info.minor}/site-packages"
    )
)
BACKEND = str(Path(__file__).resolve().parents[1])


def command(tmp_path, body):
    script = tmp_path / "child.py"
    script.write_text(body)
    return [BASE, "-I", str(script)]


def alive(pid):
    if os.name == "nt":
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x100000, False, pid)
        if not handle:
            return False
        try:
            return kernel.WaitForSingleObject(handle, 0) == 0x102
        finally:
            kernel.CloseHandle(handle)
    try:
        status = Path(f"/proc/{pid}/stat").read_text().split()[2]
        return status != "Z"
    except FileNotFoundError:
        return False


def wait_for(predicate, seconds=5):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.02)
    return False


def sleeping_cpu_child(tmp_path):
    marker = tmp_path / "child-pid"
    script = tmp_path / "cpu.py"
    script.write_text(f"""import sys, types, os, time
from pathlib import Path
sys.path[:0] = [{BACKEND!r}, {SITE!r}]
from app.jobs.solver_child import main
fake = types.ModuleType('app.scheduling.solver')
def generate(*args, **kwargs):
    Path({str(marker)!r}).write_text(str(os.getpid()))
    time.sleep(60)
    return {{}}
fake.generate = generate
sys.modules['app.scheduling.solver'] = fake
sys.argv = [__file__, str(os.getppid()), '2048', {SITE!r}]
main()
""")
    return [BASE, "-I", str(script)], marker


def test_frames_check_prefix_before_reading_and_environment(monkeypatch):
    with pytest.raises(ValueError, match="frame_too_large"):
        read_frame(io.BytesIO(struct.pack("!I", 1000000)), 50)
    buffer = io.BytesIO()
    write_frame(buffer, {"ok": True}, 100)
    buffer.seek(0)
    assert read_frame(buffer, 100) == {"ok": True}
    monkeypatch.setenv("DATABASE_URL", "secret")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("PYTHONPATH", "untrusted")
    assert (
        not {"DATABASE_URL", "SMTP_PASSWORD", "PYTHONPATH"}
        & sanitized_environment().keys()
    )


@pytest.mark.parametrize(
    "body",
    [
        "import sys; sys.exit(7)",
        "import sys,struct; sys.stdout.buffer.write(struct.pack('!I', 999999999)); sys.stdout.buffer.flush()",
        "import sys,struct; sys.stdout.buffer.write(struct.pack('!I', 5)+b'nope!'); sys.stdout.buffer.flush()",
        "import sys,struct; sys.stdout.buffer.write(struct.pack('!I', 999999999)); sys.stdout.buffer.flush(); sys.stdin.buffer.read()",
    ],
)
def test_child_crash_malformed_oversized_and_blocked_input(tmp_path, body):
    started = time.monotonic()
    with pytest.raises(SolverFailure):
        run_solver(
            {"large": "x" * 100000},
            deadline_seconds=3,
            stop=threading.Event(),
            command=command(tmp_path, body),
            output_limit=1024,
        )
    assert time.monotonic() - started < 8


def test_input_size_rejected_before_spawn(tmp_path):
    with pytest.raises(SolverFailure, match="input_too_large"):
        run_solver(
            {"x": "x" * 200},
            deadline_seconds=1,
            stop=threading.Event(),
            input_limit=100,
            command=["nonexistent-executable"],
        )


@pytest.mark.parametrize("mode", ["cancel", "deadline"])
def test_cancel_and_deadline_reap_child(tmp_path, mode):
    cmd, marker = sleeping_cpu_child(tmp_path)
    stop = threading.Event()
    timer = threading.Timer(0.5, stop.set) if mode == "cancel" else None
    if timer:
        timer.start()
    try:
        with pytest.raises(SolverStopped if mode == "cancel" else SolverFailure):
            run_solver(
                {
                    "protocol_version": 1,
                    "snapshot": {},
                    "algorithm": "x",
                    "seed": 1,
                    "search_seconds": 60,
                },
                deadline_seconds=0.6 if mode == "deadline" else 5,
                stop=stop,
                command=cmd,
            )
        assert marker.exists()
        assert not alive(int(marker.read_text()))
    finally:
        if timer:
            timer.cancel()


@pytest.mark.skipif(os.name != "nt", reason="Windows containment API")
def test_containment_failure_sends_no_input_and_reaps(tmp_path, monkeypatch):
    from app.jobs import process

    marker = tmp_path / "input-received"
    cmd = command(
        tmp_path,
        f"import sys; from pathlib import Path; data=sys.stdin.buffer.read(); Path({str(marker)!r}).write_bytes(data)",
    )

    def reject(*args):
        raise SolverFailure("containment_failed")

    monkeypatch.setattr(process, "WindowsJob", reject)
    with pytest.raises(SolverFailure, match="containment_failed"):
        run_solver({}, deadline_seconds=2, stop=threading.Event(), command=cmd)
    assert not marker.exists() or marker.read_bytes() == b""


def test_parent_hard_death_kills_cpu_child(tmp_path):
    cmd, marker = sleeping_cpu_child(tmp_path)
    script = tmp_path / "parent.py"
    script.write_text(f"""import sys, threading
sys.path[:0] = [{BACKEND!r}, {SITE!r}]
from app.jobs.process import run_solver
run_solver({{'protocol_version':1,'snapshot':{{}},'algorithm':'x','seed':1,'search_seconds':60}},
           deadline_seconds=60, stop=threading.Event(), command={cmd!r})
""")
    parent = subprocess.Popen(
        [BASE, "-I", str(script)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    child_pid = None
    try:
        assert wait_for(marker.exists), "child did not reach contained CPU execution"
        child_pid = int(marker.read_text())
        assert alive(child_pid)
        parent.kill()
        parent.wait(timeout=5)
        assert wait_for(lambda: not alive(child_pid)), (
            "CPU child survived parent hard death"
        )
    finally:
        if parent.poll() is None:
            parent.kill()
            parent.wait(timeout=5)
        if child_pid and alive(child_pid):
            os.kill(child_pid, signal.SIGTERM)


def test_blocked_progress_cannot_block_deadline_or_reaping(tmp_path):
    body = """import sys,struct,json,time
value=json.dumps({'type':'progress','stage':'searching','values':{}}).encode()
sys.stdout.buffer.write(struct.pack('!I',len(value))+value)
sys.stdout.buffer.flush()
time.sleep(60)
"""
    entered, release = threading.Event(), threading.Event()

    def blocked(*args, **kwargs):
        entered.set()
        release.wait(5)

    started = time.monotonic()
    try:
        with pytest.raises(SolverFailure, match="deadline"):
            run_solver(
                {},
                deadline_seconds=0.5,
                stop=threading.Event(),
                progress=blocked,
                command=command(tmp_path, body),
            )
        assert entered.is_set()
        assert time.monotonic() - started < 2
    finally:
        release.set()


def test_oversized_progress_rejected_from_prefix(tmp_path):
    # The rest of the alleged 1 MiB progress body is never sent: parsing its
    # bounded prefix must reject it without waiting for or allocating that body.
    body = """import sys,struct,time
sys.stdout.buffer.write(struct.pack('!I',1000000)+b'{"type":"progress",'+b' '*120)
sys.stdout.buffer.flush()
time.sleep(60)
"""
    started = time.monotonic()
    with pytest.raises(SolverFailure, match="protocol"):
        run_solver(
            {},
            deadline_seconds=3,
            stop=threading.Event(),
            command=command(tmp_path, body),
        )
    assert time.monotonic() - started < 2


def test_os_memory_limit_is_enforced(tmp_path):
    body = f"""import sys, types, os
sys.path[:0] = [{BACKEND!r}, {SITE!r}]
from app.jobs.solver_child import main
fake = types.ModuleType('app.scheduling.solver')
def generate(*args, **kwargs):
    try:
        block = bytearray(128 * 1024**2)
        return {{'memory_limited':False}}
    except MemoryError:
        return {{'memory_limited':True}}
fake.generate=generate
sys.modules['app.scheduling.solver']=fake
sys.argv=[__file__,str(os.getppid()),'64',{SITE!r}]
main()
"""
    result = run_solver(
        {
            "protocol_version": 1,
            "snapshot": {},
            "algorithm": "x",
            "seed": 1,
            "search_seconds": 1,
        },
        deadline_seconds=5,
        stop=threading.Event(),
        memory_mb=64,
        command=command(tmp_path, body),
    )
    assert result == {"memory_limited": True}
