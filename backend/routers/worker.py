"""Phase 2.4 — Mobile Worker Experience"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from database import get_db
import models
from auth import get_current_user
from audit import log_action

router = APIRouter()


def _sv(s): return s.value if hasattr(s, "value") else str(s)


# ── GET /today ────────────────────────────────────────────────────────────────

@router.get("/today")
def worker_today(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = current_user.employee
    if not emp:
        return {"assignments": [], "clock_session": None, "recent_entries": []}

    today = date.today()

    assignments = db.query(models.ScheduleAssignment).filter(
        models.ScheduleAssignment.employee_id == emp.id,
        models.ScheduleAssignment.date == today,
        models.ScheduleAssignment.status != "removed",
    ).all()

    active_session = db.query(models.ClockSession).filter(
        models.ClockSession.employee_id == emp.id,
        models.ClockSession.status == "active",
    ).first()

    recent = db.query(models.TimeEntry).filter(
        models.TimeEntry.employee_id == emp.id,
    ).order_by(models.TimeEntry.date.desc()).limit(5).all()

    def _asgn(a):
        return {
            "id": a.id, "job_id": a.job_id,
            "job_number": a.job.job_number if a.job else "",
            "job_name": a.job.job_name if a.job else "",
            "job_address": f"{a.job.city}, {a.job.state}" if (a.job and a.job.city) else "",
            "planned_start_time": a.planned_start_time,
            "planned_end_time": a.planned_end_time,
            "planned_hours": a.planned_hours,
            "supervisor_name": f"{a.supervisor.first_name} {a.supervisor.last_name}" if a.supervisor else None,
            "notes": a.notes,
        }

    def _sess(s):
        return {
            "id": s.id, "job_id": s.job_id,
            "job_number": s.job.job_number if s.job else "",
            "job_name": s.job.job_name if s.job else "",
            "clock_in_time": s.clock_in_time,
            "status": _sv(s.status),
        }

    def _entry(e):
        return {
            "id": e.id, "date": e.date, "total_hours": e.total_hours,
            "job_number": e.job.job_number if e.job else "",
            "job_name": e.job.job_name if e.job else "",
            "status": _sv(e.status),
        }

    return {
        "assignments": [_asgn(a) for a in assignments],
        "clock_session": _sess(active_session) if active_session else None,
        "recent_entries": [_entry(e) for e in recent],
    }


# ── POST /clock-in ────────────────────────────────────────────────────────────

class ClockInRequest(BaseModel):
    job_id: int
    schedule_assignment_id: Optional[int] = None
    notes: Optional[str] = None


@router.post("/clock-in")
def clock_in(
    data: ClockInRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = current_user.employee
    if not emp:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    existing = db.query(models.ClockSession).filter(
        models.ClockSession.employee_id == emp.id,
        models.ClockSession.status == "active",
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Already clocked in. Clock out first.")

    job = db.query(models.Job).filter(models.Job.id == data.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    session = models.ClockSession(
        employee_id=emp.id,
        job_id=data.job_id,
        schedule_assignment_id=data.schedule_assignment_id,
        clock_in_time=datetime.now(),
        status="active",
        notes=data.notes,
    )
    db.add(session)
    db.flush()
    log_action(db, current_user.id, "clock_in",
               resource_type="clock_session", resource_id=session.id,
               new_value={"job_id": data.job_id, "time": datetime.now().isoformat()})
    db.commit()
    db.refresh(session)
    return {"id": session.id, "clock_in_time": session.clock_in_time,
            "job_name": job.job_name, "status": "active"}


# ── POST /clock-out ───────────────────────────────────────────────────────────

class ClockOutRequest(BaseModel):
    notes: Optional[str] = None


@router.post("/clock-out")
def clock_out(
    data: ClockOutRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = current_user.employee
    if not emp:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    session = db.query(models.ClockSession).filter(
        models.ClockSession.employee_id == emp.id,
        models.ClockSession.status == "active",
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="No active clock session found")

    now = datetime.now()
    session.clock_out_time = now
    session.status = "completed"
    if data.notes:
        session.notes = (session.notes or "") + f"\nOut: {data.notes}"

    # Calculate hours
    delta = (now - session.clock_in_time.replace(tzinfo=None)) if session.clock_in_time else None
    total_hours = round(delta.total_seconds() / 3600, 2) if delta else 0

    # Create a submitted time entry
    start_str = session.clock_in_time.strftime("%H:%M") if session.clock_in_time else None
    end_str = now.strftime("%H:%M")
    entry = models.TimeEntry(
        employee_id=emp.id,
        job_id=session.job_id,
        cost_code_id=db.query(models.CostCode).filter(models.CostCode.is_active == True).first().id,
        date=date.today(),
        start_time=start_str,
        end_time=end_str,
        total_hours=max(total_hours, 0.25),
        pay_type="Regular",
        notes=data.notes,
        status="submitted",
        sage_sync_status="not_ready",
    )
    db.add(entry)
    db.flush()

    log_action(db, current_user.id, "clock_out",
               resource_type="clock_session", resource_id=session.id,
               new_value={"total_hours": total_hours, "time_entry_id": entry.id})
    db.commit()
    return {"total_hours": total_hours, "time_entry_id": entry.id,
            "clock_in": session.clock_in_time, "clock_out": now}


# ── GET /recent-time ──────────────────────────────────────────────────────────

@router.get("/recent-time")
def recent_time(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = current_user.employee
    if not emp:
        return []
    entries = db.query(models.TimeEntry).filter(
        models.TimeEntry.employee_id == emp.id,
    ).order_by(models.TimeEntry.date.desc()).limit(10).all()
    return [{
        "id": e.id, "date": e.date, "total_hours": e.total_hours,
        "start_time": e.start_time, "end_time": e.end_time,
        "job_number": e.job.job_number if e.job else "",
        "job_name": e.job.job_name if e.job else "",
        "cost_code": e.cost_code.code if e.cost_code else "",
        "status": _sv(e.status), "notes": e.notes,
    } for e in entries]


# ── POST /request-correction ──────────────────────────────────────────────────

class CorrectionRequestCreate(BaseModel):
    time_entry_id: int
    reason: str
    requested_start_time: Optional[str] = None
    requested_end_time: Optional[str] = None
    requested_job_id: Optional[int] = None
    requested_notes: Optional[str] = None


@router.post("/request-correction")
def request_correction(
    data: CorrectionRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    emp = current_user.employee
    if not emp:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    entry = db.query(models.TimeEntry).filter(
        models.TimeEntry.id == data.time_entry_id,
        models.TimeEntry.employee_id == emp.id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found or not yours")

    # Check payroll lock
    from datetime import timedelta
    ws = entry.date - timedelta(days=entry.date.weekday())
    lock = db.query(models.PayrollLock).filter(
        models.PayrollLock.week_start == ws,
        models.PayrollLock.status == "locked",
    ).first()
    if lock:
        raise HTTPException(status_code=423,
            detail="Payroll week is locked. Contact your admin to make changes.")

    cr = models.CorrectionRequest(
        time_entry_id=data.time_entry_id,
        employee_id=emp.id,
        reason=data.reason,
        requested_start_time=data.requested_start_time,
        requested_end_time=data.requested_end_time,
        requested_job_id=data.requested_job_id,
        requested_notes=data.requested_notes,
        status="pending",
    )
    db.add(cr)
    db.flush()
    log_action(db, current_user.id, "correction_requested",
               resource_type="correction_request", resource_id=cr.id,
               new_value={"time_entry_id": data.time_entry_id, "reason": data.reason})
    db.commit()
    db.refresh(cr)
    return {"id": cr.id, "status": "pending",
            "time_entry_id": cr.time_entry_id, "reason": cr.reason}
