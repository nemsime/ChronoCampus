"""One local generation coordinator: python -m app.jobs.coordinator."""

import os
import uuid

from app.core.config import get_settings
from app.core.shutdown import shutdown_event
from app.db.session import get_engine
from app.jobs.generation import execute_claim
from app.jobs.queue import claim_job, recover_expired, worker_heartbeat
from app.observability import telemetry


def process_once(engine, instance_id, *, shutdown=None):
    recover_expired(engine, "generation")
    worker_heartbeat(engine, instance_id, "coordinator")
    claim = claim_job(engine, "generation", instance_id)
    if claim is None:
        return False
    worker_heartbeat(
        engine,
        instance_id,
        "coordinator",
        status="running",
        current_job_id=claim.job_id,
    )
    execute_claim(engine, claim, shutdown=shutdown)
    worker_heartbeat(engine, instance_id, "coordinator")
    return True


def main():
    settings = get_settings()
    instance = (
        settings.worker_instance_id or f"coordinator-{os.getpid()}-{uuid.uuid4().hex}"
    )
    telemetry.configure(settings.model_copy(update={"worker_role": "coordinator", "worker_instance_id": instance}))
    engine = get_engine()
    stop = shutdown_event()
    try:
        while not stop.is_set():
            if not process_once(engine, instance, shutdown=stop):
                stop.wait(min(5, max(1, settings.job_poll_seconds)))
    finally:
        worker_heartbeat(engine, instance, "coordinator", status="stopped")
        engine.dispose()


if __name__ == "__main__":
    main()
