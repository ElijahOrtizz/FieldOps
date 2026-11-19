"""A supervisor with no employee profile must see nothing, and supervisors only mark their own crew absent."""
from datetime import date
import models
from auth import get_password_hash


def _make_profileless_supervisor(env):
    db = env.session()
    u = models.User(email="noprofile@test.local", hashed_password=get_password_hash("x"),
                    role=models.UserRole.supervisor, is_active=True)
    db.add(u)
    db.commit()
    env.ids["noprofile_user"] = u.id
    db.close()


def test_profileless_supervisor_sees_no_queue_entries(env):
    env.make_entry("submitted", days_ago=3)
    _make_profileless_supervisor(env)
    r = env.as_role("noprofile").get("/api/approvals/queue")
    assert r.status_code == 200 and r.json() == []


def test_profileless_supervisor_sees_no_time_entries(env):
    env.make_entry("submitted", days_ago=3)
    _make_profileless_supervisor(env)
    r = env.as_role("noprofile").get("/api/time-entries/")
    assert r.status_code == 200 and r.json() == []


def test_profileless_supervisor_daily_review_is_empty(env):
    db = env.session()
    db.add(models.ScheduleAssignment(employee_id=env.ids["worker_emp"], job_id=env.ids["job"],
                                     date=date.today(), planned_hours=8))
    db.commit()
    db.close()
    env.make_entry("submitted", days_ago=0)
    _make_profileless_supervisor(env)
    r = env.as_role("noprofile").get("/api/supervisor/daily-review")
    assert r.status_code == 200, r.text
    body = r.json()
    for v in body.values():
        if isinstance(v, list):
            assert v == []


def _assignment(env):
    db = env.session()
    a = models.ScheduleAssignment(employee_id=env.ids["worker_emp"], job_id=env.ids["job"],
                                  date=date.today(), planned_hours=8)
    db.add(a)
    db.commit()
    aid = a.id
    db.close()
    return aid


def test_supervisor_cannot_mark_outside_crew_absent(env):
    aid = _assignment(env)
    r = env.as_role("supervisor").post("/api/supervisor/mark-absent", json={
        "employee_id": env.ids["worker_emp"], "assignment_id": aid})
    assert r.status_code == 403


def test_supervisor_can_mark_own_crew_absent(env):
    aid = _assignment(env)
    db = env.session()
    w = db.query(models.Employee).filter(models.Employee.id == env.ids["worker_emp"]).first()
    w.supervisor_id = env.ids["supervisor_emp"]
    db.commit()
    db.close()
    r = env.as_role("supervisor").post("/api/supervisor/mark-absent", json={
        "employee_id": env.ids["worker_emp"], "assignment_id": aid})
    assert r.status_code == 200, r.text
