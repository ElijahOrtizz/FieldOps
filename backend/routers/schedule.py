"""
Phase 2.3 — Crew Scheduling + Job Assignment Board
Endpoints:
  GET  /schedule/weekly          — weekly schedule grid
  POST /schedule/assign          — create one assignment
  POST /schedule/bulk-assign     — assign multiple employees to same job/day
  PATCH /schedule/assignments/:id — edit an assignment
  DELETE /schedule/assignments/:id — remove an assignment
  GET  /schedule/variance         — schedule vs actual timecard comparison
  GET  /schedule/today/:employee_id — worker "today's assignment" view
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, timedelta, datetime
from database import get_db
import models
from auth import get_current_user, require_role
from audit import log_action

router = APIRouter()

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ── helpers ──────────────────────────────────────────────────────────────────

def _sv(status):
    return status.value if hasattr(status, "value") else str(status)


def assignment_to_dict(a: models.ScheduleAssignment) -> dict:
    emp = a.employee
    job = a.job
    sup = a.supervisor
    return {
        "id": a.id,
        "employee_id": a.employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "",
        "employee_number": emp.employee_number if emp else "",
        "trade": emp.trade if emp else "",
        "job_id": a.job_id,
        "job_number": job.job_number if job else "",
        "job_name": job.job_name if job else "",
        "job_address": (f"{job.city}, {job.state}" if job and job.city else "") if job else "",
        "supervisor_id": a.supervisor_id,
        "supervisor_name": f"{sup.first_name} {sup.last_name}" if sup else None,
        "date": a.date.isoformat() if a.date else None,
        "planned_start_time": a.planned_start_time,
        "planned_end_time": a.planned_end_time,
        "planned_hours": a.planned_hours,
        "role": a.role or (emp.trade if emp else None),
        "notes": a.notes,
        "status": _sv(a.status),
        "created_at": a.created_at,
        "updated_at": a.updated_at,
    }


def _calc_hours(start: str, end: str) -> Optional[float]:
    """Return decimal hours between HH:MM times, or None."""
    try:
        sh, sm = map(int, start.split(":"))
        eh, em = map(int, end.split(":"))
        mins = (eh * 60 + em) - (sh * 60 + sm)
        return round(mins / 60, 2) if mins > 0 else None
    except Exception:
        return None


# ── request schemas ────────────────────────────────────────────────────────────

class AssignRequest(BaseModel):
    employee_id: int
    job_id: int
    date: date
    planned_start_time: Optional[str] = None
    planned_end_time: Optional[str] = None
    planned_hours: Optional[float] = None
    supervisor_id: Optional[int] = None
    role: Optional[str] = None
    notes: Optional[str] = None


class BulkAssignRequest(BaseModel):
    employee_ids: List[int]
    job_id: int
    date: date
    planned_start_time: Optional[str] = None
    planned_end_time: Optional[str] = None
    planned_hours: Optional[float] = None
    supervisor_id: Optional[int] = None
    role: Optional[str] = None
    notes: Optional[str] = None


class AssignmentUpdate(BaseModel):
    job_id: Optional[int] = None
    date: Optional[date] = None
    planned_start_time: Optional[str] = None
    planned_end_time: Optional[str] = None
    planned_hours: Optional[float] = None
    supervisor_id: Optional[int] = None
    role: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


# ── GET /weekly ────────────────────────────────────────────────────────────────

@router.get("/weekly")
def get_weekly_schedule(
    week_start: Optional[date] = None,
    employee_id: Optional[int] = None,
    job_id: Optional[int] = None,
    supervisor_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Return weekly schedule grouped by day → job → employees.
    Workers only see their own assignments.
    """
    if not week_start:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    query = db.query(models.ScheduleAssignment).filter(
        models.ScheduleAssignment.date >= week_start,
        models.ScheduleAssignment.date <= week_end,
        models.ScheduleAssignment.status != "removed",
    )

    if current_user.role == "worker":
        emp = current_user.employee
        if not emp:
            return _empty_week(week_start)
        query = query.filter(models.ScheduleAssignment.employee_id == emp.id)
    elif current_user.role == "supervisor":
        emp = current_user.employee
        if emp:
            crew_ids = [e.id for e in db.query(models.Employee).filter(
                models.Employee.supervisor_id == emp.id).all()]
            crew_ids.append(emp.id)
            query = query.filter(models.ScheduleAssignment.employee_id.in_(crew_ids))

    if employee_id:
        query = query.filter(models.ScheduleAssignment.employee_id == employee_id)
    if job_id:
        query = query.filter(models.ScheduleAssignment.job_id == job_id)
    if supervisor_id:
        query = query.filter(models.ScheduleAssignment.supervisor_id == supervisor_id)
    if status:
        query = query.filter(models.ScheduleAssignment.status == status)

    assignments = query.order_by(
        models.ScheduleAssignment.date,
        models.ScheduleAssignment.planned_start_time,
    ).all()

    # Build 7-day structure
    days = []
    total_planned = 0.0
    for i in range(7):
        day_date = week_start + timedelta(days=i)
        day_assignments = [a for a in assignments if a.date == day_date]

        # Group by job within the day
        jobs_map = {}
        for a in day_assignments:
            jk = a.job_id
            if jk not in jobs_map:
                jobs_map[jk] = {
                    "job_id": a.job_id,
                    "job_number": a.job.job_number if a.job else "",
                    "job_name": a.job.job_name if a.job else "",
                    "job_address": (f"{a.job.city}, {a.job.state}" if a.job and a.job.city else ""),
                    "total_planned_hours": 0.0,
                    "assignments": [],
                }
            d = assignment_to_dict(a)
            jobs_map[jk]["assignments"].append(d)
            jobs_map[jk]["total_planned_hours"] = round(
                jobs_map[jk]["total_planned_hours"] + (a.planned_hours or 0), 2)

        day_total = round(sum(a.planned_hours or 0 for a in day_assignments), 2)
        total_planned += day_total

        days.append({
            "date": day_date.isoformat(),
            "day_name": DAY_NAMES[i],
            "total_planned_hours": day_total,
            "jobs": list(jobs_map.values()),
            "assignment_count": len(day_assignments),
        })

    # Per-employee weekly totals
    emp_totals = {}
    for a in assignments:
        eid = a.employee_id
        if eid not in emp_totals:
            emp = a.employee
            emp_totals[eid] = {
                "employee_id": eid,
                "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "",
                "employee_number": emp.employee_number if emp else "",
                "trade": emp.trade if emp else "",
                "total_planned_hours": 0.0,
                "assignment_count": 0,
            }
        emp_totals[eid]["total_planned_hours"] = round(
            emp_totals[eid]["total_planned_hours"] + (a.planned_hours or 0), 2)
        emp_totals[eid]["assignment_count"] += 1

    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "total_planned_hours": round(total_planned, 2),
        "days": days,
        "employee_totals": sorted(emp_totals.values(), key=lambda x: x["total_planned_hours"], reverse=True),
    }


