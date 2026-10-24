"""Owned process trees and stop controls for the local supervisor."""
import ctypes
from ctypes import wintypes as w
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def _linux_process_identity(pid):
    try:
        stat = Path(f"/proc/{pid}/stat").read_text(encoding="ascii")
        fields = stat[stat.rfind(")") + 2:].split()
        if fields[0] == "Z":
            return None
        executable = os.path.realpath(f"/proc/{pid}/exe")
        return {"pid": pid, "created": fields[19], "executable": executable}
    except (FileNotFoundError, ProcessLookupError, PermissionError, IndexError, OSError):
        return None


def _linux_stop_file(name):
    launch = name.rsplit("-", 1)[-1]
    if len(launch) != 32 or any(character not in "0123456789abcdef" for character in launch):
        raise RuntimeError("invalid_local_stop_name")
    root = Path(__file__).resolve().parents[3]
    return root / ".runtime" / f"stop-{launch}.flag"


def _linux_group_alive(group_id):
    """Ignore zombies while waiting for an owned session's descendants to exit."""
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            stat = (entry / "stat").read_text(encoding="ascii")
            fields = stat[stat.rfind(")") + 2:].split()
            if fields[0] != "Z" and int(fields[2]) == group_id and int(fields[3]) == group_id:
                return True
        except (OSError, ValueError, IndexError):
            continue
    return False


class _BasicLimits(ctypes.Structure):
    _fields_ = [("process_time", ctypes.c_longlong), ("job_time", ctypes.c_longlong),
                ("flags", w.DWORD), ("min_ws", ctypes.c_size_t), ("max_ws", ctypes.c_size_t),
                ("active_processes", w.DWORD), ("affinity", ctypes.c_size_t),
                ("priority", w.DWORD), ("scheduling", w.DWORD)]


class _IoCounters(ctypes.Structure):
    _fields_ = [(name, ctypes.c_ulonglong) for name in
                ("read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes")]


class _ExtendedLimits(ctypes.Structure):
    _fields_ = [("basic", _BasicLimits), ("io", _IoCounters),
                ("process_memory", ctypes.c_size_t), ("job_memory", ctypes.c_size_t),
                ("peak_process_memory", ctypes.c_size_t), ("peak_job_memory", ctypes.c_size_t)]


class _StartupInfo(ctypes.Structure):
    _fields_ = [("cb", w.DWORD), ("reserved", w.LPWSTR), ("desktop", w.LPWSTR),
                ("title", w.LPWSTR), ("x", w.DWORD), ("y", w.DWORD),
                ("xsize", w.DWORD), ("ysize", w.DWORD), ("xchars", w.DWORD),
                ("ychars", w.DWORD), ("fill", w.DWORD), ("flags", w.DWORD),
                ("show", w.WORD), ("reserved_size", w.WORD), ("reserved_data", ctypes.c_void_p),
                ("stdin", w.HANDLE), ("stdout", w.HANDLE), ("stderr", w.HANDLE)]


class _ProcessInfo(ctypes.Structure):
    _fields_ = [("process", w.HANDLE), ("thread", w.HANDLE), ("pid", w.DWORD), ("tid", w.DWORD)]


class _StartupInfoEx(ctypes.Structure):
    _fields_ = [("startup", _StartupInfo), ("attributes", ctypes.c_void_p)]


