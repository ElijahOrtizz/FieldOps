from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import date
import os, uuid, shutil
from database import get_db
import models
from auth import get_current_user, require_role
from audit import log_action

router = APIRouter()
UPLOAD_DIR = "uploads"


def _is_week_locked(db: Session, entry_date: date) -> bool:
    """Check if the week containing entry_date is payroll-locked."""
    from datetime import timedelta
    day = entry_date.weekday()  # Mon=0
    week_start = entry_date - timedelta(days=day)
    lock = db.query(models.PayrollLock).filter(
        models.PayrollLock.week_start == week_start,
        models.PayrollLock.status == "locked"
    ).first()
    return lock is not None


def _parse_hhmm(t: str):
    """Return (hours, minutes) from 'HH:MM' or raise ValueError."""
    h, m = t.split(":")
    return int(h), int(m)


def _validate_times(start_time, end_time, total_hours):
    errors = []
    if total_hours is not None and total_hours <= 0:
        errors.append("Hours must be positive")
    if start_time and end_time:
        try:
            sh, sm = _parse_hhmm(start_time)
            eh, em = _parse_hhmm(end_time)
            start_mins = sh * 60 + sm
            end_mins = eh * 60 + em
            if end_mins <= start_mins:
                errors.append("End time must be after start time")
        except Exception:
            errors.append("Times must be in HH:MM format")
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))


class TimeEntryCreate(BaseModel):
    date: date
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    total_hours: float
    job_id: int
    cost_code_id: int
    pay_type: Optional[str] = "Regular"
    notes: Optional[str] = None


class TimeEntryUpdate(BaseModel):
    date: Optional[date] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    total_hours: Optional[float] = None
    job_id: Optional[int] = None
    cost_code_id: Optional[int] = None
    pay_type: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    force: Optional[bool] = False   # admin override for locked weeks / exported entries


def entry_to_dict(entry):
    emp = entry.employee
    return {
        "id": entry.id,
        "employee_id": entry.employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else None,
        "employee_number": emp.employee_number if emp else None,
        "job_id": entry.job_id,
        "job_number": entry.job.job_number if entry.job else None,
        "job_name": entry.job.job_name if entry.job else None,
        "cost_code_id": entry.cost_code_id,
        "cost_code": entry.cost_code.code if entry.cost_code else None,
        "cost_code_description": entry.cost_code.description if entry.cost_code else None,
        "date": entry.date,
        "start_time": entry.start_time,
        "end_time": entry.end_time,
        "total_hours": entry.total_hours,
        "pay_type": entry.pay_type,
        "notes": entry.notes,
        "status": entry.status.value if hasattr(entry.status, "value") else str(entry.status),
        "submitted_at": entry.submitted_at,
        "exported_at": entry.exported_at,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "approval": {
            "action": entry.approval.action,
            "notes": entry.approval.notes,
            "supervisor_name": f"{entry.approval.supervisor.first_name} {entry.approval.supervisor.last_name}"
                if entry.approval and entry.approval.supervisor else None,
            "created_at": entry.approval.created_at,
        } if entry.approval else None,
        "receipts": [{"id": r.id, "filename": r.filename, "original_name": r.original_name}
                     for r in entry.receipts],
        "sage_sync_status": entry.sage_sync_status or "not_ready",
        "sage_synced_at": entry.sage_synced_at,
    }


@router.get("/")
def list_time_entries(
    employee_id: Optional[int] = None,
    job_id: Optional[int] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.TimeEntry)

    if current_user.role == "worker":
        emp = current_user.employee
        if not emp:
            return []
        query = query.filter(models.TimeEntry.employee_id == emp.id)
    elif current_user.role == "supervisor":
        emp = current_user.employee
        if emp:
            crew_ids = [e.id for e in db.query(models.Employee).filter(
                models.Employee.supervisor_id == emp.id).all()]
            crew_ids.append(emp.id)
            query = query.filter(models.TimeEntry.employee_id.in_(crew_ids))

    if employee_id:
        query = query.filter(models.TimeEntry.employee_id == employee_id)
    if job_id:
        query = query.filter(models.TimeEntry.job_id == job_id)
    if status:
        query = query.filter(models.TimeEntry.status == status)
    if date_from:
        query = query.filter(models.TimeEntry.date >= date_from)
    if date_to:
        query = query.filter(models.TimeEntry.date <= date_to)

    entries = query.order_by(models.TimeEntry.date.desc()).all()
    return [entry_to_dict(e) for e in entries]


@router.get("/{entry_id}")
def get_time_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry_to_dict(entry)


