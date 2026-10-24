"""Credential-free CPU entrypoint; deliberately imports no DB or application settings."""

import json
import os
import signal
import struct
import sys
from pathlib import Path

INPUT_LIMIT = 16 * 1024 * 1024
OUTPUT_LIMIT = 64 * 1024 * 1024


def read_exact(stream, size):
    chunks = bytearray()
    while len(chunks) < size:
        part = stream.read(size - len(chunks))
        if not part:
            raise EOFError("truncated_frame")
        chunks.extend(part)
    return bytes(chunks)


def read_frame(stream, maximum):
    size = struct.unpack("!I", read_exact(stream, 4))[0]
    if size > maximum:
        raise ValueError("frame_too_large")
    return json.loads(read_exact(stream, size))


def write_frame(stream, value, maximum):
    data = json.dumps(value, ensure_ascii=True, allow_nan=False).encode("utf-8")
    if len(data) > maximum:
        raise ValueError("frame_too_large")
    stream.write(struct.pack("!I", len(data)))
    stream.write(data)
    stream.flush()


def main():
    expected_parent, memory_mb = map(int, sys.argv[1:3])
    if sys.platform == "linux":
        import ctypes
        import resource

        if ctypes.CDLL(None).prctl(1, signal.SIGKILL) != 0:
            raise RuntimeError("parent_death_protection_failed")
        if os.getppid() != expected_parent:
            return
        resource.setrlimit(resource.RLIMIT_AS, (memory_mb * 1024**2,) * 2)
    # On Windows no imports/work happen until the parent assigns its Job Object
    # and sends input. A failed assignment closes stdin or terminates this child.
    request = read_frame(sys.stdin.buffer, INPUT_LIMIT)
    if request.get("protocol_version") != 1:
        raise ValueError("unsupported_protocol")
    sys.path.insert(0, sys.argv[3])
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from app.scheduling.solver import generate

    def progress(stage, **values):
        write_frame(
            sys.stdout.buffer,
            {"type": "progress", "stage": stage, "values": values},
            8192,
        )

    result = generate(
        request["snapshot"],
        request["algorithm"],
        request["seed"],
        request["search_seconds"],
        progress=progress,
    )
    write_frame(sys.stdout.buffer, {"type": "result", "result": result}, OUTPUT_LIMIT)


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 - redact CPU child failures at process boundary
        # No snapshot, environment or arbitrary exception messages in the protocol.
        try:
            write_frame(
                sys.stdout.buffer,
                {"type": "error", "code": "solver_child_failed"},
                8192,
            )
        except Exception:  # noqa: BLE001, S110 - pipe already closed; no private stderr
            pass
        sys.exit(1)