def _kernel():
    if os.name != "nt":
        raise RuntimeError("local_supervisor_requires_windows")
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    signatures = {
        "CreateJobObjectW": ([ctypes.c_void_p, w.LPCWSTR], w.HANDLE),
        "SetInformationJobObject": ([w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD], w.BOOL),
        "AssignProcessToJobObject": ([w.HANDLE, w.HANDLE], w.BOOL),
        "TerminateJobObject": ([w.HANDLE, w.UINT], w.BOOL),
        "CloseHandle": ([w.HANDLE], w.BOOL),
        "CreateProcessW": ([w.LPCWSTR, w.LPWSTR, ctypes.c_void_p, ctypes.c_void_p,
                            w.BOOL, w.DWORD, ctypes.c_void_p, w.LPCWSTR,
                            ctypes.c_void_p, ctypes.POINTER(_ProcessInfo)], w.BOOL),
        "InitializeProcThreadAttributeList": ([ctypes.c_void_p, w.DWORD, w.DWORD, ctypes.POINTER(ctypes.c_size_t)], w.BOOL),
        "UpdateProcThreadAttribute": ([ctypes.c_void_p, w.DWORD, ctypes.c_size_t, ctypes.c_void_p,
                                       ctypes.c_size_t, ctypes.c_void_p, ctypes.c_void_p], w.BOOL),
        "DeleteProcThreadAttributeList": ([ctypes.c_void_p], None),
        "ResumeThread": ([w.HANDLE], w.DWORD),
        "TerminateProcess": ([w.HANDLE, w.UINT], w.BOOL),
        "WaitForSingleObject": ([w.HANDLE, w.DWORD], w.DWORD),
        "GetExitCodeProcess": ([w.HANDLE, ctypes.POINTER(w.DWORD)], w.BOOL),
        "OpenProcess": ([w.DWORD, w.BOOL, w.DWORD], w.HANDLE),
        "GetProcessTimes": ([w.HANDLE, *([ctypes.POINTER(w.FILETIME)] * 4)], w.BOOL),
        "QueryFullProcessImageNameW": ([w.HANDLE, w.DWORD, w.LPWSTR, ctypes.POINTER(w.DWORD)], w.BOOL),
        "CreateEventW": ([ctypes.c_void_p, w.BOOL, w.BOOL, w.LPCWSTR], w.HANDLE),
        "OpenEventW": ([w.DWORD, w.BOOL, w.LPCWSTR], w.HANDLE),
        "SetEvent": ([w.HANDLE], w.BOOL),
    }
    for name, (arguments, result) in signatures.items():
        function = getattr(kernel, name)
        function.argtypes, function.restype = arguments, result
    return kernel


def _check(value):
    if not value:
        raise ctypes.WinError(ctypes.get_last_error())
    return value


def process_identity(pid):
    """Read immutable creation time and executable; a reused PID never matches."""
    if sys.platform == "linux":
        return _linux_process_identity(pid)
    kernel = _kernel()
    handle = kernel.OpenProcess(0x1000 | 0x100000, False, pid)
    if not handle:
        return None
    try:
        if kernel.WaitForSingleObject(handle, 0) == 0:
            return None
        times = [w.FILETIME() for _ in range(4)]
        _check(kernel.GetProcessTimes(handle, *(ctypes.byref(item) for item in times)))
        name, length = ctypes.create_unicode_buffer(32768), w.DWORD(32768)
        _check(kernel.QueryFullProcessImageNameW(handle, 0, name, ctypes.byref(length)))
        return {"pid": pid, "created": str((times[0].dwHighDateTime << 32) | times[0].dwLowDateTime),
                "executable": os.path.normcase(name.value)}
    except OSError:
        # The process may finish between the liveness and image/time queries.
        # An identity we cannot verify never authorizes an ownership action.
        return None
    finally:
        kernel.CloseHandle(handle)


