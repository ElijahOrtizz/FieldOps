from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
import models
from auth import get_current_user, require_role
from routers.time_entries import entry_to_dict
from audit import log_action

router = APIRouter()


class ApprovalAction(BaseModel):
    action: str  # approved, rejected, changes_requested
    notes: Optional[str] = None
    job_id: Optional[int] = None
    cost_code_id: Optional[int] = None


class SupervisorEdit(BaseModel):
    job_id: Optional[int] = None
    cost_code_id: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    total_hours: Optional[float] = None
    pay_type: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    reason: Optional[str] = None


@router.get("/queue")
def get_approval_queue(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin"))
):
    query = db.query(models.TimeEntry).filter(models.TimeEntry.status.in_(["submitted", "needs_correction"]))

    if current_user.role == "supervisor":
        emp = current_user.employee
        if emp:
            crew_ids = [e.id for e in db.query(models.Employee).filter(
                models.Employee.supervisor_id == emp.id).all()]
            crew_ids.append(emp.id)
            query = query.filter(models.TimeEntry.employee_id.in_(crew_ids))

    entries = query.order_by(models.TimeEntry.date.asc()).all()
    return [entry_to_dict(e) for e in entries]


@router.put("/{entry_id}/edit")
def supervisor_edit_entry(
    entry_id: int,
    data: SupervisorEdit,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin"))
):
    """Supervisors and admins can edit submitted entries before approving."""
    entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Capture old values for audit
    old = {
        "job_id": entry.job_id,
        "cost_code_id": entry.cost_code_id,
        "start_time": entry.start_time,
        "end_time": entry.end_time,
        "total_hours": entry.total_hours,
        "pay_type": entry.pay_type,
        "notes": entry.notes,
        "status": str(entry.status),
    }

    changed = {}
    if data.job_id is not None and data.job_id != entry.job_id:
        entry.job_id = data.job_id
        changed["job_id"] = data.job_id
    if data.cost_code_id is not None and data.cost_code_id != entry.cost_code_id:
        entry.cost_code_id = data.cost_code_id
        changed["cost_code_id"] = data.cost_code_id
    if data.start_time is not None:
        entry.start_time = data.start_time
        changed["start_time"] = data.start_time
    if data.end_time is not None:
        entry.end_time = data.end_time
        changed["end_time"] = data.end_time
    if data.total_hours is not None:
        entry.total_hours = data.total_hours
        changed["total_hours"] = data.total_hours
    if data.pay_type is not None:
        entry.pay_type = data.pay_type
        changed["pay_type"] = data.pay_type
    if data.notes is not None:
        entry.notes = data.notes
        changed["notes"] = data.notes
    if data.status is not None:
        entry.status = data.status
        changed["status"] = data.status

    new = {**old, **changed}

    log_action(
        db, current_user.id, "edited",
        resource_type="time_entry", resource_id=entry_id,
        old_value=old, new_value=new,
        note=data.reason or "Supervisor edit before approval"
    )

    db.commit()
    db.refresh(entry)
    return entry_to_dict(entry)


@router.post("/{entry_id}")
def process_approval(
    entry_id: int,
    data: ApprovalAction,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin"))
):
    entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.status not in ["submitted", "rejected", "needs_correction"]:
        raise HTTPException(status_code=400, detail="Entry is not in a reviewable state")

    emp = current_user.employee
    if not emp:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    old_status = str(entry.status)

    if data.job_id:
        entry.job_id = data.job_id
    if data.cost_code_id:
        entry.cost_code_id = data.cost_code_id

    if data.action == "approved":
        entry.status = "approved"
    elif data.action == "rejected":
        entry.status = "rejected"
    elif data.action == "changes_requested":
        entry.status = "submitted"

    old_approval = db.query(models.Approval).filter(models.Approval.time_entry_id == entry_id).first()
    if old_approval:
        db.delete(old_approval)

    approval = models.Approval(
        time_entry_id=entry_id,
        supervisor_id=emp.id,
        action=data.action,
        notes=data.notes
    )
    db.add(approval)

    log_action(
        db, current_user.id, data.action,
        resource_type="time_entry", resource_id=entry_id,
        old_value={"status": old_status},
        new_value={"status": str(entry.status)},
        note=data.notes
    )

    db.commit()
    db.refresh(entry)
    return entry_to_dict(entry)


