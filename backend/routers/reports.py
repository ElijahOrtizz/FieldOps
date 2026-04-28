from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import date, timedelta
from database import get_db
import models
from auth import get_current_user, require_role

router = APIRouter()


@router.get("/dashboard")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    if current_user.role == "admin":
        total_entries = db.query(models.TimeEntry).count()
        pending = db.query(models.TimeEntry).filter(models.TimeEntry.status == "submitted").count()
        approved_this_week = db.query(models.TimeEntry).filter(
            models.TimeEntry.status == "approved",
            models.TimeEntry.date >= week_start
        ).count()
        active_jobs = db.query(models.Job).filter(models.Job.status == "active").count()
        active_employees = db.query(models.Employee).filter(models.Employee.is_active == True).count()
        hours_this_week = db.query(func.sum(models.TimeEntry.total_hours)).filter(
            models.TimeEntry.date >= week_start,
            models.TimeEntry.status.in_(["approved", "exported"])
        ).scalar() or 0
        pending_materials = db.query(models.MaterialRequest).filter(
            models.MaterialRequest.status == "requested"
        ).count()

        return {
            "total_entries": total_entries,
            "pending_approvals": pending,
            "approved_this_week": approved_this_week,
            "active_jobs": active_jobs,
            "active_employees": active_employees,
            "hours_this_week": round(hours_this_week, 1),
            "pending_materials": pending_materials,
        }

    elif current_user.role == "supervisor":
        emp = current_user.employee
        crew_ids = []
        if emp:
            crew_ids = [e.id for e in db.query(models.Employee).filter(
                models.Employee.supervisor_id == emp.id).all()]

        pending = db.query(models.TimeEntry).filter(
            models.TimeEntry.status == "submitted",
            models.TimeEntry.employee_id.in_(crew_ids)
        ).count()
        crew_hours_week = db.query(func.sum(models.TimeEntry.total_hours)).filter(
            models.TimeEntry.date >= week_start,
            models.TimeEntry.employee_id.in_(crew_ids),
            models.TimeEntry.status.in_(["approved", "exported"])
        ).scalar() or 0
        pending_materials = db.query(models.MaterialRequest).filter(
            models.MaterialRequest.status == "requested",
            models.MaterialRequest.requested_by_id.in_(crew_ids)
        ).count()

        return {
            "pending_approvals": pending,
            "crew_size": len(crew_ids),
            "crew_hours_this_week": round(crew_hours_week, 1),
            "pending_materials": pending_materials,
        }

    else:  # Worker
        emp = current_user.employee
        if not emp:
            return {"hours_this_week": 0, "entries_this_week": 0, "pending": 0}

        hours_week = db.query(func.sum(models.TimeEntry.total_hours)).filter(
            models.TimeEntry.employee_id == emp.id,
            models.TimeEntry.date >= week_start,
        ).scalar() or 0
        entries_week = db.query(models.TimeEntry).filter(
            models.TimeEntry.employee_id == emp.id,
            models.TimeEntry.date >= week_start,
        ).count()
        pending = db.query(models.TimeEntry).filter(
            models.TimeEntry.employee_id == emp.id,
            models.TimeEntry.status == "submitted",
        ).count()
        my_materials = db.query(models.MaterialRequest).filter(
            models.MaterialRequest.requested_by_id == emp.id,
            models.MaterialRequest.status == "requested",
        ).count()

        return {
            "hours_this_week": round(hours_week, 1),
            "entries_this_week": entries_week,
            "pending_approvals": pending,
            "pending_materials": my_materials,
        }


@router.get("/job-cost")
def job_cost_summary(
    job_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin", "supervisor"))
):
    query = db.query(
        models.TimeEntry.job_id,
        models.TimeEntry.cost_code_id,
        func.sum(models.TimeEntry.total_hours).label("total_hours"),
        func.count(models.TimeEntry.id).label("entry_count")
    ).filter(
        models.TimeEntry.status.in_(["approved", "exported"])
    ).group_by(models.TimeEntry.job_id, models.TimeEntry.cost_code_id)

    if job_id:
        query = query.filter(models.TimeEntry.job_id == job_id)

    results = query.all()
    output = []
    for r in results:
        job = db.query(models.Job).filter(models.Job.id == r.job_id).first()
        cc = db.query(models.CostCode).filter(models.CostCode.id == r.cost_code_id).first()
        output.append({
            "job_id": r.job_id,
            "job_number": job.job_number if job else "",
            "job_name": job.job_name if job else "",
            "cost_code_id": r.cost_code_id,
            "cost_code": cc.code if cc else "",
            "cost_code_description": cc.description if cc else "",
            "total_hours": round(r.total_hours, 2),
            "entry_count": r.entry_count,
        })
    return output


