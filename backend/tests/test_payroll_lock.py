"""Payroll week locking."""
from datetime import date, timedelta

DAYS_AGO = 3


def _monday(days_ago=DAYS_AGO):
    d = date.today() - timedelta(days=days_ago)
    return d - timedelta(days=d.weekday())


def test_lock_blocked_by_pending_entries(env):
    env.make_entry("submitted", days_ago=DAYS_AGO)
    r = env.as_role("admin").post("/api/payroll-locks/lock", json={"week_start": str(_monday())})
    assert r.status_code == 409


def test_force_lock_allows_pending_entries(env):
    env.make_entry("submitted", days_ago=DAYS_AGO)
    r = env.as_role("admin").post(
        "/api/payroll-locks/lock", json={"week_start": str(_monday()), "force": True}
    )
    assert r.status_code == 200
    assert r.json()["status"] == "locked"


def test_lock_succeeds_when_all_entries_approved(env):
    env.make_entry("approved", days_ago=DAYS_AGO)
    r = env.as_role("admin").post("/api/payroll-locks/lock", json={"week_start": str(_monday())})
    assert r.status_code == 200


def test_locking_same_week_twice_fails(env):
    admin = env.as_role("admin")
    admin.post("/api/payroll-locks/lock", json={"week_start": str(_monday())})
    r = admin.post("/api/payroll-locks/lock", json={"week_start": str(_monday())})
    assert r.status_code == 400


def test_approve_in_locked_week_returns_423(env):
    entry_id = env.make_entry("submitted", days_ago=DAYS_AGO)
    env.as_role("admin").post(
        "/api/payroll-locks/lock", json={"week_start": str(_monday()), "force": True}
    )
    r = env.as_role("supervisor").post(f"/api/time-entries/{entry_id}/approve")
    assert r.status_code == 423


def test_worker_edit_in_locked_week_returns_423(env):
    entry_id = env.make_entry("submitted", days_ago=DAYS_AGO)
    env.as_role("admin").post(
        "/api/payroll-locks/lock", json={"week_start": str(_monday()), "force": True}
    )
    r = env.as_role("worker").put(f"/api/time-entries/{entry_id}", json={"total_hours": 6.0})
    assert r.status_code == 423


def test_unlock_allows_approval_again(env):
    entry_id = env.make_entry("submitted", days_ago=DAYS_AGO)
    admin = env.as_role("admin")
    admin.post("/api/payroll-locks/lock", json={"week_start": str(_monday()), "force": True})
    assert admin.post("/api/payroll-locks/unlock", json={"week_start": str(_monday())}).status_code == 200
    r = env.as_role("supervisor").post(f"/api/time-entries/{entry_id}/approve")
    assert r.status_code == 200