def _empty_week(week_start: date) -> dict:
    week_end = week_start + timedelta(days=6)
    days = [{"date": (week_start + timedelta(days=i)).isoformat(),
              "day_name": DAY_NAMES[i], "total_planned_hours": 0.0, "jobs": [], "assignment_count": 0}
            for i in range(7)]
    return {"week_start": week_start.isoformat(), "week_end": week_end.isoformat(),
            "total_planned_hours": 0.0, "days": days, "employee_totals": []}


# ── POST /assign ───────────────────────────────────────────────────────────────

@router.post("/assign")
def create_assignment(
    data: AssignRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin")),
):
    """Create a single schedule assignment."""
    if not db.query(models.Employee).filter(models.Employee.id == data.employee_id).first():
        raise HTTPException(status_code=404, detail="Employee not found")
    if not db.query(models.Job).filter(models.Job.id == data.job_id).first():
        raise HTTPException(status_code=404, detail="Job not found")

    # Validate times
    planned_hours = data.planned_hours
    if data.planned_start_time and data.planned_end_time:
        h = _calc_hours(data.planned_start_time, data.planned_end_time)
        if h is None or h <= 0:
            raise HTTPException(status_code=422, detail="End time must be after start time")
        if planned_hours is None:
            planned_hours = h
    elif planned_hours is not None and planned_hours <= 0:
        raise HTTPException(status_code=422, detail="Planned hours must be positive")

    a = models.ScheduleAssignment(
        employee_id=data.employee_id,
        job_id=data.job_id,
        supervisor_id=data.supervisor_id,
        date=data.date,
        planned_start_time=data.planned_start_time,
        planned_end_time=data.planned_end_time,
        planned_hours=planned_hours,
        role=data.role,
        notes=data.notes,
        status="scheduled",
        created_by_id=current_user.id,
    )
    db.add(a)
    db.flush()

    log_action(db, current_user.id, "assignment_created",
               resource_type="schedule_assignment", resource_id=a.id,
               new_value={"employee_id": data.employee_id, "job_id": data.job_id,
                          "date": str(data.date), "planned_hours": planned_hours},
               note=f"Assigned to job {a.job.job_number if a.job else data.job_id}")
    db.commit()
    db.refresh(a)
    return assignment_to_dict(a)


# ── POST /bulk-assign ─────────────────────────────────────────────────────────

