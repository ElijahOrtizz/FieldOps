"""Approval routes: static paths must not be shadowed by /{entry_id}."""
import models


def _status(env, entry_id):
    db = env.session()
    try:
        entry = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first()
        return entry.status.value if hasattr(entry.status, "value") else str(entry.status)
    finally:
        db.close()


def test_bulk_approve_ids_is_not_shadowed_by_entry_id_route(env):
    ids = [env.make_entry("submitted", days_ago=d) for d in (3, 4, 5)]
    r = env.as_role("admin").post("/api/approvals/bulk-approve-ids", json={"entry_ids": ids})
    assert r.status_code == 200, r.text
    assert sorted(r.json()["approved"]) == sorted(ids)
    assert all(_status(env, i) == "approved" for i in ids)


def test_bulk_approve_ids_skips_non_submitted_entries(env):
    ok = env.make_entry("submitted", days_ago=3)
    already = env.make_entry("approved", days_ago=4)
    r = env.as_role("admin").post("/api/approvals/bulk-approve-ids", json={"entry_ids": [ok, already]})
    assert r.status_code == 200, r.text
    assert r.json()["approved"] == [ok]
    assert r.json()["skipped"] == [already]


def test_single_entry_approval_route_still_works(env):
    entry_id = env.make_entry("submitted", days_ago=3)
    r = env.as_role("admin").post(f"/api/approvals/{entry_id}", json={"action": "approved"})
    assert r.status_code == 200, r.text
    assert _status(env, entry_id) == "approved"


# ---- guards: payroll lock, crew scope, entry state, input validation ----
from datetime import date, timedelta


def _lock_week_of(env, entry_id):
    db = env.session()
    try:
        d = db.query(models.TimeEntry).filter(models.TimeEntry.id == entry_id).first().date
        ws = d - timedelta(days=d.weekday())
        db.add(models.PayrollLock(week_start=ws, week_end=ws + timedelta(days=6), status="locked"))
        db.commit()
    finally:
        db.close()


def test_single_approval_blocked_in_locked_week(env):
    eid = env.make_entry("submitted", days_ago=3)
    _lock_week_of(env, eid)
    r = env.as_role("admin").post(f"/api/approvals/{eid}", json={"action": "approved"})
    assert r.status_code == 423
    assert _status(env, eid) == "submitted"


def test_bulk_ids_skips_locked_week_entries(env):
    eid = env.make_entry("submitted", days_ago=3)
    _lock_week_of(env, eid)
    r = env.as_role("admin").post("/api/approvals/bulk-approve-ids", json={"entry_ids": [eid]})
    assert r.status_code == 200
    assert r.json()["approved"] == []
    assert r.json()["skipped"] == [eid]
    assert _status(env, eid) == "submitted"


def test_approve_week_blocked_when_locked(env):
    eid = env.make_entry("submitted", days_ago=3)
    _lock_week_of(env, eid)
    db = env.session()
    d = db.query(models.TimeEntry).first().date
    db.close()
    ws = d - timedelta(days=d.weekday())
    r = env.as_role("admin").post("/api/approvals/approve-week", json={"week_start": ws.isoformat()})
    assert r.status_code == 423
    assert _status(env, eid) == "submitted"


def test_edit_blocked_in_locked_week(env):
    eid = env.make_entry("approved", days_ago=3)
    _lock_week_of(env, eid)
    r = env.as_role("admin").put(f"/api/approvals/{eid}/edit", json={"total_hours": 9})
    assert r.status_code == 423


def test_supervisor_cannot_act_outside_crew(env):
    eid = env.make_entry("submitted", days_ago=3)  # worker is not on supervisor's crew
    c = env.as_role("supervisor")
    assert c.post(f"/api/approvals/{eid}", json={"action": "approved"}).status_code == 403
    assert c.put(f"/api/approvals/{eid}/edit", json={"notes": "x"}).status_code == 403
    r = c.post("/api/approvals/bulk-approve-ids", json={"entry_ids": [eid]})
    assert r.json()["approved"] == []
    assert _status(env, eid) == "submitted"


def test_supervisor_can_act_on_own_crew(env):
    db = env.session()
    w = db.query(models.Employee).filter(models.Employee.id == env.ids["worker_emp"]).first()
    w.supervisor_id = env.ids["supervisor_emp"]
    db.commit()
    db.close()
    eid = env.make_entry("submitted", days_ago=3)
    r = env.as_role("supervisor").post(f"/api/approvals/{eid}", json={"action": "approved"})
    assert r.status_code == 200, r.text


def test_edit_rejects_bad_hours_status_and_exported(env):
    eid = env.make_entry("submitted", days_ago=3)
    c = env.as_role("admin")
    assert c.put(f"/api/approvals/{eid}/edit", json={"total_hours": 99}).status_code == 422
    assert c.put(f"/api/approvals/{eid}/edit", json={"total_hours": -5}).status_code == 422
    assert c.put(f"/api/approvals/{eid}/edit", json={"status": "bogus"}).status_code == 422
    assert c.put(f"/api/approvals/{eid}/edit", json={"status": "exported"}).status_code == 422
    ex = env.make_entry("exported", days_ago=4)
    assert c.put(f"/api/approvals/{ex}/edit", json={"total_hours": 7}).status_code == 400


def test_approval_action_must_be_valid(env):
    eid = env.make_entry("submitted", days_ago=3)
    r = env.as_role("admin").post(f"/api/approvals/{eid}", json={"action": "banana"})
    assert r.status_code == 422
    assert _status(env, eid) == "submitted"


def test_valid_edit_still_works(env):
    eid = env.make_entry("submitted", days_ago=3)
    r = env.as_role("admin").put(f"/api/approvals/{eid}/edit", json={"total_hours": 7.5, "reason": "fix"})
    assert r.status_code == 200, r.text
    assert r.json()["total_hours"] == 7.5