@router.post("/bulk")
def bulk_approve(
    entry_ids: List[int],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin"))
):
    emp = current_user.employee
    if not emp:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    approved = []
    for entry_id in entry_ids:
        entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
        if entry and entry.status in ["submitted", "needs_correction"]:
            entry.status = "approved"
            old = db.query(models.Approval).filter(models.Approval.time_entry_id == entry_id).first()
            if old:
                db.delete(old)
            approval = models.Approval(
                time_entry_id=entry_id,
                supervisor_id=emp.id,
                action="approved",
                notes="Bulk approved"
            )
            db.add(approval)
            log_action(
                db, current_user.id, "approved",
                resource_type="time_entry", resource_id=entry_id,
                note="Bulk approved"
            )
            approved.append(entry_id)

    db.commit()
    return {"approved": approved, "count": len(approved)}


class BulkApproveIdsRequest(BaseModel):
    entry_ids: List[int]
    notes: Optional[str] = None


@router.post("/bulk-approve-ids")
def bulk_approve_by_ids(
    data: BulkApproveIdsRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin"))
):
    """
    Approve exactly the specified entry IDs (and only those).
    Used by 'Approve All Visible' on the frontend — only the currently
    filtered/visible submitted entries are sent, not the whole week.
    """
    emp = current_user.employee
    if not emp:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    approved = []
    skipped = []
    for entry_id in data.entry_ids:
        entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
        if not entry:
            skipped.append(entry_id)
            continue
        cur = entry.status.value if hasattr(entry.status, "value") else str(entry.status)
        if cur not in ["submitted", "needs_correction"]:
            skipped.append(entry_id)
            continue

        entry.status = "approved"
        # sage_sync_status stays "not_ready" until /sage/prepare is called on a locked week

        old = db.query(models.Approval).filter(models.Approval.time_entry_id == entry_id).first()
        if old:
            db.delete(old)
        approval = models.Approval(
            time_entry_id=entry_id,
            supervisor_id=emp.id,
            action="approved",
            notes=data.notes or "Bulk approved (visible entries)"
        )
        db.add(approval)
        log_action(db, current_user.id, "approved",
                   resource_type="time_entry", resource_id=entry_id,
                   old_value={"status": cur}, new_value={"status": "approved"},
                   note=data.notes or "Bulk approved (visible entries)")
        approved.append(entry_id)

    db.commit()
    return {"approved": approved, "skipped": skipped, "count": len(approved)}


class WeekApprovalRequest(BaseModel):
    week_start: str           # YYYY-MM-DD
    employee_id: Optional[int] = None   # None = all employees
    day_date: Optional[str] = None      # YYYY-MM-DD — if set, approve only this day
    notes: Optional[str] = None


@router.post("/approve-week")
def approve_week(
    data: WeekApprovalRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin"))
):
    """Approve all submitted entries for a week (optionally filtered by employee or day)."""
    from datetime import date, timedelta

    emp_auth = current_user.employee
    if not emp_auth:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    try:
        ws = date.fromisoformat(data.week_start)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid week_start date")

    we = ws + timedelta(days=6)

    query = db.query(models.TimeEntry).filter(
        models.TimeEntry.date >= ws,
        models.TimeEntry.date <= we,
        models.TimeEntry.status.in_(["submitted", "needs_correction"])
    )

    if data.employee_id:
        query = query.filter(models.TimeEntry.employee_id == data.employee_id)
    elif current_user.role == "supervisor":
        crew_ids = [e.id for e in db.query(models.Employee).filter(
            models.Employee.supervisor_id == emp_auth.id).all()]
        crew_ids.append(emp_auth.id)
        query = query.filter(models.TimeEntry.employee_id.in_(crew_ids))

    if data.day_date:
        try:
            day = date.fromisoformat(data.day_date)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid day_date")
        query = query.filter(models.TimeEntry.date == day)

    entries = query.all()

    approved_ids = []
    for entry in entries:
        entry.status = "approved"
        old_appr = db.query(models.Approval).filter(
            models.Approval.time_entry_id == entry.id).first()
        if old_appr:
            db.delete(old_appr)
        approval = models.Approval(
            time_entry_id=entry.id,
            supervisor_id=emp_auth.id,
            action="approved",
            notes=data.notes or ("Day approved" if data.day_date else "Week approved")
        )
        db.add(approval)
        log_action(db, current_user.id, "approved",
                   resource_type="time_entry", resource_id=entry.id,
                   note=data.notes or ("Day approved" if data.day_date else "Week approved"))
        approved_ids.append(entry.id)

    db.commit()
    return {"approved": approved_ids, "count": len(approved_ids)}
