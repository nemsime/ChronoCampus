"""Cooperative signal/file shutdown used by the owning local supervisor."""
import os
from pathlib import Path
import signal
import threading


def shutdown_event():
    stop = threading.Event()
    for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), lambda *_: stop.set())
    filename = os.getenv("CHRONOCAMPUS_LOCAL_STOP_FILE")
    if filename:
        path = Path(filename)

        def watch():
            while not stop.wait(0.2):
                if path.is_file():
                    stop.set()

        threading.Thread(target=watch, name="local-shutdown", daemon=True).start()
    return stop
