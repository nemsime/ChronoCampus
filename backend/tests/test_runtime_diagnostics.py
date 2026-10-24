from datetime import timedelta

from app.jobs.models import WorkerHeartbeat
from app.jobs.queue import database_now, enqueue_job


def test_durable_jobs_view_is_private_bounded_and_has_no_payload(admin_client, database):
    job = enqueue_job(database, "mail", {"token": "never-expose", "email": "secret@example.invalid"})
    database.add(WorkerHeartbeat(instance_id="qa-io", role="io", pid=123,
        last_seen_at=database_now(database) - timedelta(seconds=120), status="busy", current_job_id=job.id))
    database.commit()
    response = admin_client.get("/api/admin/diagnostics/jobs")
    assert response.status_code == 200
    assert "no-store" in response.headers["cache-control"]
    body = response.json()
    assert body["queues"]["mail"]["queued"] == 1
    assert body["workers"][0]["stale"] is True
    assert body["workers"][0]["current_job_id"] == job.id
    assert "never-expose" not in response.text and "secret@example.invalid" not in response.text
    admin_client.post("/api/auth/logout")
    assert admin_client.get("/api/admin/diagnostics/jobs").status_code == 401
