"""A supervisor with no employee profile sees nothing in reports, schedule and material requests."""
from datetime import date
import models
from auth import get_password_hash


def _profileless(env):
    db = env.session()
    u = models.User(email="noprofile2@test.local", hashed_password=get_password_hash("x"),
                    role=models.UserRole.supervisor, is_active=True)
    db.add(u)
    db.commit()
    env.ids["noprofile_user"] = u.id
    db.close()


def _seed(env):
    env.make_entry("approved", days_ago=0)
    db = env.session()
    db.add(models.ScheduleAssignment(employee_id=env.ids["worker_emp"], job_id=env.ids["job"],
                                     date=date.today(), planned_hours=8))
    db.add(models.MaterialRequest(requested_by_id=env.ids["worker_emp"], job_id=env.ids["job"],
                                  material_name="Wire", quantity=1))
    db.commit()
    db.close()
    _profileless(env)


def test_by_employee_empty(env):
    _seed(env)
    r = env.as_role("noprofile").get("/api/reports/by-employee")
    assert r.status_code == 200 and r.json() == []


def test_weekly_crew_empty(env):
    _seed(env)
    r = env.as_role("noprofile").get("/api/reports/weekly-crew")
    assert r.status_code == 200 and r.json() == []


def test_weekly_timecards_empty(env):
    _seed(env)
    r = env.as_role("noprofile").get("/api/reports/weekly-timecards")
    assert r.status_code == 200, r.text
    assert r.json()["employees"] == []


def test_schedule_weekly_empty(env):
    _seed(env)
    r = env.as_role("noprofile").get("/api/schedule/weekly")
    assert r.status_code == 200, r.text
    assert r.json()["days"] and all(d["assignment_count"] == 0 for d in r.json()["days"])


def test_schedule_variance_empty(env):
    from datetime import timedelta
    _seed(env)
    last_monday = date.today() - timedelta(days=date.today().weekday() + 7)
    db = env.session()
    # Scheduled last week with no time entry: an admin sees this as an issue.
    db.add(models.ScheduleAssignment(employee_id=env.ids["worker_emp"], job_id=env.ids["job"],
                                     date=last_monday, planned_hours=8))
    db.commit()
    db.close()
    url = f"/api/schedule/variance?week_start={last_monday.isoformat()}"
    assert env.as_role("admin").get(url).json()["issue_count"] >= 1
    r = env.as_role("noprofile").get(url)
    assert r.status_code == 200, r.text
    assert r.json()["issue_count"] == 0 and r.json()["issues"] == []


def test_material_requests_empty(env):
    _seed(env)
    r = env.as_role("noprofile").get("/api/material-requests/")
    assert r.status_code == 200 and r.json() == []


def test_admin_still_sees_everything(env):
    _seed(env)
    assert len(env.as_role("admin").get("/api/material-requests/").json()) == 1
    assert len(env.as_role("admin").get("/api/reports/by-employee").json()) == 1
