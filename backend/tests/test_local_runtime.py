import json
import os
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4

import pytest

from app import local_runtime as runtime
from app.core.windows_processes import ProcessTree, process_identity

pytestmark = pytest.mark.skipif(os.name != "nt", reason="Native Windows launcher acceptance")


def wait_json(path, timeout=8):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            return json.loads(path.read_text())
        except (OSError, ValueError):
            time.sleep(0.05)
    raise AssertionError("Child did not become ready")


def wait_dead(pid, timeout=5):
    deadline = time.monotonic() + timeout
    while process_identity(pid) is not None and time.monotonic() < deadline:
        time.sleep(0.05)
    assert process_identity(pid) is None


def isolate_runtime(monkeypatch, tmp_path):
    monkeypatch.setattr(runtime, "ROOT", tmp_path)
    monkeypatch.setattr(runtime, "RUNTIME", tmp_path / ".runtime")
    monkeypatch.setattr(runtime, "STATE", tmp_path / ".runtime/state.json")
    runtime.RUNTIME.mkdir()


def test_reused_pid_does_not_authorize_stop(monkeypatch, tmp_path):
    isolate_runtime(monkeypatch, tmp_path)
    identity = process_identity(os.getpid())
    identity["created"] = str(int(identity["created"]) - 1)
    state = {"root": str(tmp_path), "launch_id": uuid4().hex, "status": "ready", "supervisor": identity}
    runtime._write_state(state)
    monkeypatch.setattr(runtime.StopEvent, "signal", lambda name: pytest.fail("must not signal an unowned process"))
    assert runtime.stop()["status"] == "stopped"
    assert process_identity(os.getpid()) is not None


def test_foreign_port_owner_is_preserved(monkeypatch, tmp_path):
    import socket

    isolate_runtime(monkeypatch, tmp_path)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        monkeypatch.setattr(runtime, "PORTS", {"api": listener.getsockname()[1]})
        monkeypatch.setattr(runtime, "_preflight", lambda: pytest.fail("port check must run first"))
        with pytest.raises(RuntimeError, match="port_in_use"):
            runtime.start()
        assert listener.fileno() >= 0


def test_exclusive_start_and_idempotent_stopped_state(monkeypatch, tmp_path):
    isolate_runtime(monkeypatch, tmp_path)
    with runtime.exclusive("start.lock"):
        with pytest.raises(RuntimeError, match="already_starting"):
            with runtime.exclusive("start.lock"):
                pytest.fail("second lock acquired")
    assert runtime.stop()["status"] == "stopped"
    assert runtime.stop()["status"] == "stopped"


def test_closing_job_terminates_child_and_grandchild(tmp_path):
    ready = tmp_path / "child.json"
    child_code = (
        "import subprocess,sys,json,time; from pathlib import Path; "
        "p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); "
        f"Path({str(ready)!r}).write_text(json.dumps({{'grandchild':p.pid}})); time.sleep(60)"
    )
    tree = ProcessTree()
    try:
        with (tmp_path / "stdout").open("wb") as out, (tmp_path / "stderr").open("wb") as err:
            pid, _ = tree.spawn([sys.executable, "-c", child_code], tmp_path, os.environ.copy(), out, err)
            result = wait_json(ready)
            assert process_identity(pid)
            assert process_identity(result["grandchild"])
    finally:
        tree.close()
    wait_dead(pid)
    wait_dead(result["grandchild"])


def test_parent_hard_death_terminates_owned_tree(tmp_path):
    ready = tmp_path / "owned.json"
    helper = tmp_path / "owner.py"
    helper.write_text(
        "from app.core.windows_processes import ProcessTree\n"
        "from pathlib import Path\nimport os,sys,json,time\n"
        "tree=ProcessTree()\n"
        f"out=open({str(tmp_path / 'child.log')!r}, 'wb')\n"
        "pid,handle=tree.spawn([sys.executable,'-c','import time; time.sleep(60)'],Path.cwd(),os.environ.copy(),out,out)\n"
        f"Path({str(ready)!r}).write_text(json.dumps({{'child':pid}}))\n"
        "time.sleep(60)\n"
    )
    environment = {**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])}
    # Use the base executable to kill the actual helper, not a venv redirector.
    with (tmp_path / "owner.log").open("wb") as output:
        parent = subprocess.Popen([sys._base_executable, str(helper)], env=environment,
                                  stdout=output, stderr=output, creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            child = wait_json(ready)["child"]
            assert process_identity(child)
            parent.kill()
            parent.wait(timeout=5)
            wait_dead(child)
        finally:
            if parent.poll() is None:
                parent.kill()
                parent.wait(timeout=5)


def test_partial_start_rolls_back_only_owned_children(monkeypatch, tmp_path):
    isolate_runtime(monkeypatch, tmp_path)
    monkeypatch.setattr(runtime, "_check_ports", lambda: None)
    original = ProcessTree.spawn
    created = []

    def fail_second(tree, arguments, cwd, environment, stdout, stderr):
        if created:
            raise OSError("simulated second-process startup failure")
        result = original(tree, [sys._base_executable, "-c", "import time; time.sleep(60)"],
                          tmp_path, environment, stdout, stderr)
        created.append(result[0])
        return result

    monkeypatch.setattr(ProcessTree, "spawn", fail_second)
    runtime.supervise(uuid4().hex)
    assert runtime._read_state()["status"] == "failed"
    assert runtime._read_state()["error"] == "OSError"
    wait_dead(created[0])
    assert process_identity(os.getpid()) is not None


def test_parent_death_before_create_returns_cannot_orphan_suspended_child(tmp_path):
    ready = tmp_path / "created.json"
    helper = tmp_path / "creation-owner.py"
    helper.write_text(
        "import ctypes,os,sys,time,json\nfrom pathlib import Path\n"
        "from app.core import windows_processes as wp\n"
        "original=wp._kernel\n"
        "class Kernel:\n"
        " def __init__(self): self.real=original()\n"
        " def __getattr__(self,name): return getattr(self.real,name)\n"
        " def CreateProcessW(self,*args):\n"
        "  result=self.real.CreateProcessW(*args)\n"
        "  if result:\n"
        "   info=ctypes.cast(args[-1],ctypes.POINTER(wp._ProcessInfo)).contents\n"
        f"   Path({str(ready)!r}).write_text(json.dumps({{'child':info.pid}}))\n"
        "   time.sleep(60)\n"
        "  return result\n"
        "wp._kernel=Kernel\ntree=wp.ProcessTree()\n"
        f"out=open({str(tmp_path / 'child.log')!r},'wb')\n"
        "tree.spawn([sys.executable,'-c','import time;time.sleep(60)'],Path.cwd(),os.environ.copy(),out,out)\n"
    )
    environment = {**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])}
    with (tmp_path / "creation-owner.log").open("wb") as output:
        parent = subprocess.Popen([sys._base_executable, str(helper)], env=environment,
            stdout=output, stderr=output, creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            child = wait_json(ready)["child"]
            assert process_identity(child)
            parent.kill()
            parent.wait(timeout=5)
            wait_dead(child)
        finally:
            if parent.poll() is None:
                parent.kill()
                parent.wait(timeout=5)