@router.post("/bulk-assign")
def bulk_assign(
    data: BulkAssignRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin")),
):
    """Assign multiple employees to the same job/day in one call."""
    if not data.employee_ids:
        raise HTTPException(status_code=422, detail="At least one employee required")
    if not db.query(models.Job).filter(models.Job.id == data.job_id).first():
        raise HTTPException(status_code=404, detail="Job not found")

    planned_hours = data.planned_hours
    if data.planned_start_time and data.planned_end_time:
        h = _calc_hours(data.planned_start_time, data.planned_end_time)
        if h is None or h <= 0:
            raise HTTPException(status_code=422, detail="End time must be after start time")
        if planned_hours is None:
            planned_hours = h

    created = []
    skipped = []
    for emp_id in data.employee_ids:
        emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
        if not emp:
            skipped.append(emp_id)
            continue

        a = models.ScheduleAssignment(
            employee_id=emp_id,
            job_id=data.job_id,
            supervisor_id=data.supervisor_id,
            date=data.date,
            planned_start_time=data.planned_start_time,
            planned_end_time=data.planned_end_time,
            planned_hours=planned_hours,
            role=data.role or emp.trade,
            notes=data.notes,
            status="scheduled",
            created_by_id=current_user.id,
        )
        db.add(a)
        db.flush()
        log_action(db, current_user.id, "assignment_created",
                   resource_type="schedule_assignment", resource_id=a.id,
                   new_value={"employee_id": emp_id, "job_id": data.job_id,
                              "date": str(data.date), "planned_hours": planned_hours},
                   note=f"Bulk assigned {len(data.employee_ids)} employees")
        created.append(assignment_to_dict(a))

    db.commit()
    return {"created": created, "skipped": skipped, "count": len(created)}


# ── PATCH /assignments/:id ────────────────────────────────────────────────────

