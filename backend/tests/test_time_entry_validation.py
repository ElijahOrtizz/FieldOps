"""
Round 6 backend tests:
  BUCKET 1 — Approved entry locking (worker PUT/DELETE → 403)
  BUCKET 2 — Submission validation (hours cap, date window, duplicate)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date, timedelta, datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, joinedload
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# ── In-memory test DB ─────────────────────────────────────────────────────────
# StaticPool forces all sessions to share one connection so the in-memory DB
# is not silently re-created per-connection.
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

from database import Base, get_db   # noqa: E402
import models                        # noqa: E402
from auth import get_current_user, get_password_hash  # noqa: E402

Base.metadata.create_all(bind=test_engine)

# ── Seed data (module-level, created once) ───────────────────────────────────
_db = TestSession()

_worker_user = models.User(email="w@t.com", hashed_password=get_password_hash("x"),
                            role=models.UserRole.worker, is_active=True)
_sup_user    = models.User(email="s@t.com", hashed_password=get_password_hash("x"),
                            role=models.UserRole.supervisor, is_active=True)
_admin_user  = models.User(email="a@t.com", hashed_password=get_password_hash("x"),
                            role=models.UserRole.admin, is_active=True)
for _u in [_worker_user, _sup_user, _admin_user]:
    _db.add(_u)
_db.commit()
for _u in [_worker_user, _sup_user, _admin_user]:
    _db.refresh(_u)

_worker_emp = models.Employee(user_id=_worker_user.id, first_name="Joe", last_name="W",
                               employee_number="W001", hourly_rate=25.0)
_sup_emp    = models.Employee(user_id=_sup_user.id, first_name="Sue", last_name="S",
                               employee_number="S001", hourly_rate=35.0)
for _e in [_worker_emp, _sup_emp]:
    _db.add(_e)
_db.commit()
for _e in [_worker_emp, _sup_emp]:
    _db.refresh(_e)

_job = models.Job(job_number="J001", job_name="Test Job", status="active")
_cc  = models.CostCode(code="01-100", description="General Labor", category="Labor")
_db.add(_job)
_db.add(_cc)
_db.commit()
_db.refresh(_job)
_db.refresh(_cc)

# Entries with known statuses for BUCKET 1 tests
_approved = models.TimeEntry(
    employee_id=_worker_emp.id, job_id=_job.id, cost_code_id=_cc.id,
    date=date.today() - timedelta(days=2), total_hours=8.0,
    pay_type="Regular", status="approved",
)
_submitted = models.TimeEntry(
    employee_id=_worker_emp.id, job_id=_job.id, cost_code_id=_cc.id,
    date=date.today() - timedelta(days=3), total_hours=7.5,
    pay_type="Regular", status="submitted",
)
_rejected = models.TimeEntry(
    employee_id=_worker_emp.id, job_id=_job.id, cost_code_id=_cc.id,
    date=date.today() - timedelta(days=5), total_hours=8.0,
    pay_type="Regular", status="rejected",
)
for _e in [_approved, _submitted, _rejected]:
    _db.add(_e)
_db.commit()
for _e in [_approved, _submitted, _rejected]:
    _db.refresh(_e)

# Capture IDs before closing seed session
WORKER_USER_ID   = _worker_user.id
SUP_USER_ID      = _sup_user.id
ADMIN_USER_ID    = _admin_user.id
WORKER_EMP_ID    = _worker_emp.id
APPROVED_ID      = _approved.id
SUBMITTED_ID     = _submitted.id
REJECTED_DATE    = str(date.today() - timedelta(days=5))
JOB_ID           = _job.id
CC_ID            = _cc.id

_db.close()


# ── Dependency overrides ─────────────────────────────────────────────────────
def _override_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


_active_user_id = WORKER_USER_ID


def _override_user():
    """Return a detached User with employee already loaded."""
    db = TestSession()
    u = db.query(models.User).options(
        joinedload(models.User.employee)
    ).filter(models.User.id == _active_user_id).first()
    # Expunge so objects survive after db.close()
    if u.employee:
        db.expunge(u.employee)
    db.expunge(u)
    db.close()
    return u


def set_user(user_id: int):
    global _active_user_id
    _active_user_id = user_id


# Import app after sys.path is set; override deps immediately
from main import app  # noqa: E402

app.dependency_overrides[get_db] = _override_db
app.dependency_overrides[get_current_user] = _override_user

client = TestClient(app)


# ── BUCKET 1: Approved entry locking ─────────────────────────────────────────

def test_worker_put_approved_returns_403():
    set_user(WORKER_USER_ID)
    r = client.put(f"/api/time-entries/{APPROVED_ID}", json={"total_hours": 9.0})
    assert r.status_code == 403
    assert "Approved entries cannot be edited" in r.json()["detail"]


def test_worker_delete_approved_returns_403():
    set_user(WORKER_USER_ID)
    r = client.delete(f"/api/time-entries/{APPROVED_ID}")
    assert r.status_code == 403
    assert "Approved entries cannot be edited" in r.json()["detail"]


def test_worker_put_submitted_returns_200():
    set_user(WORKER_USER_ID)
    r = client.put(f"/api/time-entries/{SUBMITTED_ID}", json={"notes": "Updated"})
    assert r.status_code == 200


def test_supervisor_put_approved_returns_200():
    set_user(SUP_USER_ID)
    r = client.put(f"/api/time-entries/{APPROVED_ID}", json={"notes": "Sup edit"})
    assert r.status_code == 200


def test_admin_put_approved_returns_200():
    set_user(ADMIN_USER_ID)
    r = client.put(f"/api/time-entries/{APPROVED_ID}", json={"notes": "Admin edit"})
    assert r.status_code == 200


# ── BUCKET 2: Submission validation ──────────────────────────────────────────

def _post(date_str=None, hours=8.0):
    return client.post("/api/time-entries/", json={
        "date": date_str or str(date.today() - timedelta(days=1)),
        "total_hours": hours,
        "job_id": JOB_ID,
        "cost_code_id": CC_ID,
        "pay_type": "Regular",
    })


def test_hours_zero_rejected():
    set_user(WORKER_USER_ID)
    r = _post(date_str=str(date.today() - timedelta(days=8)), hours=0.0)
    assert r.status_code == 422  # _validate_times raises 422 for hours <= 0


def test_hours_over_16_rejected():
    set_user(WORKER_USER_ID)
    r = _post(date_str=str(date.today() - timedelta(days=8)), hours=17.0)
    assert r.status_code == 400
    assert "16 hours" in r.json()["detail"]


def test_future_date_rejected():
    set_user(WORKER_USER_ID)
    r = _post(date_str=str(date.today() + timedelta(days=1)))
    assert r.status_code == 400
    assert "future" in r.json()["detail"]


def test_date_too_old_rejected():
    set_user(WORKER_USER_ID)
    r = _post(date_str=str(date.today() - timedelta(days=15)))
    assert r.status_code == 400
    assert "14 days" in r.json()["detail"]


def test_same_day_job_cc_allowed_after_60s():
    """An entry older than 60s must NOT block a new submission for the same day/job/cc."""
    set_user(WORKER_USER_ID)
    # Insert an entry directly and backdate its created_at beyond the 60s window.
    # Day-11 is unused by any other test in this suite.
    from sqlalchemy import text as sa_text
    old_date = str(date.today() - timedelta(days=11))
    db = TestSession()
    old_entry = models.TimeEntry(
        employee_id=WORKER_EMP_ID, job_id=JOB_ID, cost_code_id=CC_ID,
        date=date.today() - timedelta(days=11),
        total_hours=4.0, pay_type="Regular", status="submitted",
    )
    db.add(old_entry)
    db.commit()
    db.refresh(old_entry)
    db.execute(
        sa_text("UPDATE time_entries SET created_at = :ts WHERE id = :id"),
        {"ts": datetime.now(timezone.utc) - timedelta(seconds=120), "id": old_entry.id},
    )
    db.commit()
    db.close()

    r = _post(date_str=old_date)
    assert r.status_code == 200, r.json()


def test_duplicate_within_60s_rejected():
    """Back-to-back POST for same day/job/cc within seconds should be blocked."""
    set_user(WORKER_USER_ID)
    # Use day-10 (unique in this suite) so first submission is guaranteed fresh
    day = str(date.today() - timedelta(days=10))
    r1 = _post(date_str=day)
    assert r1.status_code == 200, r1.json()
    # Immediate second submission — created_at of r1 is within the 60s window
    r2 = _post(date_str=day)
    assert r2.status_code == 400
    assert "Duplicate submission" in r2.json()["detail"]


def test_post_after_rejection_allowed():
    set_user(WORKER_USER_ID)
    # _rejected was seeded at today-5 (same job/cc) — a new entry should be allowed
    # (rejected entries are not in the 60s window, and the rule ignores rejected status)
    r = _post(date_str=REJECTED_DATE)
    assert r.status_code == 200, r.json()
