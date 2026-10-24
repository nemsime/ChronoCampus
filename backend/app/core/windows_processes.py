"""Windows process ownership for the local supervisor (no shell or PID-only kills)."""
import ctypes
from ctypes import wintypes as w
import os
import subprocess


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
    """Only this supervisor owns the non-inherited kill-on-close Job handle."""

    def __init__(self):
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
        return self.kernel.WaitForSingleObject(process, 0) == 0

    def close(self):
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
        self.kernel = _kernel()
        self.handle = _check(self.kernel.CreateEventW(None, True, False, name))

    def is_set(self):
        return self.kernel.WaitForSingleObject(self.handle, 0) == 0

    def close(self):
        self.kernel.CloseHandle(self.handle)

    @staticmethod
    def signal(name):
        kernel = _kernel()
        handle = kernel.OpenEventW(2, False, name)
        if not handle:
            return False
        try:
            _check(kernel.SetEvent(handle))
            return True
        finally:
            kernel.CloseHandle(handle)
