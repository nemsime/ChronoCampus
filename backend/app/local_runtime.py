"""Native Windows local start/status/stop, with an owning detached supervisor."""
import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen
from uuid import uuid4

from app.core.windows_processes import ProcessTree, StopEvent, process_identity

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / ".runtime"
STATE = RUNTIME / "state.json"
PORTS = {"api": 8000, "frontend": 3000}


@contextmanager
def exclusive(name):
    import msvcrt

    RUNTIME.mkdir(exist_ok=True)
    with (RUNTIME / name).open("a+b") as stream:
        if stream.tell() == 0:
            stream.write(b"0")
            stream.flush()
        stream.seek(0)
        try:
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise RuntimeError("local_runtime_already_starting") from None
        try:
            yield
        finally:
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)


def _read_state():
    try:
        value = json.loads(STATE.read_text(encoding="utf-8"))
        if value.get("root") != str(ROOT) or not re.fullmatch(r"[a-f0-9]{32}", value.get("launch_id", "")):
            return None
        return value
    except (OSError, ValueError, TypeError):
        return None


def _write_state(state):
    temporary = RUNTIME / f"state-{state['launch_id']}.tmp"
    temporary.write_text(json.dumps(state, indent=2), encoding="utf-8")
    temporary.replace(STATE)


def _owned_alive(record):
    identity = record.get("supervisor")
    if not isinstance(identity, dict) or not isinstance(identity.get("pid"), int):
        return False
    return process_identity(identity["pid"]) == identity


def status():
    state = _read_state()
    if not state:
        return {"status": "stopped", "root": str(ROOT)}
    if not _owned_alive(state):
        return {**state, "status": "failed" if state.get("status") == "failed" else "stopped", "supervisor_alive": False}
    return {**state, "supervisor_alive": True}


def _check_ports():
    for role, port in PORTS.items():
        with socket.socket() as probe:
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                raise RuntimeError(f"port_in_use:{role}:{port}")


def _ready_url(url):
    try:
        with urlopen(url, timeout=1) as response:
            return response.status == 200
    except (OSError, URLError):
        return False


def _worker_ready(instance):
    from sqlalchemy import select
    from app.db.session import get_engine
    from app.jobs.models import WorkerHeartbeat

    with get_engine().connect() as db:
        return db.scalar(select(WorkerHeartbeat.instance_id).where(WorkerHeartbeat.instance_id == instance)) is not None


def _preflight():
    from sqlalchemy.orm import Session
    from app.core.config import get_settings
    from app.db.session import get_engine
    from app.observability.router import database_probe

    if not (ROOT / "frontend/node_modules/vite/bin/vite.js").is_file() or not shutil.which("node"):
        raise RuntimeError("frontend_dependencies_missing")
    with Session(get_engine()) as db:
        if not database_probe(db)["ready"]:
            raise RuntimeError("migrations_required")
    settings = get_settings()
    # Validate before starting any process; creation/rotation are explicit commands.
    if settings.mail_mode in {"file", "smtp"}:
        from app.accounts.mail import MailError, validate_configuration
        try:
            validate_configuration(settings)
        except MailError:
            raise RuntimeError("mail_key_missing_or_invalid") from None


def start():
    with exclusive("start.lock"):
        state = _read_state()
        if state and _owned_alive(state):
            return status()
        _check_ports()
        _preflight()
        launch = uuid4().hex
        with (RUNTIME / "supervisor.stdout.log").open("ab") as out, (RUNTIME / "supervisor.stderr.log").open("ab") as err:
            process = subprocess.Popen(
                [sys.executable, "-m", "app.local_runtime", "supervise", "--launch-id", launch],
                cwd=ROOT / "backend", stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS,
                close_fds=True,
            )
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            state = _read_state()
            if state and state["launch_id"] == launch:
                if state["status"] == "ready":
                    return state
                if state["status"] in {"failed", "stopped"}:
                    raise RuntimeError(state.get("error", "local_start_failed"))
            if process.poll() is not None:
                raise RuntimeError("local_supervisor_exited")
            time.sleep(0.2)
        StopEvent.signal(f"Local\\ChronoCampus-{launch}")
        raise RuntimeError("local_start_timeout")


def stop():
    with exclusive("start.lock"):
        state = _read_state()
        if not state or not _owned_alive(state):
            return {"status": "stopped"}
        if not StopEvent.signal(f"Local\\ChronoCampus-{state['launch_id']}"):
            raise RuntimeError("local_supervisor_control_unavailable")
        deadline = time.monotonic() + 15
        while _owned_alive(state) and time.monotonic() < deadline:
            time.sleep(0.2)
        if _owned_alive(state):
            raise RuntimeError("local_stop_timeout")
        return status()


