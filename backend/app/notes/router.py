
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, literal, select
from sqlalchemy.orm import Session

from app.accounts.dependencies import current_user
from app.accounts.roles import DEAN
from app.db import models as m
from app.db.session import get_db, lock_revision
from app.db.utc import utc_now
from app.scheduling import queries as q
from app.scheduling.snapshot import record

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteInput(BaseModel):
    content: str = Field(min_length=1, max_length=10000)


@router.get("")
def notes(account: m.Account = Depends(current_user), db: Session = Depends(get_db)):
    return [
        record(n)
        for n in db.scalars(
            select(m.Note)
            .where(m.Note.user_id == account.id)
            .order_by(m.Note.updated_at.desc())
        )
    ]


@router.put("/{occurrence_id}")
def save_note(
    occurrence_id: int,
    body: NoteInput,
    account: m.Account = Depends(current_user),
    db: Session = Depends(get_db),
):
    if account.role == DEAN:
        raise HTTPException(404, "lesson_not_found")
    lock_revision(db, changed=False)
    scope = q.account_scope(account, db)
    # Bounded authorization and existing note lookup share a single SELECT.
    row = db.execute(
        select(literal(1), m.Note)
        .select_from(q.source(scope).outerjoin(m.Note, and_(
            m.Note.user_id == account.id, m.Note.occurrence_id == q.A.c.occurrence_id
        )))
        .where(q.A.c.occurrence_id == occurrence_id, q.authorized(scope)).limit(1)
    ).first()
    if row is None:
        raise HTTPException(404, "lesson_not_found")
    note = row[1]
    if not note:
        note = m.Note(user_id=account.id, occurrence_id=occurrence_id)
        db.add(note)
    note.content = body.content
    note.updated_at = utc_now()
    db.commit()
    return record(note)


@router.delete("/{identifier}", status_code=204)
def delete_note(
    identifier: int,
    account: m.Account = Depends(current_user),
    db: Session = Depends(get_db),
):
    note = db.get(m.Note, identifier)
    if not note or note.user_id != account.id:
        raise HTTPException(404, "note_not_found")
    db.delete(note)
    db.commit()
