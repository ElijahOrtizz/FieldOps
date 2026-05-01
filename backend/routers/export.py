from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, datetime
import csv, io
from database import get_db
import models
from auth import require_role
from audit import log_action

router = APIRouter()


def _entry_rows(entries):
    """Build CSV rows for given entries."""
    now_str = datetime.now().strftime("%Y-%m-%d")
    rows = []
    for e in entries:
        emp = e.employee
        job = e.job
        cc = e.cost_code
        approval = e.approval
        sage_emp_id = (emp.sage_employee_id if (emp and emp.sage_employee_id)
                       else (emp.employee_number if emp else ""))
        day_of_week = e.date.strftime("%A") if e.date else ""
        approved_by, approval_date = "", ""
        if approval and approval.supervisor:
            sup = approval.supervisor
            approved_by = f"{sup.first_name} {sup.last_name}"
            approval_date = approval.created_at.strftime("%Y-%m-%d") if approval.created_at else ""
        rows.append([
            sage_emp_id,
            f"{emp.first_name} {emp.last_name}" if emp else "",
            job.job_number if job else "",
            job.job_name if job else "",
            cc.code if cc else "",
            cc.description if cc else "",
            e.date.strftime("%Y-%m-%d") if e.date else "",
            day_of_week,
            e.start_time or "",
            e.end_time or "",
            f"{e.total_hours:.2f}",
            e.pay_type or "Regular",
            e.notes or "",
            approved_by,
            approval_date,
            now_str,
        ])
    return rows


@router.get("/preview")
def export_preview(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    job_id: Optional[int] = None,
    include_exported: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    """
    Return a preview of entries that WILL be exported.
    Only approved entries are included by default.
    If include_exported=True, already-exported entries are also shown.
    """
    query = db.query(models.TimeEntry)

    if include_exported:
        query = query.filter(models.TimeEntry.status.in_(["approved", "exported"]))
    else:
        query = query.filter(models.TimeEntry.status == "approved")

    if date_from:
        query = query.filter(models.TimeEntry.date >= date_from)
    if date_to:
        query = query.filter(models.TimeEntry.date <= date_to)
    if job_id:
        query = query.filter(models.TimeEntry.job_id == job_id)

    entries = query.order_by(models.TimeEntry.date.asc()).all()

    rows = []
    total_hours = 0
    for e in entries:
        emp = e.employee
        job = e.job
        cc = e.cost_code
        status_val = e.status.value if hasattr(e.status, "value") else str(e.status)
        total_hours += e.total_hours
        rows.append({
            "id": e.id,
            "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "",
            "date": e.date.strftime("%Y-%m-%d") if e.date else "",
            "job_number": job.job_number if job else "",
            "job_name": job.job_name if job else "",
            "cost_code": cc.code if cc else "",
            "cost_code_description": cc.description if cc else "",
            "hours": e.total_hours,
            "pay_type": e.pay_type or "Regular",
            "status": status_val,
            "exported_at": e.exported_at,
        })

    return {
        "record_count": len(rows),
        "total_hours": round(total_hours, 2),
        "entries": rows,
        "warning": "No approved/unexported entries found." if not rows else None,
    }


@router.get("/sage-csv")
def export_sage_csv(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    job_id: Optional[int] = None,
    mark_exported: bool = False,
    include_exported: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    """
    Export approved time entries as Sage-ready CSV.
    - Only approved entries are exported by default.
    - Already-exported entries are skipped unless include_exported=True.
    - mark_exported=True marks entries as 'exported' and creates an export batch record.
    """
    query = db.query(models.TimeEntry)

    if include_exported:
        query = query.filter(models.TimeEntry.status.in_(["approved", "exported"]))
    else:
        query = query.filter(models.TimeEntry.status == "approved")

    if date_from:
        query = query.filter(models.TimeEntry.date >= date_from)
    if date_to:
        query = query.filter(models.TimeEntry.date <= date_to)
    if job_id:
        query = query.filter(models.TimeEntry.job_id == job_id)

    entries = query.order_by(models.TimeEntry.date.asc()).all()

    if not entries:
        raise HTTPException(status_code=404, detail="No approved entries found for the given filters")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Employee_ID", "Employee_Name", "Job_Number", "Job_Name",
        "Cost_Code", "Cost_Code_Desc", "Date", "Day_Of_Week",
        "Start_Time", "End_Time", "Hours", "Pay_Type",
        "Notes", "Approved_By", "Approval_Date", "Export_Date",
    ])
    for row in _entry_rows(entries):
        writer.writerow(row)

    now_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"stryda_sage_export_{now_str}.csv"

    if mark_exported:
        batch = models.ExportBatch(
            exported_by_id=current_user.id,
            file_name=filename,
            record_count=len(entries),
        )
        db.add(batch)
        db.flush()

        for e in entries:
            e.status = "exported"
            e.exported_at = datetime.now()
            e.export_batch_id = batch.id

        log_action(db, current_user.id, "exported",
                   resource_type="export_batch", resource_id=batch.id,
                   new_value={"file_name": filename, "record_count": len(entries)},
                   note=f"Exported {len(entries)} entries to Sage CSV")
        db.commit()

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/summary")
def export_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    query = db.query(models.TimeEntry).filter(
        models.TimeEntry.status.in_(["approved", "exported"])
    )
    if date_from:
        query = query.filter(models.TimeEntry.date >= date_from)
    if date_to:
        query = query.filter(models.TimeEntry.date <= date_to)

    entries = query.all()
    job_summary = {}
    for e in entries:
        key = e.job_id
        if key not in job_summary:
            job_summary[key] = {
                "job_id": e.job_id,
                "job_number": e.job.job_number if e.job else "",
                "job_name": e.job.job_name if e.job else "",
                "total_hours": 0, "entry_count": 0,
                "budget_hours": e.job.budget_hours if e.job else None,
            }
        job_summary[key]["total_hours"] += e.total_hours
        job_summary[key]["entry_count"] += 1

    result = list(job_summary.values())
    for r in result:
        r["total_hours"] = round(r["total_hours"], 2)
        if r["budget_hours"]:
            r["budget_used_pct"] = round((r["total_hours"] / r["budget_hours"]) * 100, 1)
    return result


@router.get("/history")
def export_history(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    batches = db.query(models.ExportBatch).order_by(
        models.ExportBatch.exported_at.desc()).all()
    return [{
        "id": b.id,
        "file_name": b.file_name,
        "record_count": b.record_count,
        "exported_at": b.exported_at,
        "exported_by": b.exported_by.email if b.exported_by else None,
        "notes": b.notes,
    } for b in batches]
