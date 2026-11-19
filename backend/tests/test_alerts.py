"""Rule-based alerts: missing time, long days, job budgets, and access scope."""
from datetime import date, timedelta
import models


def _assign(env, days_ago, status="scheduled", emp="worker_emp"):
    db = env.session()
    db.add(models.ScheduleAssignment(
        employee_id=env.ids[emp], job_id=env.ids["job"],
        date=date.today() - timedelta(days=days_ago), planned_hours=8, status=status))
    db.commit()
    db.close()


def _alerts(env, role="admin"):
    r = env.as_role(role).get("/api/alerts")
    assert r.status_code == 200, r.text
    return r.json()


def test_scheduled_day_without_entry_is_missing(env):
    _assign(env, 2)
    data = _alerts(env)
    assert data["counts"]["missing_time"] == 1
    m = data["missing_time"][0]
    assert m["employee_id"] == env.ids["worker_emp"]
    assert m["planned_hours"] == 8


def test_day_with_entry_is_not_missing(env):
    _assign(env, 2)
    env.make_entry("submitted", days_ago=2)
    assert _alerts(env)["counts"]["missing_time"] == 0


def test_removed_missed_and_today_are_ignored(env):
    _assign(env, 2, status="removed")
    _assign(env, 3, status="missed")
    _assign(env, 0)  # today is still in progress
    assert _alerts(env)["counts"]["missing_time"] == 0


def test_long_day_flagged_over_12_hours(env):
    env.make_entry("approved", days_ago=2, hours=8)
    env.make_entry("approved", days_ago=2, hours=5)
    data = _alerts(env)
    assert data["counts"]["long_days"] == 1
    assert data["long_days"][0]["total_hours"] == 13


def test_exactly_12_hours_is_fine_and_rejected_not_counted(env):
    env.make_entry("approved", days_ago=2, hours=12)
    env.make_entry("rejected", days_ago=2, hours=6)
    assert _alerts(env)["counts"]["long_days"] == 0


def test_job_budget_warning_and_over(env):
    db = env.session()
    job = db.query(models.Job).filter(models.Job.id == env.ids["job"]).first()
    job.budget_hours = 100
    db.commit()
    db.close()
    for d in range(3, 12):
        env.make_entry("approved", days_ago=d, hours=9)  # 81 hours
    b = _alerts(env)["job_budgets"]
    assert len(b) == 1 and b[0]["level"] == "warning" and b[0]["percent"] == 81.0
    for d in range(12, 14):
        env.make_entry("approved", days_ago=d, hours=10)  # 101 hours
    assert _alerts(env)["job_budgets"][0]["level"] == "over"


def test_supervisor_sees_only_own_crew(env):
    _assign(env, 2)  # worker is not on the supervisor's crew
    assert _alerts(env, "supervisor")["counts"]["missing_time"] == 0
    db = env.session()
    w = db.query(models.Employee).filter(models.Employee.id == env.ids["worker_emp"]).first()
    w.supervisor_id = env.ids["supervisor_emp"]
    db.commit()
    db.close()
    assert _alerts(env, "supervisor")["counts"]["missing_time"] == 1


def test_workers_are_forbidden_and_range_validated(env):
    assert env.as_role("worker").get("/api/alerts").status_code == 403
    c = env.as_role("admin")
    assert c.get("/api/alerts?start=2026-01-01&end=2026-06-01").status_code == 422
    assert c.get("/api/alerts?start=2026-02-02&end=2026-02-01").status_code == 422
