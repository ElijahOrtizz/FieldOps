from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta, datetime
from database import get_db
import models
from auth import get_current_user, require_role
from audit import log_action

router = APIRouter()


def week_end_from_start(ws: date) -> date:
    return ws + timedelta(days=6)


def lock_to_dict(lock):
    return {
        "id": lock.id,
        "week_start": lock.week_start.strftime("%Y-%m-%d"),
        "week_end": lock.week_end.strftime("%Y-%m-%d"),
        "status": lock.status,
        "notes": lock.notes,
        "locked_by": lock.locked_by.email if lock.locked_by else None,
        "locked_at": lock.locked_at,
        "unlocked_by": lock.unlocked_by.email if lock.unlocked_by else None,
        "unlocked_at": lock.unlocked_at,
    }


def get_lock_for_week(db: Session, week_start: date):
    return db.query(models.PayrollLock).filter(
        models.PayrollLock.week_start == week_start,
        models.PayrollLock.status == "locked"
    ).first()


class LockRequest(BaseModel):
    week_start: date
    notes: Optional[str] = None
    force: Optional[bool] = False  # force-lock even if pending entries exist


class UnlockRequest(BaseModel):
    week_start: date
    notes: Optional[str] = None


@router.get("/")
def list_locks(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin", "supervisor"))
):
    locks = db.query(models.PayrollLock).order_by(models.PayrollLock.week_start.desc()).all()
    return [lock_to_dict(l) for l in locks]


@router.get("/check")
def check_week_lock(
    week_start: date,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Check if a given week is locked. Returns {locked: bool, lock: ...}."""
    lock = get_lock_for_week(db, week_start)
    return {"locked": lock is not None, "lock": lock_to_dict(lock) if lock else None}


@router.post("/lock")
def lock_week(
    data: LockRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    existing = get_lock_for_week(db, data.week_start)
    if existing:
        raise HTTPException(status_code=400, detail="Week is already locked")

    # Check for pending (submitted / needs_correction) entries
    from datetime import timedelta
    week_end = data.week_start + timedelta(days=6)
    pending_count = db.query(models.TimeEntry).filter(
        models.TimeEntry.date >= data.week_start,
        models.TimeEntry.date <= week_end,
        models.TimeEntry.status.in_(["submitted", "needs_correction"])
    ).count()

    if pending_count > 0 and not data.force:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot lock: {pending_count} entr{'y' if pending_count == 1 else 'ies'} still pending approval. "
                   f"Approve or reject them first, or use force=true to lock anyway."
        )

    lock = models.PayrollLock(
        week_start=data.week_start,
        week_end=week_end_from_start(data.week_start),
        locked_by_id=current_user.id,
        status="locked",
        notes=data.notes,
    )
    db.add(lock)
    log_action(db, current_user.id, "payroll_locked",
               resource_type="payroll_lock",
               new_value={"week_start": str(data.week_start)},
               note=(data.notes or "") + (f" [force-locked with {pending_count} pending]" if (data.force and pending_count > 0) else "") or f"Locked week of {data.week_start}")
    db.commit()
    db.refresh(lock)
    return lock_to_dict(lock)


@router.post("/unlock")
def unlock_week(
    data: UnlockRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    lock = get_lock_for_week(db, data.week_start)
    if not lock:
        raise HTTPException(status_code=404, detail="No active lock found for this week")

    lock.status = "unlocked"
    lock.unlocked_by_id = current_user.id
    lock.unlocked_at = datetime.now()
    lock.notes = data.notes or lock.notes

    log_action(db, current_user.id, "payroll_unlocked",
               resource_type="payroll_lock", resource_id=lock.id,
               new_value={"week_start": str(data.week_start)},
               note=f"Unlocked week of {data.week_start}")
    db.commit()
    db.refresh(lock)
    return lock_to_dict(lock)