def supervise(launch):
    if not re.fullmatch(r"[a-f0-9]{32}", launch):
        raise RuntimeError("invalid_launch_id")
    with exclusive("instance.lock"):
        _check_ports()
        stop_file = RUNTIME / f"stop-{launch}.flag"
        state = {"root": str(ROOT), "launch_id": launch, "status": "starting",
                 "supervisor": process_identity(os.getpid()), "processes": []}
        control = StopEvent(f"Local\\ChronoCampus-{launch}")
        tree = ProcessTree()
        streams, children = [], []
        _write_state(state)
        try:
            python = str(ROOT / "backend/.venv/Scripts/python.exe")
            commands = [
                ("coordinator", [python, "-m", "app.jobs.coordinator"], ROOT / "backend"),
                ("io", [python, "-m", "app.jobs.io_worker"], ROOT / "backend"),
                ("api", [python, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], ROOT / "backend"),
                ("frontend", [shutil.which("node"), str(ROOT / "frontend/node_modules/vite/bin/vite.js"),
                              "--host", "127.0.0.1", "--port", "3000", "--strictPort"], ROOT / "frontend"),
            ]
            for role, command, cwd in commands:
                out = (RUNTIME / f"{role}.stdout.log").open("wb")
                err = (RUNTIME / f"{role}.stderr.log").open("wb")
                streams.extend((out, err))
                env = {**os.environ, "CHRONOCAMPUS_LOCAL_STOP_FILE": str(stop_file),
                       "CHRONOCAMPUS_LOCAL_LAUNCH_ID": launch}
                if role != "frontend":
                    env.update(WORKER_ROLE=role, WORKER_INSTANCE_ID=f"{launch}-{role}",
                               SQL_POOL_SIZE=str({"api": 5, "coordinator": 3, "io": 2}[role]))
                pid, handle = tree.spawn(command, cwd, env, out, err)
                children.append((role, handle))
                state["processes"].append({"role": role, **process_identity(pid)})
            _write_state(state)
            deadline = time.monotonic() + 30
            while not control.is_set():
                # Detailed events have rotated application logs; cap console captures.
                for stream in streams:
                    if os.fstat(stream.fileno()).st_size > 5_000_000:
                        stream.seek(0)
                        stream.truncate()
                for role, handle in children:
                    if tree.exited(handle):
                        raise RuntimeError(f"local_process_exited:{role}")
                if state["status"] == "starting":
                    if (_ready_url("http://127.0.0.1:8000/api/ready") and _ready_url("http://127.0.0.1:3000")
                            and _worker_ready(f"{launch}-coordinator") and _worker_ready(f"{launch}-io")):
                        state["status"] = "ready"
                        _write_state(state)
                    elif time.monotonic() >= deadline:
                        raise RuntimeError("local_readiness_timeout")
                time.sleep(0.2)
            state["status"] = "stopping"
            _write_state(state)
            stop_file.write_text("stop", encoding="ascii")
            # Workers may finish/abandon their current attempt cooperatively.
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and any(not tree.exited(handle) for role, handle in children if role in {"coordinator", "io"}):
                time.sleep(0.2)
            state["status"] = "stopped"
        except Exception as error:
            state["status"] = "failed"
            # Only our code-defined RuntimeError values are suitable for status.
            state["error"] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        finally:
            tree.close()
            control.close()
            for stream in streams:
                stream.close()
            _write_state(state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["start", "status", "stop", "supervise", "init-mail-key", "rotate-mail-key"])
    parser.add_argument("--launch-id", default="")
    args = parser.parse_args()
    if os.name != "nt":
        parser.error("The local supervisor currently supports Windows only.")
    if args.command == "supervise":
        supervise(args.launch_id)
        return
    try:
        if args.command in {"init-mail-key", "rotate-mail-key"}:
            from app.accounts.mail import init_keys, rotate_keys
            from app.core.config import get_settings
            action = init_keys if args.command == "init-mail-key" else rotate_keys
            action(get_settings().mail_keys_file)
            result = {"status": "configured", "operation": args.command}
        else:
            result = {"start": start, "status": status, "stop": stop}[args.command]()
        print(json.dumps(result, indent=2))
    except Exception as error:
        print(json.dumps({"status": "error", "error": str(error) if isinstance(error, RuntimeError) else type(error).__name__}))
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
