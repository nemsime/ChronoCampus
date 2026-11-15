"""The same candidate validation powers manual moves and suggestion dry runs."""

from fastapi import HTTPException
from sqlalchemy import select

from app.calendar.rules import lesson_slot
from app.db import models as m
from app.scheduling.snapshot import build_snapshot, record
from app.scheduling.validation import validate


def move_candidate(db, version, occurrence_id, body):
    snapshot = build_snapshot(db, version)
    if occurrence_id not in {o["id"] for o in snapshot["occurrences"]}:
        raise HTTPException(422, "invalid_occurrence")
    try:
        start, end = lesson_slot(snapshot["calendar"], body.slot)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    moved = {
        "occurrence_id": occurrence_id,
        "day": body.day.isoformat(),
        "slot": body.slot,
        "room_id": body.room_id,
        "starts_at": start,
        "ends_at": end,
        "pinned": body.pinned,
        "cancelled": snapshot["term"]["holiday_policy"] == "exempt"
        and any(h["day"] == body.day.isoformat() for h in snapshot["holidays"]),
    }
    # The selected lesson may move/unpin; every other pin remains authoritative.
    snapshot["pins"] = [p for p in snapshot["pins"] if p["occurrence_id"] != occurrence_id]
    rows = list(db.scalars(select(m.Assignment).where(m.Assignment.version_id == version.id)))
    existing = next((a for a in rows if a.occurrence_id == occurrence_id), None)
    if moved["cancelled"] and not (existing and existing.cancelled and existing.day == body.day):
        raise HTTPException(409, "manual_holiday_move")
    candidates = [record(a) for a in rows if a.occurrence_id != occurrence_id] + [moved]
    report = validate(snapshot, candidates)
    blocking = [issue for issue in report["issues"]
                if issue["code"] != "configuration_unconfirmed"
                and ("occurrence_id" not in issue or occurrence_id in (
                    issue["occurrence_id"], issue.get("other_occurrence_id")))]
    return existing, moved, report, blocking