class ProcessTree:
    """Contain launched processes and terminate their owned tree on close."""

    def __init__(self):
        if sys.platform == "linux":
            self.processes = []
            return
        self.kernel = _kernel()
        self.handle = _check(self.kernel.CreateJobObjectW(None, None))
        limits = _ExtendedLimits()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        try:
            _check(self.kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)))
        except BaseException:
            self.close()
            raise
        self.processes = []

    def spawn(self, arguments, cwd, environment, stdout, stderr):
        if sys.platform == "linux":
            parent_pid = os.getpid()

            def parent_death_signal():
                libc = ctypes.CDLL(None, use_errno=True)
                if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0 or os.getppid() != parent_pid:
                    os._exit(127)

            process = subprocess.Popen(
                [str(argument) for argument in arguments],
                cwd=cwd,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
                close_fds=True,
                start_new_session=True,
                preexec_fn=parent_death_signal,
            )
            self.processes.append(process)
            return process.pid, process
        import msvcrt

        info, extended = _ProcessInfo(), _StartupInfoEx()
        startup = extended.startup
        startup.cb, startup.flags = ctypes.sizeof(extended), 0x100  # STARTF_USESTDHANDLES
        size = ctypes.c_size_t()
        self.kernel.InitializeProcThreadAttributeList(None, 2, 0, ctypes.byref(size))
        attributes = ctypes.create_string_buffer(size.value)
        _check(self.kernel.InitializeProcThreadAttributeList(attributes, 2, 0, ctypes.byref(size)))
        extended.attributes = ctypes.cast(attributes, ctypes.c_void_p)
        jobs = (w.HANDLE * 1)(self.handle)
        with open(os.devnull, "rb") as stdin:
            files = (stdin, stdout, stderr)
            handles = [msvcrt.get_osfhandle(stream.fileno()) for stream in files]
            for handle in handles:
                os.set_handle_inheritable(handle, True)
            startup.stdin, startup.stdout, startup.stderr = handles
            command = ctypes.create_unicode_buffer(subprocess.list2cmdline([str(arg) for arg in arguments]))
            env = ctypes.create_unicode_buffer("\0".join(f"{key}={value}" for key, value in sorted(environment.items())) + "\0")
            try:
                # Assign containment atomically with creation: even a supervisor
                # hard death before CreateProcessW returns cannot orphan a child.
                unique_handles = list(dict.fromkeys(handles))
                inherited = (w.HANDLE * len(unique_handles))(*unique_handles)
                _check(self.kernel.UpdateProcThreadAttribute(attributes, 0, 0x2000D,
                    jobs, ctypes.sizeof(jobs), None, None))  # JOB_LIST
                _check(self.kernel.UpdateProcThreadAttribute(attributes, 0, 0x20002,
                    inherited, ctypes.sizeof(inherited), None, None))  # HANDLE_LIST
                _check(self.kernel.CreateProcessW(str(arguments[0]), command, None, None, True,
                                                  0x4 | 0x400 | 0x08000000 | 0x80000, env, str(cwd),
                                                  ctypes.byref(extended), ctypes.byref(info)))
            finally:
                self.kernel.DeleteProcThreadAttributeList(attributes)
                for handle in handles:
                    os.set_handle_inheritable(handle, False)
        try:
            if self.kernel.ResumeThread(info.thread) == 0xFFFFFFFF:
                raise ctypes.WinError(ctypes.get_last_error())
        except BaseException:
            self.kernel.TerminateProcess(info.process, 1)
            self.kernel.CloseHandle(info.process)
            raise
        finally:
            self.kernel.CloseHandle(info.thread)
        self.processes.append(info.process)
        return info.pid, info.process

    def exited(self, process):
        if sys.platform == "linux":
            # Keep the session leader waitable until close. Its PID cannot be
            # reused for an unrelated group before we finish signaling the group.
            try:
                return os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT) is not None
            except ChildProcessError:
                return True
        return self.kernel.WaitForSingleObject(process, 0) == 0

    def close(self):
        if sys.platform == "linux":
            for process in self.processes:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline and any(_linux_group_alive(process.pid) for process in self.processes):
                time.sleep(0.05)
            for process in self.processes:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
            self.processes = []
            return
        if getattr(self, "handle", None):
            self.kernel.TerminateJobObject(self.handle, 1)
            self.kernel.CloseHandle(self.handle)
            self.handle = None
        for process in getattr(self, "processes", []):
            self.kernel.WaitForSingleObject(process, 3000)
            self.kernel.CloseHandle(process)
        self.processes = []


class StopEvent:
    def __init__(self, name):
        if sys.platform == "linux":
            self.path = _linux_stop_file(name)
            return
        self.kernel = _kernel()
        self.handle = _check(self.kernel.CreateEventW(None, True, False, name))

    def is_set(self):
        if sys.platform == "linux":
            return self.path.is_file()
        return self.kernel.WaitForSingleObject(self.handle, 0) == 0

    def close(self):
        if sys.platform == "linux":
            return
        self.kernel.CloseHandle(self.handle)

    @staticmethod
    def signal(name):
        if sys.platform == "linux":
            path = _linux_stop_file(name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch()
            return True
        kernel = _kernel()
        handle = kernel.OpenEventW(2, False, name)
        if not handle:
            return False
        try:
            _check(kernel.SetEvent(handle))
            return True
        finally:
            kernel.CloseHandle(handle)