@router.get("/{entry_id}/audit")
def get_entry_audit(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Fetch audit log entries for a specific time entry."""
    logs = db.query(models.AuditLog).filter(
        models.AuditLog.resource_type == "time_entry",
        models.AuditLog.resource_id == entry_id
    ).order_by(models.AuditLog.created_at.desc()).all()
    return [{
        "id": l.id,
        "action": l.action,
        "user_email": l.user.email if l.user else None,
        "user_name": f"{l.user.employee.first_name} {l.user.employee.last_name}"
            if (l.user and l.user.employee) else (l.user.email if l.user else "System"),
        "old_value": l.old_value,
        "new_value": l.new_value,
        "note": l.note,
        "created_at": l.created_at,
    } for l in logs]


@router.post("/")
def create_time_entry(
    data: TimeEntryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    emp = current_user.employee
    if not emp:
        raise HTTPException(status_code=400, detail="No employee profile linked to this account")

    if not data.job_id:
        raise HTTPException(status_code=422, detail="Job is required")
    if not data.cost_code_id:
        raise HTTPException(status_code=422, detail="Cost code is required")

    _validate_times(data.start_time, data.end_time, data.total_hours)

    job = db.query(models.Job).filter(models.Job.id == data.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    cc = db.query(models.CostCode).filter(models.CostCode.id == data.cost_code_id).first()
    if not cc:
        raise HTTPException(status_code=404, detail="Cost code not found")

    entry = models.TimeEntry(
        employee_id=emp.id,
        job_id=data.job_id,
        cost_code_id=data.cost_code_id,
        date=data.date,
        start_time=data.start_time,
        end_time=data.end_time,
        total_hours=data.total_hours,
        pay_type=data.pay_type,
        notes=data.notes,
        status="submitted"
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry_to_dict(entry)


@router.put("/{entry_id}")
def update_time_entry(
    entry_id: int,
    data: TimeEntryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    cur_status = entry.status.value if hasattr(entry.status, "value") else str(entry.status)
    is_admin = current_user.role == "admin"
    force = data.force or False

    # Lock check — applies to everyone unless admin forces
    entry_date = entry.date
    if _is_week_locked(db, entry_date) and not (is_admin and force):
        raise HTTPException(status_code=423, detail="Week is payroll-locked. Admin override required.")

    # Role-based edit restrictions
    if current_user.role == "worker":
        emp = current_user.employee
        if not emp or entry.employee_id != emp.id:
            raise HTTPException(status_code=403, detail="Not your entry")
        if cur_status not in ["submitted", "rejected"]:
            raise HTTPException(status_code=400, detail="Cannot edit approved or exported entries")

    # Exported entry warning — non-admin cannot edit at all
    if cur_status == "exported" and not (is_admin and force):
        raise HTTPException(
            status_code=400,
            detail="Entry has been exported. Admin must use force=true to override."
        )

    # Validate times and hours
    new_start = data.start_time if data.start_time is not None else entry.start_time
    new_end = data.end_time if data.end_time is not None else entry.end_time
    new_hours = data.total_hours if data.total_hours is not None else entry.total_hours
    _validate_times(new_start, new_end, new_hours)

    # Snapshot for audit
    old_snap = {
        "job_id": entry.job_id,
        "cost_code_id": entry.cost_code_id,
        "date": str(entry.date),
        "start_time": entry.start_time,
        "end_time": entry.end_time,
        "total_hours": entry.total_hours,
        "pay_type": entry.pay_type,
        "notes": entry.notes,
        "status": cur_status,
    }

    update_fields = data.dict(exclude_none=True, exclude={"force"})
    for field, value in update_fields.items():
        setattr(entry, field, value)

    new_snap = {
        "job_id": entry.job_id,
        "cost_code_id": entry.cost_code_id,
        "date": str(entry.date),
        "start_time": entry.start_time,
        "end_time": entry.end_time,
        "total_hours": entry.total_hours,
        "pay_type": entry.pay_type,
        "notes": entry.notes,
        "status": entry.status.value if hasattr(entry.status, "value") else str(entry.status),
    }

    log_action(db, current_user.id, "edited",
               resource_type="time_entry", resource_id=entry_id,
               old_value=old_snap, new_value=new_snap,
               note=f"Edited by {current_user.role}" + (" (forced)" if force else ""))

    db.commit()
    db.refresh(entry)
    return entry_to_dict(entry)


@router.delete("/{entry_id}")
def delete_time_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    if _is_week_locked(db, entry.date) and current_user.role != "admin":
        raise HTTPException(status_code=423, detail="Week is payroll-locked")

    if current_user.role == "worker":
        emp = current_user.employee
        if not emp or entry.employee_id != emp.id:
            raise HTTPException(status_code=403, detail="Not your entry")
        cur_status = entry.status.value if hasattr(entry.status, "value") else str(entry.status)
        if cur_status not in ["submitted"]:
            raise HTTPException(status_code=400, detail="Cannot delete approved entries")
    db.delete(entry)
    db.commit()
    return {"message": "Entry deleted"}


@router.post("/{entry_id}/upload")
async def upload_receipt(
    entry_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    receipt = models.Receipt(
        time_entry_id=entry_id,
        filename=unique_name,
        original_name=file.filename,
        file_path=file_path,
        file_size=os.path.getsize(file_path)
    )
    db.add(receipt)
    db.commit()
    db.refresh(receipt)
    return {"id": receipt.id, "filename": receipt.filename, "original_name": receipt.original_name}


# ─── Phase 2.2 quick-action endpoints ─────────────────────────────────────────

class QuickActionRequest(BaseModel):
    notes: Optional[str] = None

@router.post("/{entry_id}/approve")
def approve_entry(
    entry_id: int,
    data: QuickActionRequest = QuickActionRequest(),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Quick-approve a single time entry (supervisor/admin)."""
    if current_user.role not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Only supervisors and admins can approve")

    entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Payroll lock check — blocks quick actions on locked weeks
    if _is_week_locked(db, entry.date):
        raise HTTPException(status_code=423,
            detail="Payroll week is locked. Unlock payroll before changing this entry.")

    cur = entry.status.value if hasattr(entry.status, "value") else str(entry.status)
    if cur not in ["submitted", "rejected", "needs_correction"]:
        raise HTTPException(status_code=400, detail=f"Cannot approve entry with status '{cur}'")

    emp = current_user.employee
    if not emp:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    old_status = cur
    entry.status = "approved"
    # sage_sync_status stays "not_ready" — only /sage/prepare (on a locked week) sets it to "ready"

    old_appr = db.query(models.Approval).filter(models.Approval.time_entry_id == entry_id).first()
    if old_appr:
        db.delete(old_appr)
    approval = models.Approval(time_entry_id=entry_id, supervisor_id=emp.id,
                               action="approved", notes=data.notes)
    db.add(approval)

    log_action(db, current_user.id, "approved",
               resource_type="time_entry", resource_id=entry_id,
               old_value={"status": old_status}, new_value={"status": "approved"},
               note=data.notes or "Approved via quick action")
    db.commit()
    db.refresh(entry)
    return entry_to_dict(entry)


@router.post("/{entry_id}/reject")
def reject_entry(
    entry_id: int,
    data: QuickActionRequest = QuickActionRequest(),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Quick-reject a single time entry."""
    if current_user.role not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Only supervisors and admins can reject")

    entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Payroll lock check — blocks quick actions on locked weeks
    if _is_week_locked(db, entry.date):
        raise HTTPException(status_code=423,
            detail="Payroll week is locked. Unlock payroll before changing this entry.")

    cur = entry.status.value if hasattr(entry.status, "value") else str(entry.status)
    if cur == "exported":
        raise HTTPException(status_code=400, detail="Cannot reject exported entries")

    emp = current_user.employee
    if not emp:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    old_status = cur
    entry.status = "rejected"
    entry.sage_sync_status = "not_ready"

    old_appr = db.query(models.Approval).filter(models.Approval.time_entry_id == entry_id).first()
    if old_appr:
        db.delete(old_appr)
    approval = models.Approval(time_entry_id=entry_id, supervisor_id=emp.id,
                               action="rejected", notes=data.notes)
    db.add(approval)

    log_action(db, current_user.id, "rejected",
               resource_type="time_entry", resource_id=entry_id,
               old_value={"status": old_status}, new_value={"status": "rejected"},
               note=data.notes or "Rejected via quick action")
    db.commit()
    db.refresh(entry)
    return entry_to_dict(entry)


@router.post("/{entry_id}/needs-correction")
def needs_correction(
    entry_id: int,
    data: QuickActionRequest = QuickActionRequest(),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Flag a time entry as needing correction."""
    if current_user.role not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Only supervisors and admins can flag entries")

    entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Payroll lock check — blocks quick actions on locked weeks
    if _is_week_locked(db, entry.date):
        raise HTTPException(status_code=423,
            detail="Payroll week is locked. Unlock payroll before changing this entry.")

    cur = entry.status.value if hasattr(entry.status, "value") else str(entry.status)
    if cur in ["exported"]:
        raise HTTPException(status_code=400, detail="Cannot flag exported entries for correction")
    old_status = cur
    entry.status = "needs_correction"
    entry.sage_sync_status = "not_ready"

    log_action(db, current_user.id, "needs_correction",
               resource_type="time_entry", resource_id=entry_id,
               old_value={"status": old_status}, new_value={"status": "needs_correction"},
               note=data.notes or "Flagged for correction")
    db.commit()
    db.refresh(entry)
    return entry_to_dict(entry)