@router.patch("/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int,
    data: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin")),
):
    a = db.query(models.ScheduleAssignment).filter(
        models.ScheduleAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")

    old_snap = assignment_to_dict(a)

    if data.job_id is not None:
        a.job_id = data.job_id
    if data.date is not None:
        a.date = data.date
    if data.planned_start_time is not None:
        a.planned_start_time = data.planned_start_time
    if data.planned_end_time is not None:
        a.planned_end_time = data.planned_end_time
    if data.planned_hours is not None:
        a.planned_hours = data.planned_hours
    if data.supervisor_id is not None:
        a.supervisor_id = data.supervisor_id
    if data.role is not None:
        a.role = data.role
    if data.notes is not None:
        a.notes = data.notes
    if data.status is not None:
        a.status = data.status

    # Validate and recalc hours
    if a.planned_start_time and a.planned_end_time:
        h = _calc_hours(a.planned_start_time, a.planned_end_time)
        if h is None or h <= 0:
            raise HTTPException(status_code=422, detail="End time must be after start time")
        if data.planned_hours is None:
            a.planned_hours = h
    if a.planned_hours is not None and a.planned_hours <= 0:
        raise HTTPException(status_code=422, detail="Planned hours must be positive")

    log_action(db, current_user.id, "assignment_edited",
               resource_type="schedule_assignment", resource_id=assignment_id,
               old_value=old_snap, new_value=assignment_to_dict(a),
               note="Schedule assignment updated")
    db.commit()
    db.refresh(a)
    return assignment_to_dict(a)


# ── DELETE /assignments/:id ───────────────────────────────────────────────────

@router.delete("/assignments/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin")),
):
    a = db.query(models.ScheduleAssignment).filter(
        models.ScheduleAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")

    a.status = "removed"
    log_action(db, current_user.id, "assignment_removed",
               resource_type="schedule_assignment", resource_id=assignment_id,
               old_value={"employee_id": a.employee_id, "job_id": a.job_id, "date": str(a.date)},
               note="Assignment removed from schedule")
    db.commit()
    return {"message": "Assignment removed", "id": assignment_id}


# ── GET /variance ─────────────────────────────────────────────────────────────

@router.get("/variance")
def schedule_variance(
    week_start: Optional[date] = None,
    employee_id: Optional[int] = None,
    job_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin")),
):
    """
    Compare schedule assignments to actual time entries.
    Returns per-employee variance with issue flags.
    """
    if not week_start:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    # Pull assignments (not removed)
    aq = db.query(models.ScheduleAssignment).filter(
        models.ScheduleAssignment.date >= week_start,
        models.ScheduleAssignment.date <= week_end,
        models.ScheduleAssignment.status != "removed",
    )
    # Pull time entries
    tq = db.query(models.TimeEntry).filter(
        models.TimeEntry.date >= week_start,
        models.TimeEntry.date <= week_end,
    )

    if employee_id:
        aq = aq.filter(models.ScheduleAssignment.employee_id == employee_id)
        tq = tq.filter(models.TimeEntry.employee_id == employee_id)
    if job_id:
        aq = aq.filter(models.ScheduleAssignment.job_id == job_id)

    if current_user.role == "supervisor":
        emp = current_user.employee
        if emp:
            crew_ids = [e.id for e in db.query(models.Employee).filter(
                models.Employee.supervisor_id == emp.id).all()]
            crew_ids.append(emp.id)
            aq = aq.filter(models.ScheduleAssignment.employee_id.in_(crew_ids))
            tq = tq.filter(models.TimeEntry.employee_id.in_(crew_ids))

    assignments = aq.all()
    time_entries = tq.all()

    # Index: (employee_id, date) → list
    from collections import defaultdict
    sched_map = defaultdict(list)
    for a in assignments:
        sched_map[(a.employee_id, a.date)].append(a)

    entry_map = defaultdict(list)
    for e in time_entries:
        entry_map[(e.employee_id, e.date)].append(e)

    # Build all unique (employee, date) keys
    all_keys = set(sched_map.keys()) | set(entry_map.keys())

    # Per-employee weekly totals
    emp_sched_total = defaultdict(float)
    emp_actual_total = defaultdict(float)
    for a in assignments:
        emp_sched_total[a.employee_id] += a.planned_hours or 0
    for e in time_entries:
        emp_actual_total[e.employee_id] += e.total_hours or 0

    issues = []
    for (emp_id, day_date) in sorted(all_keys):
        sched_list = sched_map[(emp_id, day_date)]
        entry_list = entry_map[(emp_id, day_date)]

        emp_obj = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
        emp_name = f"{emp_obj.first_name} {emp_obj.last_name}" if emp_obj else str(emp_id)
        emp_num  = emp_obj.employee_number if emp_obj else ""

        sched_hours  = round(sum(a.planned_hours or 0 for a in sched_list), 2)
        actual_hours = round(sum(e.total_hours or 0 for e in entry_list), 2)
        sched_job_ids  = {a.job_id for a in sched_list}
        actual_job_ids = {e.job_id for e in entry_list}

        # Issue flags
        issue_types = []
        if sched_list and not entry_list:
            issue_types.append("missing_timecard")
        if entry_list and not sched_list:
            issue_types.append("unscheduled_work")
        # Wrong job: worked on a job not scheduled for this employee/date
        if sched_job_ids and actual_job_ids and not sched_job_ids.intersection(actual_job_ids):
            issue_types.append("wrong_job")
        # Also flag individual actual jobs that were not scheduled
        unscheduled_actual_jobs = actual_job_ids - sched_job_ids
        if sched_job_ids and unscheduled_actual_jobs:
            issue_types.append("unscheduled_job")
        if sched_hours > 0 and actual_hours > sched_hours + 0.5:
            issue_types.append("over_planned")
        if sched_hours > 0 and actual_hours < sched_hours - 0.5 and entry_list:
            issue_types.append("under_planned")

        # Overtime risk — based on weekly totals
        weekly_sched = emp_sched_total.get(emp_id, 0)
        weekly_actual = emp_actual_total.get(emp_id, 0)
        if weekly_sched >= 34 or weekly_actual >= 34:  # warn at 85% of 40h
            issue_types.append("overtime_risk")

        if not issue_types:
            continue

        issues.append({
            "employee_id": emp_id,
            "employee_name": emp_name,
            "employee_number": emp_num,
            "date": day_date.isoformat(),
            "day_name": DAY_NAMES[day_date.weekday()],
            "scheduled_jobs": [{"job_id": a.job_id, "job_number": a.job.job_number if a.job else "",
                                 "job_name": a.job.job_name if a.job else "", "hours": a.planned_hours or 0}
                                for a in sched_list],
            "actual_jobs": [{"job_id": e.job_id, "job_number": e.job.job_number if e.job else "",
                              "job_name": e.job.job_name if e.job else "", "hours": e.total_hours,
                              "status": _sv(e.status)}
                             for e in entry_list],
            "scheduled_hours": sched_hours,
            "actual_hours": actual_hours,
            "variance_hours": round(actual_hours - sched_hours, 2),
            "issue_types": issue_types,
            "weekly_scheduled_hours": round(weekly_sched, 2),
            "weekly_actual_hours": round(weekly_actual, 2),
        })

    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "issue_count": len(issues),
        "issues": issues,
    }


# ── GET /today/:employee_id ───────────────────────────────────────────────────

@router.get("/today")
def get_today_assignments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Worker's assignments for today."""
    emp = current_user.employee
    if not emp:
        return []
    today = date.today()
    assignments = db.query(models.ScheduleAssignment).filter(
        models.ScheduleAssignment.employee_id == emp.id,
        models.ScheduleAssignment.date == today,
        models.ScheduleAssignment.status != "removed",
    ).all()
    return [assignment_to_dict(a) for a in assignments]