@router.get("/by-employee")
def hours_by_employee(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin", "supervisor"))
):
    query = db.query(
        models.TimeEntry.employee_id,
        func.sum(models.TimeEntry.total_hours).label("total_hours"),
        func.count(models.TimeEntry.id).label("entry_count")
    ).filter(
        models.TimeEntry.status.in_(["approved", "exported", "submitted"])
    ).group_by(models.TimeEntry.employee_id)

    if date_from:
        query = query.filter(models.TimeEntry.date >= date_from)
    if date_to:
        query = query.filter(models.TimeEntry.date <= date_to)

    # Supervisors see only their crew
    if current_user.role == "supervisor":
        emp = current_user.employee
        if emp:
            crew_ids = [e.id for e in db.query(models.Employee).filter(
                models.Employee.supervisor_id == emp.id).all()]
            crew_ids.append(emp.id)
            query = query.filter(models.TimeEntry.employee_id.in_(crew_ids))

    results = query.all()
    output = []
    for r in results:
        emp = db.query(models.Employee).filter(models.Employee.id == r.employee_id).first()
        output.append({
            "employee_id": r.employee_id,
            "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "",
            "employee_number": emp.employee_number if emp else "",
            "trade": emp.trade if emp else "",
            "total_hours": round(r.total_hours, 2),
            "entry_count": r.entry_count,
        })
    return sorted(output, key=lambda x: x["total_hours"], reverse=True)


@router.get("/status-summary")
def status_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin", "supervisor"))
):
    """Summary of time entries by status + material requests by status."""
    statuses = ["submitted", "approved", "rejected", "exported", "needs_correction"]
    entry_counts = {}
    for s in statuses:
        entry_counts[s] = db.query(models.TimeEntry).filter(
            models.TimeEntry.status == s).count()

    mat_statuses = ["requested", "approved", "ordered", "delivered", "denied"]
    mat_counts = {}
    for s in mat_statuses:
        mat_counts[s] = db.query(models.MaterialRequest).filter(
            models.MaterialRequest.status == s).count()

    return {
        "time_entries": entry_counts,
        "material_requests": mat_counts,
    }


@router.get("/weekly-crew")
def weekly_crew_report(
    week_start: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin"))
):
    if not week_start:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    emp = current_user.employee
    query = db.query(models.TimeEntry).filter(
        models.TimeEntry.date >= week_start,
        models.TimeEntry.date <= week_end
    )
    if current_user.role == "supervisor" and emp:
        crew_ids = [e.id for e in db.query(models.Employee).filter(
            models.Employee.supervisor_id == emp.id).all()]
        query = query.filter(models.TimeEntry.employee_id.in_(crew_ids))

    entries = query.all()
    crew_summary = {}
    for e in entries:
        key = e.employee_id
        if key not in crew_summary:
            crew_summary[key] = {
                "employee_id": e.employee_id,
                "employee_name": f"{e.employee.first_name} {e.employee.last_name}" if e.employee else "",
                "employee_number": e.employee.employee_number if e.employee else "",
                "total_hours": 0, "approved_hours": 0, "pending_hours": 0, "entry_count": 0,
            }
        crew_summary[key]["total_hours"] += e.total_hours
        crew_summary[key]["entry_count"] += 1
        if e.status == "approved":
            crew_summary[key]["approved_hours"] += e.total_hours
        elif e.status == "submitted":
            crew_summary[key]["pending_hours"] += e.total_hours

    result = list(crew_summary.values())
    for r in result:
        r["total_hours"] = round(r["total_hours"], 2)
        r["approved_hours"] = round(r["approved_hours"], 2)
        r["pending_hours"] = round(r["pending_hours"], 2)
    return result


