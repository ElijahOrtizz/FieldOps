"""Audit trail: each sensitive action writes a record with the acting user."""
import json
from datetime import date, timedelta

import models


def _logs(env, action):
    db = env.session()
    rows = db.query(models.AuditLog).filter(models.AuditLog.action == action).all()
    db.close()
    return rows


def test_approve_creates_audit_record(env):
    entry_id = env.make_entry("submitted")
    assert env.as_role("supervisor").post(f"/api/time-entries/{entry_id}/approve").status_code == 200
    rows = _logs(env, "approved")
    assert len(rows) == 1
    assert rows[0].resource_id == entry_id
    assert rows[0].user_id == env.ids["supervisor_user"]


def test_reject_creates_audit_record(env):
    entry_id = env.make_entry("submitted")
    assert env.as_role("supervisor").post(f"/api/time-entries/{entry_id}/reject").status_code == 200
    rows = _logs(env, "rejected")
    assert len(rows) == 1
    assert rows[0].user_id == env.ids["supervisor_user"]


def test_needs_correction_creates_audit_record(env):
    entry_id = env.make_entry("submitted")
    assert env.as_role("supervisor").post(f"/api/time-entries/{entry_id}/needs-correction").status_code == 200
    assert len(_logs(env, "needs_correction")) == 1


def test_edit_records_old_and_new_hours(env):
    entry_id = env.make_entry("submitted", hours=8.0)
    r = env.as_role("worker").put(f"/api/time-entries/{entry_id}", json={"total_hours": 6.0})
    assert r.status_code == 200
    rows = _logs(env, "edited")
    assert len(rows) == 1
    assert json.loads(rows[0].old_value)["total_hours"] == 8.0
    assert json.loads(rows[0].new_value)["total_hours"] == 6.0
    assert rows[0].user_id == env.ids["worker_user"]


def test_export_confirmation_creates_audit_record(env):
    env.make_entry("approved")
    r = env.as_role("admin").get("/api/export/sage-csv?mark_exported=true")
    assert r.status_code == 200
    rows = _logs(env, "exported")
    assert len(rows) == 1
    assert json.loads(rows[0].new_value)["record_count"] == 1
    assert rows[0].user_id == env.ids["admin_user"]


def test_payroll_lock_creates_audit_record(env):
    monday = date.today() - timedelta(days=date.today().weekday())
    r = env.as_role("admin").post("/api/payroll-locks/lock", json={"week_start": str(monday)})
    assert r.status_code == 200
    assert len(_logs(env, "payroll_locked")) == 1


def test_admin_can_filter_audit_log_by_action(env):
    entry_id = env.make_entry("submitted")
    env.as_role("supervisor").post(f"/api/time-entries/{entry_id}/approve")
    r = env.as_role("admin").get("/api/audit-logs/?action=approved")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["action"] == "approved"
    assert body[0]["user_email"] == "supervisor@test.local"


def test_failed_action_writes_no_audit_record(env):
    r = env.as_role("supervisor").post("/api/time-entries/99999/approve")
    assert r.status_code == 404
    db = env.session()
    assert db.query(models.AuditLog).count() == 0
    db.close()


def test_audit_records_contain_no_secrets(env):
    entry_id = env.make_entry("submitted")
    env.as_role("worker").put(f"/api/time-entries/{entry_id}", json={"total_hours": 7.0})
    env.as_role("supervisor").post(f"/api/time-entries/{entry_id}/approve")
    env.as_role("admin").get("/api/export/sage-csv?mark_exported=true")
    db = env.session()
    text = " ".join(
        " ".join(str(v) for v in (r.old_value, r.new_value, r.note, r.details))
        for r in db.query(models.AuditLog).all()
    ).lower()
    db.close()
    for word in ("password", "hashed", "token", "secret", "bearer", "api_key"):
        assert word not in text
