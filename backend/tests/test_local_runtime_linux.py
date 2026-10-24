import json
import os
from pathlib import Path
import subprocess
import sys
import time

import pytest

from app import local_runtime as runtime
from app.core import windows_processes
from app.core.windows_processes import ProcessTree, process_identity

pytestmark = pytest.mark.skipif(sys.platform != "linux", reason="Linux launcher acceptance")


def wait_for_file(path, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.is_file():
            try:
                return json.loads(path.read_text())
            except json.JSONDecodeError:
                # Creation can be observed before the helper finishes writing.
                pass
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


def test_linux_process_identity_and_process_group_cleanup(tmp_path):
    ready = tmp_path / "child.json"
    child_code = (
        "import subprocess,sys,json,time; from pathlib import Path; "
        "p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); "
        f"Path({str(ready)!r}).write_text(json.dumps({{'grandchild':p.pid}})); time.sleep(60)"
    )
    tree = ProcessTree()
    try:
        with (tmp_path / "stdout").open("wb") as out, (tmp_path / "stderr").open("wb") as err:
            pid, process = tree.spawn([sys.executable, "-c", child_code], tmp_path, os.environ.copy(), out, err)
            grandchild = wait_for_file(ready)["grandchild"]
            identity = process_identity(pid)
            assert identity and identity["pid"] == pid
            assert process.poll() is None
            assert process_identity(grandchild)
    finally:
        tree.close()
    wait_dead(pid)
    wait_dead(grandchild)


def test_linux_stop_event_uses_launch_specific_file(monkeypatch, tmp_path):
    marker = tmp_path / "stop.flag"
    monkeypatch.setattr(windows_processes, "_linux_stop_file", lambda _name: marker)
    name = "Local\\ChronoCampus-" + "a" * 32
    event = windows_processes.StopEvent(name)
    assert not event.is_set()
    assert windows_processes.StopEvent.signal(name)
    assert event.is_set()
    event.close()


@pytest.mark.parametrize("leader_exits", [False, True])
def test_linux_cleanup_kills_stubborn_descendants_after_leader_exit(tmp_path, leader_exits):
    ready = tmp_path / "descendant.json"
    descendant_code = (
        "import os,signal,time,json; from pathlib import Path; "
        "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
        f"Path({str(ready)!r}).write_text(json.dumps({{'pid':os.getpid()}})); time.sleep(60)"
    )
    leader_code = (
        "import subprocess,sys,time; "
        f"subprocess.Popen([sys.executable,'-c',{descendant_code!r}]); "
        + ("sys.exit(0)" if leader_exits else "time.sleep(60)")
    )
    tree = ProcessTree()
    descendant = None
    try:
        with (tmp_path / "output.log").open("wb") as output:
            _, handle = tree.spawn([sys.executable, "-c", leader_code], tmp_path,
                                   os.environ.copy(), output, output)
            descendant = wait_for_file(ready)["pid"]
            if leader_exits:
                deadline = time.monotonic() + 5
                while not tree.exited(handle) and time.monotonic() < deadline:
                    time.sleep(0.05)
                assert tree.exited(handle)
    finally:
        tree.close()
    assert descendant is not None
    wait_dead(descendant)


def test_linux_runtime_lock_rejects_a_second_owner(monkeypatch, tmp_path):
    isolate_runtime(monkeypatch, tmp_path)
    with runtime.exclusive("start.lock"):
        with pytest.raises(RuntimeError, match="already_starting"):
            with runtime.exclusive("start.lock"):
                pytest.fail("second lock acquired")


def test_linux_child_exits_when_supervisor_dies(tmp_path):
    ready = tmp_path / "child.json"
    helper = tmp_path / "owner.py"
    helper.write_text(
        "from app.core.windows_processes import ProcessTree\n"
        "import os,sys,time,json\n"
        "tree=ProcessTree()\n"
        f"out=open({str(tmp_path / 'child.log')!r},'wb')\n"
        "pid,process=tree.spawn([sys.executable,'-c','import time;time.sleep(60)'],"
        "os.getcwd(),os.environ.copy(),out,out)\n"
        f"open({str(ready)!r},'w').write(json.dumps({{'child':pid}}))\n"
        "time.sleep(60)\n"
    )
    environment = {**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])}
    with (tmp_path / "owner.log").open("wb") as output:
        owner = subprocess.Popen([sys.executable, str(helper)], env=environment, stdout=output, stderr=output)
        try:
            child = wait_for_file(ready)["child"]
            assert process_identity(child)
            owner.kill()
            owner.wait(timeout=5)
            wait_dead(child)
        finally:
            if owner.poll() is None:
                owner.kill()
                owner.wait(timeout=5)


def test_linux_partial_start_rolls_back_owned_children(monkeypatch, tmp_path):
    isolate_runtime(monkeypatch, tmp_path)
    monkeypatch.setattr(runtime, "_check_ports", lambda: None)
    original = ProcessTree.spawn
    created = []

    def fail_second(tree, arguments, cwd, environment, stdout, stderr):
        if created:
            raise OSError("simulated second-process startup failure")
        result = original(tree, [sys.executable, "-c", "import time; time.sleep(60)"],
                         tmp_path, environment, stdout, stderr)
        created.append(result[0])
        return result

    monkeypatch.setattr(windows_processes, "_linux_stop_file",
                        lambda _name: tmp_path / ".runtime" / "stop.flag")
    monkeypatch.setattr(ProcessTree, "spawn", fail_second)
    runtime.supervise("a" * 32)
    assert runtime._read_state()["status"] == "failed"
    assert runtime._read_state()["error"] == "OSError"
    wait_dead(created[0])
