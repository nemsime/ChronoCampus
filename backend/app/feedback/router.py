from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.dependencies import administrator, current_user
from app.db import models as m
from app.db.session import get_db, lock_revision
from app.scheduling.snapshot import record
from app.observability.audit import record_audit

router = APIRouter(prefix="/feedback", tags=["feedback"])


class MessageInput(BaseModel):
    content: str = Field(min_length=1, max_length=10000)


class ThreadInput(MessageInput):
    subject: str = Field(min_length=1, max_length=150)


class StatusInput(BaseModel):
    status: Literal["new", "in_progress", "closed"]


def thread_for(db, identifier, account):
    thread = db.get(m.Feedback, identifier)
    if not thread or account.role != "admin" and thread.user_id != account.id:
        raise HTTPException(404, "thread_not_found")
    return thread


def thread_view(db, thread):
    return {
        **record(thread),
        "messages": [
            record(mes)
            for mes in db.scalars(
                select(m.FeedbackMessage)
                .where(m.FeedbackMessage.thread_id == thread.id)
                .order_by(m.FeedbackMessage.id)
            )
        ],
    }


@router.get("")
def threads(account: m.Account = Depends(current_user), db: Session = Depends(get_db)):
    statement = select(m.Feedback).order_by(m.Feedback.created_at.desc())
    if account.role != "admin":
        statement = statement.where(m.Feedback.user_id == account.id)
    return [thread_view(db, t) for t in db.scalars(statement)]


@router.post("", status_code=201)
def create_thread(
    body: ThreadInput,
    account: m.Account = Depends(current_user),
    db: Session = Depends(get_db),
):
    thread = m.Feedback(user_id=account.id, subject=body.subject)
    db.add(thread)
    db.flush()
    db.add(
        m.FeedbackMessage(
            thread_id=thread.id, author_id=account.id, content=body.content
        )
    )
    db.commit()
    return thread_view(db, thread)


@router.post("/{identifier}/messages", status_code=201)
def reply(
    identifier: int,
    body: MessageInput,
    account: m.Account = Depends(current_user),
    db: Session = Depends(get_db),
):
    lock_revision(db, changed=False)
    thread = thread_for(db, identifier, account)
    if thread.status == "closed":
        raise HTTPException(409, "thread_closed")
    db.add(
        m.FeedbackMessage(
            thread_id=thread.id, author_id=account.id, content=body.content
        )
    )
    db.commit()
    return thread_view(db, thread)


@router.put("/{identifier}/status")
def status(
    identifier: int,
    body: StatusInput,
    account: m.Account = Depends(administrator),
    db: Session = Depends(get_db),
):
    lock_revision(db, changed=False)
    thread = thread_for(db, identifier, account)
    previous_status = thread.status
    thread.status = body.status
    record_audit(db, account, "feedback.status_changed", "feedback", identifier,
                 before={"status": previous_status}, after={"status": body.status})
    db.commit()
    return thread_view(db, thread)
