import time
from collections import Counter
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.models import GenerationRun
from app.observability import telemetry as t


def run_view(run, detailed=True):
    result = run.result or {}
    report = result.get("report") or {}
    has_result = "assignments" in result and "report" in result
    placed = len(result["assignments"]) if has_result else None
    unplaced = len(report.get("unplaced_occurrences", [])) if has_result else None
    view = {
        key: getattr(run, key)
        for key in (
            "id",
            "version_id",
            "status",
            "algorithm",
            "seed",
            "input_hash",
            "comparison_hash",
            "source_revision",
            "created_at",
            "started_at",
            "updated_at",
            "finished_at",
            "request_id",
            "actor_id",
            "progress",
        )
    }
    finish = run.finished_at or datetime.utcnow()
    if run.status not in {"queued", "running"}:
        view["progress"] = {**(run.progress or {}), "stage": run.status}
    view["elapsed_seconds"] = (
        max(0, (finish - run.started_at).total_seconds())
        if run.started_at
        else result.get("elapsed_seconds")
    )
    view["queue_seconds"] = (
        max(0, ((run.started_at or finish) - run.created_at).total_seconds())
        if run.started_at or run.status == "queued"
        else None
    )
    view["summary"] = {
        "placed": placed,
        "unplaced": unplaced,
        "total": placed + unplaced if has_result else (run.progress or {}).get("total"),
        "complete": report.get("complete") if has_result else None,
        "issue_counts": dict(Counter(row["code"] for row in report.get("issues", []))),
        "reason_counts": dict(
            Counter(
                row["code"]
                for rows in result.get("diagnostics", {}).values()
                for row in rows
            )
        ),
    }
    # Do not return the snapshot or assignment payload through history endpoints.
    view["result"] = {
        key: result[key]
        for key in (
            "status",
            "error",
            "exception_type",
            "algorithm",
            "seed",
            "metrics",
            "phases",
            "elapsed_seconds",
            "preparation_seconds",
        )
        if key in result
    }
    if detailed:
        view["result"]["diagnostics"] = result.get("diagnostics", {})
        view["result"]["report"] = report
    return view


class Progress:
    """At most one DB update per second per stage; no domain revision changes."""

    def __init__(self, engine, run_id, version_id):
        self.engine, self.run_id, self.version_id = engine, run_id, version_id
        self.begin, self.last = time.perf_counter(), 0.0
        self.state = {"events": []}
        self.disabled = False

    def __call__(self, stage, **values):
        now = time.perf_counter()
        changed = stage != self.state.get("stage")
        self.state.update(
            {
                key: value
                for key, value in values.items()
                if key
                in {
                    "placed",
                    "total",
                    "candidate_count",
                    "objective",
                    "solver_status",
                    "preparation_seconds",
                }
            }
        )
        self.state.update(
            stage=stage,
            elapsed_seconds=round(now - self.begin, 3),
            updated_at=t.utc_now(),
        )
        if changed:
            self.state["events"] = (
                self.state["events"]
                + [
                    {
                        "stage": stage,
                        "elapsed_seconds": round(now - self.begin, 3),
                        "at": t.utc_now(),
                    }
                ]
            )[-60:]
        if self.disabled or (not changed and now - self.last < 1):
            return
        self.last = now
        try:
            with Session(self.engine) as db:
                row = db.get(GenerationRun, self.run_id)
                if row is None or row.status not in {"queued", "running"}:
                    return
                row.progress = dict(self.state)
                row.updated_at = datetime.utcnow()
                db.commit()
            if changed:
                t.emit(
                    "generation.stage",
                    run_id=self.run_id,
                    version_id=self.version_id,
                    stage=stage,
                    **{k: v for k, v in values.items() if k in t.FIELDS},
                )
        except Exception as error:
            self.disabled = True
            t.exception_event(
                "generation.progress_unavailable", error, run_id=self.run_id
            )
