"""Phase 2.5 — Supervisor Daily Review"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from database import get_db
import models
from auth import get_current_user, require_role
from audit import log_action

router = APIRouter()


def _sv(s): return s.value if hasattr(s, "value") else str(s)


# ── GET /daily-review ─────────────────────────────────────────────────────────

@router.get("/daily-review")
def daily_review(
    review_date: Optional[date] = None,
    job_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin")),
):
    today = review_date or date.today()

    # Scope to crew for supervisors
    crew_ids = None
    if current_user.role == "supervisor":
        emp = current_user.employee
        if emp:
            crew_ids = [e.id for e in db.query(models.Employee).filter(
                models.Employee.supervisor_id == emp.id).all()]
            crew_ids.append(emp.id)

    def _scope_emp(q, col):
        if employee_id:
            return q.filter(col == employee_id)
        if crew_ids is not None:
            return q.filter(col.in_(crew_ids))
        return q

    # Schedule assignments for today
    aq = _scope_emp(
        db.query(models.ScheduleAssignment).filter(
            models.ScheduleAssignment.date == today,
            models.ScheduleAssignment.status != "removed",
        ), models.ScheduleAssignment.employee_id)
    if job_id:
        aq = aq.filter(models.ScheduleAssignment.job_id == job_id)
    assignments = aq.all()

    # Time entries for today
    tq = _scope_emp(
        db.query(models.TimeEntry).filter(models.TimeEntry.date == today),
        models.TimeEntry.employee_id)
    if job_id:
        tq = tq.filter(models.TimeEntry.job_id == job_id)
    entries = tq.all()

    # Active clock sessions
    cq = _scope_emp(
        db.query(models.ClockSession).filter(
            models.ClockSession.status == "active"),
        models.ClockSession.employee_id)
    sessions = cq.all()

    # Pending correction requests for today's entries
    entry_ids = [e.id for e in entries]
    corrections = db.query(models.CorrectionRequest).filter(
        models.CorrectionRequest.time_entry_id.in_(entry_ids),
        models.CorrectionRequest.status == "pending",
    ).all() if entry_ids else []

    # Existing signoff for today
    sup_emp = current_user.employee
    signoff = db.query(models.DailySignoff).filter(
        models.DailySignoff.date == today,
        models.DailySignoff.supervisor_id == (sup_emp.id if sup_emp else -1),
        models.DailySignoff.job_id == job_id,
    ).first() if sup_emp else None

    # Variance flags (scheduled vs actual)
    sched_emp_ids = {a.employee_id for a in assignments}
    entry_emp_ids = {e.employee_id for e in entries}
    missing = sched_emp_ids - entry_emp_ids
    unscheduled = entry_emp_ids - sched_emp_ids

    def _asgn(a):
        return {"id": a.id, "employee_id": a.employee_id,
                "employee_name": f"{a.employee.first_name} {a.employee.last_name}" if a.employee else "",
                "job_id": a.job_id, "job_number": a.job.job_number if a.job else "",
                "job_name": a.job.job_name if a.job else "",
                "planned_start": a.planned_start_time, "planned_end": a.planned_end_time,
                "planned_hours": a.planned_hours, "role": a.role, "status": _sv(a.status)}

    def _entry(e):
        return {"id": e.id, "employee_id": e.employee_id,
                "employee_name": f"{e.employee.first_name} {e.employee.last_name}" if e.employee else "",
                "job_id": e.job_id, "job_number": e.job.job_number if e.job else "",
                "hours": e.total_hours, "start_time": e.start_time, "end_time": e.end_time,
                "status": _sv(e.status), "notes": e.notes}

    def _sess(s):
        return {"id": s.id, "employee_id": s.employee_id,
                "employee_name": f"{s.employee.first_name} {s.employee.last_name}" if s.employee else "",
                "job_id": s.job_id, "job_number": s.job.job_number if s.job else "",
                "clock_in_time": s.clock_in_time}

    def _cr(c):
        return {"id": c.id, "employee_id": c.employee_id, "time_entry_id": c.time_entry_id,
                "reason": c.reason, "status": _sv(c.status)}

    return {
        "date": today.isoformat(),
        "signoff": {"id": signoff.id, "status": _sv(signoff.status),
                    "signed_off_at": signoff.signed_off_at} if signoff else None,
        "assignments": [_asgn(a) for a in assignments],
        "time_entries": [_entry(e) for e in entries],
        "active_clock_sessions": [_sess(s) for s in sessions],
        "pending_corrections": [_cr(c) for c in corrections],
        "variance": {
            "missing_timecard_employee_ids": list(missing),
            "unscheduled_employee_ids": list(unscheduled),
        },
    }


# ── Quick approve/reject/needs-correction on time entries ──────────────────────

class ActionNote(BaseModel):
    notes: Optional[str] = None


@router.post("/time-entries/{entry_id}/approve")
def supervisor_approve(entry_id: int, data: ActionNote = ActionNote(),
                       db: Session = Depends(get_db),
                       current_user: models.User = Depends(require_role("supervisor", "admin"))):
    from routers.time_entries import approve_entry, QuickActionRequest
    return approve_entry(entry_id, QuickActionRequest(notes=data.notes), db, current_user)


@router.post("/time-entries/{entry_id}/reject")
def supervisor_reject(entry_id: int, data: ActionNote = ActionNote(),
                      db: Session = Depends(get_db),
                      current_user: models.User = Depends(require_role("supervisor", "admin"))):
    from routers.time_entries import reject_entry, QuickActionRequest
    return reject_entry(entry_id, QuickActionRequest(notes=data.notes), db, current_user)


@router.post("/time-entries/{entry_id}/needs-correction")
def supervisor_needs_correction(entry_id: int, data: ActionNote = ActionNote(),
                                db: Session = Depends(get_db),
                                current_user: models.User = Depends(require_role("supervisor", "admin"))):
    from routers.time_entries import needs_correction, QuickActionRequest
    return needs_correction(entry_id, QuickActionRequest(notes=data.notes), db, current_user)


# ── POST /mark-absent ─────────────────────────────────────────────────────────

class MarkAbsentRequest(BaseModel):
    employee_id: int
    assignment_id: int
    notes: Optional[str] = None


@router.post("/mark-absent")
def mark_absent(
    data: MarkAbsentRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin")),
):
    a = db.query(models.ScheduleAssignment).filter(
        models.ScheduleAssignment.id == data.assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    a.status = "missed"
    log_action(db, current_user.id, "marked_absent",
               resource_type="schedule_assignment", resource_id=data.assignment_id,
               note=data.notes or "Marked absent by supervisor")
    db.commit()
    return {"message": "Marked absent", "assignment_id": data.assignment_id}


# ── POST /correction-requests/:id/approve|reject ──────────────────────────────

class CRActionRequest(BaseModel):
    notes: Optional[str] = None
    apply_changes: Optional[bool] = False  # if True, apply requested changes to time entry


@router.post("/correction-requests/{cr_id}/approve")
def approve_correction(
    cr_id: int, data: CRActionRequest = CRActionRequest(),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin")),
):
    cr = db.query(models.CorrectionRequest).filter(models.CorrectionRequest.id == cr_id).first()
    if not cr:
        raise HTTPException(status_code=404, detail="Correction request not found")

    cr.status = "approved"
    cr.reviewed_by_id = current_user.id
    cr.review_notes = data.notes

    if data.apply_changes:
        entry = cr.time_entry
        if entry:
            # Check payroll lock before applying any changes to the time entry
            from datetime import timedelta
            ws = entry.date - timedelta(days=entry.date.weekday())
            lock = db.query(models.PayrollLock).filter(
                models.PayrollLock.week_start == ws,
                models.PayrollLock.status == "locked"
            ).first()
            if lock:
                raise HTTPException(status_code=423,
                    detail="Payroll week is locked. Unlock payroll before applying correction changes.")
            if cr.requested_start_time:
                entry.start_time = cr.requested_start_time
            if cr.requested_end_time:
                entry.end_time = cr.requested_end_time
            if cr.requested_job_id:
                entry.job_id = cr.requested_job_id
            if cr.requested_notes:
                entry.notes = cr.requested_notes

    log_action(db, current_user.id, "correction_approved",
               resource_type="correction_request", resource_id=cr_id, note=data.notes)
    db.commit()
    return {"id": cr_id, "status": "approved"}


@router.post("/correction-requests/{cr_id}/reject")
def reject_correction(
    cr_id: int, data: CRActionRequest = CRActionRequest(),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin")),
):
    cr = db.query(models.CorrectionRequest).filter(models.CorrectionRequest.id == cr_id).first()
    if not cr:
        raise HTTPException(status_code=404, detail="Correction request not found")
    cr.status = "rejected"
    cr.reviewed_by_id = current_user.id
    cr.review_notes = data.notes
    log_action(db, current_user.id, "correction_rejected",
               resource_type="correction_request", resource_id=cr_id, note=data.notes)
    db.commit()
    return {"id": cr_id, "status": "rejected"}


# ── POST /daily-signoff ───────────────────────────────────────────────────────

class SignoffRequest(BaseModel):
    date: date
    job_id: Optional[int] = None
    notes: Optional[str] = None
    reopen: Optional[bool] = False


@router.post("/daily-signoff")
def daily_signoff(
    data: SignoffRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin")),
):
    emp = current_user.employee
    if not emp:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    existing = db.query(models.DailySignoff).filter(
        models.DailySignoff.date == data.date,
        models.DailySignoff.supervisor_id == emp.id,
        models.DailySignoff.job_id == data.job_id,
    ).first()

    if existing:
        if data.reopen:
            existing.status = "reopened"
            existing.notes = data.notes
            log_action(db, current_user.id, "daily_signoff_reopened",
                       resource_type="daily_signoff", resource_id=existing.id,
                       note=data.notes)
            db.commit()
            return {"id": existing.id, "status": "reopened"}
        else:
            raise HTTPException(status_code=409, detail="Already signed off. Use reopen=true to reopen.")

    signoff = models.DailySignoff(
        date=data.date,
        job_id=data.job_id,
        supervisor_id=emp.id,
        status="signed_off",
        notes=data.notes,
        signed_off_at=datetime.now(),
    )
    db.add(signoff)
    db.flush()
    log_action(db, current_user.id, "daily_signoff",
               resource_type="daily_signoff", resource_id=signoff.id,
               new_value={"date": str(data.date), "job_id": data.job_id}, note=data.notes)
    db.commit()
    db.refresh(signoff)
    return {"id": signoff.id, "status": "signed_off", "signed_off_at": signoff.signed_off_at}
