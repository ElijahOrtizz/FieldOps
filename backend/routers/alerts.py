"""Rule-based alerts: missing time, very long days, and jobs nearing or over their hours budget.

Plain rules on data Stryda already holds. No models, no outside calls.
"""
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import require_role

router = APIRouter()

LONG_DAY_HOURS = 12.0
BUDGET_WARN_PCT = 80.0
MAX_RANGE_DAYS = 31
COUNTED_STATUSES = ("submitted", "approved", "exported", "needs_correction")


def _crew_ids(db: Session, user: models.User):
    """None = no limit (admin). Supervisors: crew plus self; no profile means nobody."""
    if user.role != "supervisor":
        return None
    emp = user.employee
    if not emp:
        return set()
    ids = {e.id for e in db.query(models.Employee).filter(
        models.Employee.supervisor_id == emp.id).all()}
    ids.add(emp.id)
    return ids


def _name(e: models.Employee) -> str:
    return f"{e.first_name} {e.last_name}"


@router.get("")
def get_alerts(
    start: Optional[date] = None,
    end: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("supervisor", "admin")),
):
    yesterday = date.today() - timedelta(days=1)
    end = end or yesterday
    start = start or (end - timedelta(days=6))
    if end < start:
        raise HTTPException(status_code=422, detail="end must be on or after start")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise HTTPException(status_code=422, detail=f"Range is limited to {MAX_RANGE_DAYS} days")
    if end >= date.today():
        end = yesterday  # today is still in progress, so nothing can be missing yet
        if end < start:
            return {"start": start, "end": end, "missing_time": [], "long_days": [],
                    "job_budgets": _job_budgets(db), "counts": {"missing_time": 0, "long_days": 0, "job_budgets": 0}}

    crew = _crew_ids(db, current_user)

    # Missing time: scheduled and active, but no entry at all that day.
    aq = db.query(models.ScheduleAssignment).filter(
        models.ScheduleAssignment.date >= start,
        models.ScheduleAssignment.date <= end,
        models.ScheduleAssignment.status.notin_(["removed", "missed"]),
    )
    if crew is not None:
        aq = aq.filter(models.ScheduleAssignment.employee_id.in_(crew))
    assignments = aq.all()

    worked = set(db.query(models.TimeEntry.employee_id, models.TimeEntry.date).filter(
        models.TimeEntry.date >= start, models.TimeEntry.date <= end).all())

    missing, seen = [], set()
    for a in assignments:
        key = (a.employee_id, a.date)
        if key in worked or key in seen or not a.employee or not a.employee.is_active:
            continue
        seen.add(key)
        missing.append({
            "employee_id": a.employee_id, "employee_name": _name(a.employee),
            "date": a.date, "job_id": a.job_id,
            "job_name": a.job.job_name if a.job else None,
            "planned_hours": a.planned_hours,
        })
    missing.sort(key=lambda m: (m["date"], m["employee_name"]))

    # Long days: more than LONG_DAY_HOURS logged by one person in one day.
    lq = db.query(models.TimeEntry.employee_id, models.TimeEntry.date,
                  func.sum(models.TimeEntry.total_hours)).filter(
        models.TimeEntry.date >= start, models.TimeEntry.date <= end,
        models.TimeEntry.status.in_(COUNTED_STATUSES))
    if crew is not None:
        lq = lq.filter(models.TimeEntry.employee_id.in_(crew))
    lq = lq.group_by(models.TimeEntry.employee_id, models.TimeEntry.date).all()
    emps = {e.id: e for e in db.query(models.Employee).filter(
        models.Employee.id.in_({r[0] for r in lq})).all()} if lq else {}
    long_days = sorted(
        ({"employee_id": r[0], "employee_name": _name(emps[r[0]]) if r[0] in emps else str(r[0]),
          "date": r[1], "total_hours": round(float(r[2]), 2)}
         for r in lq if float(r[2]) > LONG_DAY_HOURS),
        key=lambda x: (x["date"], x["employee_name"]))

    budgets = _job_budgets(db)
    return {
        "start": start, "end": end,
        "missing_time": missing, "long_days": long_days, "job_budgets": budgets,
        "counts": {"missing_time": len(missing), "long_days": len(long_days), "job_budgets": len(budgets)},
    }


def _job_budgets(db: Session):
    """Active jobs with an hours budget that are at or over BUDGET_WARN_PCT of it."""
    jobs = db.query(models.Job).filter(
        models.Job.status == "active", models.Job.budget_hours.isnot(None),
        models.Job.budget_hours > 0).all()
    if not jobs:
        return []
    logged = dict(db.query(models.TimeEntry.job_id, func.sum(models.TimeEntry.total_hours)).filter(
        models.TimeEntry.job_id.in_([j.id for j in jobs]),
        models.TimeEntry.status.in_(COUNTED_STATUSES)).group_by(models.TimeEntry.job_id).all())
    out = []
    for j in jobs:
        hrs = float(logged.get(j.id) or 0)
        pct = round(hrs / j.budget_hours * 100, 1)
        if pct >= BUDGET_WARN_PCT:
            out.append({
                "job_id": j.id, "job_number": j.job_number, "job_name": j.job_name,
                "budget_hours": j.budget_hours, "logged_hours": round(hrs, 2),
                "percent": pct, "level": "over" if pct >= 100 else "warning",
            })
    out.sort(key=lambda x: -x["percent"])
    return out