@router.get("/weekly-timecards")
def weekly_timecards(
    week_start: Optional[date] = None,
    employee_id: Optional[int] = None,
    job_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Returns a structured weekly timecard grid for all employees (admin/supervisor)
    or the current user only (worker).
    """
    # Default to current week (Monday)
    if not week_start:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    # Build the 7-day date list Mon-Sun
    week_days = [week_start + timedelta(days=i) for i in range(7)]
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    # Determine which employees to include
    if current_user.role == "worker":
        emp = current_user.employee
        employees = [emp] if emp else []
    elif current_user.role == "supervisor":
        emp = current_user.employee
        crew_ids = []
        if emp:
            crew_ids = [e.id for e in db.query(models.Employee).filter(
                models.Employee.supervisor_id == emp.id).all()]
            crew_ids.append(emp.id)
        employees = db.query(models.Employee).filter(
            models.Employee.id.in_(crew_ids),
            models.Employee.is_active == True
        ).all() if crew_ids else db.query(models.Employee).filter(
            models.Employee.is_active == True).all()
    else:
        # Admin sees all
        employees = db.query(models.Employee).filter(models.Employee.is_active == True).all()

    # Apply optional employee filter
    if employee_id:
        employees = [e for e in employees if e.id == employee_id]

    # Pull all time entries for this week in one query
    entry_query = db.query(models.TimeEntry).filter(
        models.TimeEntry.date >= week_start,
        models.TimeEntry.date <= week_end
    )
    if employee_id:
        entry_query = entry_query.filter(models.TimeEntry.employee_id == employee_id)
    if job_id:
        entry_query = entry_query.filter(models.TimeEntry.job_id == job_id)
    if status:
        entry_query = entry_query.filter(models.TimeEntry.status == status)

    all_entries = entry_query.all()

    # Index entries by (employee_id, date)
    from collections import defaultdict
    entry_map = defaultdict(list)
    for e in all_entries:
        entry_map[(e.employee_id, e.date)].append(e)

    # Build per-employee structure
    employee_rows = []
    for emp in employees:
        emp_entries = [e for e in all_entries if e.employee_id == emp.id]

        total_hours = sum(e.total_hours for e in emp_entries)
        def _sv(e): return e.status.value if hasattr(e.status, "value") else str(e.status)
        approved_hours = sum(e.total_hours for e in emp_entries if _sv(e) == "approved")
        submitted_hours = sum(e.total_hours for e in emp_entries if _sv(e) == "submitted")
        rejected_hours = sum(e.total_hours for e in emp_entries if _sv(e) == "rejected")
        exported_hours = sum(e.total_hours for e in emp_entries if _sv(e) == "exported")
        needs_correction_hours = sum(e.total_hours for e in emp_entries if _sv(e) == "needs_correction")

        # Hours by job
        job_hours = defaultdict(lambda: {"job_number": "", "job_name": "", "hours": 0})
        for e in emp_entries:
            key = e.job_id
            job_hours[key]["job_number"] = e.job.job_number if e.job else ""
            job_hours[key]["job_name"] = e.job.job_name if e.job else ""
            job_hours[key]["hours"] = round(job_hours[key]["hours"] + e.total_hours, 2)

        # Hours by cost code
        cc_hours = defaultdict(lambda: {"cost_code": "", "description": "", "hours": 0})
        for e in emp_entries:
            key = e.cost_code_id
            cc_hours[key]["cost_code"] = e.cost_code.code if e.cost_code else ""
            cc_hours[key]["description"] = e.cost_code.description if e.cost_code else ""
            cc_hours[key]["hours"] = round(cc_hours[key]["hours"] + e.total_hours, 2)

        # Build daily breakdown
        days = []
        for day_date, day_name in zip(week_days, day_names):
            day_entries = entry_map.get((emp.id, day_date), [])
            day_hours = round(sum(e.total_hours for e in day_entries), 2)

            entries_out = []
            for e in day_entries:
                approval = e.approval
                entries_out.append({
                    "id": e.id,
                    "job_id": e.job_id,
                    "job_number": e.job.job_number if e.job else "",
                    "job_name": e.job.job_name if e.job else "",
                    "cost_code_id": e.cost_code_id,
                    "cost_code": e.cost_code.code if e.cost_code else "",
                    "cost_code_description": e.cost_code.description if e.cost_code else "",
                    "start_time": e.start_time,
                    "end_time": e.end_time,
                    "hours": e.total_hours,
                    "pay_type": e.pay_type,
                    "notes": e.notes,
                    "status": (e.status.value if hasattr(e.status, "value") else str(e.status)),
                    "approved_by": (
                        f"{approval.supervisor.first_name} {approval.supervisor.last_name}"
                        if approval and approval.supervisor else None
                    ),
                    "sage_sync_status": e.sage_sync_status or "not_ready",
                    "sage_synced_at": e.sage_synced_at.isoformat() if e.sage_synced_at else None,
                    "employee_id": e.employee_id,
                })

            days.append({
                "date": day_date.strftime("%Y-%m-%d"),
                "day_name": day_name,
                "total_hours": day_hours,
                "entries": entries_out,
            })

        employee_rows.append({
            "employee_id": emp.id,
            "employee_name": f"{emp.first_name} {emp.last_name}",
            "employee_number": emp.employee_number,
            "trade": emp.trade,
            "total_hours": round(total_hours, 2),
            "approved_hours": round(approved_hours, 2),
            "submitted_hours": round(submitted_hours, 2),
            "rejected_hours": round(rejected_hours, 2),
            "exported_hours": round(exported_hours, 2),
            "needs_correction_hours": round(needs_correction_hours, 2),
            "hours_by_job": [v for v in job_hours.values() if v["hours"] > 0],
            "hours_by_cost_code": [v for v in cc_hours.values() if v["hours"] > 0],
            "days": days,
        })

    # Sort: employees with most hours first
    employee_rows.sort(key=lambda x: x["total_hours"], reverse=True)

    # Grand summary totals across all employees
    all_week_entries = all_entries
    grand_total = round(sum(e.total_hours for e in all_week_entries), 2)
    grand_approved = round(sum(e.total_hours for e in all_week_entries if (e.status.value if hasattr(e.status, "value") else str(e.status)) == "approved"), 2)
    grand_submitted = round(sum(e.total_hours for e in all_week_entries if (e.status.value if hasattr(e.status, "value") else str(e.status)) == "submitted"), 2)

    grand_by_job = defaultdict(lambda: {"job_number": "", "job_name": "", "hours": 0})
    for e in all_week_entries:
        k = e.job_id
        grand_by_job[k]["job_number"] = e.job.job_number if e.job else ""
        grand_by_job[k]["job_name"] = e.job.job_name if e.job else ""
        grand_by_job[k]["hours"] = round(grand_by_job[k]["hours"] + e.total_hours, 2)

    grand_by_cc = defaultdict(lambda: {"cost_code": "", "description": "", "hours": 0})
    for e in all_week_entries:
        k = e.cost_code_id
        grand_by_cc[k]["cost_code"] = e.cost_code.code if e.cost_code else ""
        grand_by_cc[k]["description"] = e.cost_code.description if e.cost_code else ""
        grand_by_cc[k]["hours"] = round(grand_by_cc[k]["hours"] + e.total_hours, 2)

    employees_with_time = len([e for e in employee_rows if e["total_hours"] > 0])
    total_employee_count = len(employees)  # all active employees queried

    return {
        "week_start": week_start.strftime("%Y-%m-%d"),
        "week_end": week_end.strftime("%Y-%m-%d"),
        "summary": {
            "total_hours": grand_total,
            "approved_hours": grand_approved,
            "submitted_hours": grand_submitted,
            "employee_count": len(employee_rows),
            "total_employee_count": total_employee_count,
            "employees_with_time": employees_with_time,
            "hours_by_job": sorted(grand_by_job.values(), key=lambda x: x["hours"], reverse=True),
            "hours_by_cost_code": sorted(grand_by_cc.values(), key=lambda x: x["hours"], reverse=True),
        },
        "employees": employee_rows,
    }


@router.get("/job-cost-snapshot")
def job_cost_snapshot(
    week_start: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin", "supervisor"))
):
    """
    Owner/Admin job cost snapshot with rule-based warnings:
    - hours by job this week
    - labor hours by cost code
    - overtime risk (employees over 40h this week)
    - jobs with the most unapproved time
    - ready-for-export hours
    """
    if not week_start:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    all_entries = db.query(models.TimeEntry).filter(
        models.TimeEntry.date >= week_start,
        models.TimeEntry.date <= week_end,
    ).all()

    # ── Hours by job this week ──
    job_map = {}
    for e in all_entries:
        k = e.job_id
        if k not in job_map:
            job = e.job
            job_map[k] = {
                "job_id": k,
                "job_number": job.job_number if job else "",
                "job_name": job.job_name if job else "",
                "budget_hours": job.budget_hours if job else None,
                "total_hours": 0,
                "approved_hours": 0,
                "submitted_hours": 0,
                "exported_hours": 0,
                "rejected_hours": 0,
            }
        status = e.status.value if hasattr(e.status, "value") else str(e.status)
        job_map[k]["total_hours"] = round(job_map[k]["total_hours"] + e.total_hours, 2)
        job_map[k][f"{status}_hours"] = round(
            job_map[k].get(f"{status}_hours", 0) + e.total_hours, 2)

    hours_by_job = sorted(job_map.values(), key=lambda x: x["total_hours"], reverse=True)

    # ── Hours by cost code ──
    cc_map = {}
    for e in all_entries:
        k = e.cost_code_id
        if k not in cc_map:
            cc = e.cost_code
            cc_map[k] = {
                "cost_code": cc.code if cc else "",
                "description": cc.description if cc else "",
                "category": cc.category if cc else "",
                "total_hours": 0,
            }
        cc_map[k]["total_hours"] = round(cc_map[k]["total_hours"] + e.total_hours, 2)

    hours_by_cost_code = sorted(cc_map.values(), key=lambda x: x["total_hours"], reverse=True)

    # ── Overtime risk (>40h this week per employee) ──
    emp_hours = {}
    for e in all_entries:
        k = e.employee_id
        if k not in emp_hours:
            emp = e.employee
            emp_hours[k] = {
                "employee_id": k,
                "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "",
                "trade": emp.trade if emp else "",
                "total_hours": 0,
            }
        emp_hours[k]["total_hours"] = round(emp_hours[k]["total_hours"] + e.total_hours, 2)

    OT_THRESHOLD = 40.0
    overtime_risk = [
        {**v, "over_by": round(v["total_hours"] - OT_THRESHOLD, 2)}
        for v in sorted(emp_hours.values(), key=lambda x: x["total_hours"], reverse=True)
        if v["total_hours"] >= OT_THRESHOLD * 0.85  # warn at 85% of 40h = 34h
    ]

    # ── Jobs with most unapproved time ──
    unapproved_by_job = [
        {**j, "unapproved_hours": round(j["submitted_hours"] + j.get("rejected_hours", 0), 2)}
        for j in hours_by_job
        if j["submitted_hours"] + j.get("rejected_hours", 0) > 0
    ]
    unapproved_by_job.sort(key=lambda x: x["unapproved_hours"], reverse=True)

    # ── Ready for export ──
    approved_unexported = db.query(models.TimeEntry).filter(
        models.TimeEntry.date >= week_start,
        models.TimeEntry.date <= week_end,
        models.TimeEntry.status == "approved",
    ).all()
    ready_for_export_hours = round(sum(e.total_hours for e in approved_unexported), 2)
    ready_for_export_count = len(approved_unexported)

    # ── Grand totals ──
    total_hours = round(sum(e.total_hours for e in all_entries), 2)
    approved_hours = round(sum(e.total_hours for e in all_entries
                               if (e.status.value if hasattr(e.status, "value") else str(e.status)) == "approved"), 2)
    submitted_hours = round(sum(e.total_hours for e in all_entries
                                if (e.status.value if hasattr(e.status, "value") else str(e.status)) == "submitted"), 2)
    exported_hours = round(sum(e.total_hours for e in all_entries
                               if (e.status.value if hasattr(e.status, "value") else str(e.status)) == "exported"), 2)

    return {
        "week_start": week_start.strftime("%Y-%m-%d"),
        "week_end": week_end.strftime("%Y-%m-%d"),
        "totals": {
            "total_hours": total_hours,
            "approved_hours": approved_hours,
            "submitted_hours": submitted_hours,
            "exported_hours": exported_hours,
            "ready_for_export_hours": ready_for_export_hours,
            "ready_for_export_count": ready_for_export_count,
        },
        "hours_by_job": hours_by_job,
        "hours_by_cost_code": hours_by_cost_code,
        "overtime_risk": overtime_risk,
        "unapproved_by_job": unapproved_by_job,
    }
