from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.dependencies import current_user
from app.db import models as m
from app.db.session import get_db, lock_revision
from app.scheduling.router import readable
from app.scheduling.snapshot import current_assignments, record

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
    if not any(
        a.occurrence_id == occurrence_id and readable(account, c)
        for a, c in current_assignments(db)
    ):
        raise HTTPException(404, "lesson_not_found")
    lock_revision(db, changed=False)
    note = db.scalar(
        select(m.Note).where(
            m.Note.user_id == account.id, m.Note.occurrence_id == occurrence_id
        )
    )
    if not note:
        note = m.Note(user_id=account.id, occurrence_id=occurrence_id)
        db.add(note)
    note.content = body.content
    note.updated_at = datetime.utcnow()
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
