"""Role permission checks: who may call which endpoint."""


def test_worker_cannot_list_users(env):
    assert env.as_role("worker").get("/api/users/").status_code == 403


def test_worker_cannot_preview_export(env):
    assert env.as_role("worker").get("/api/export/preview").status_code == 403


def test_worker_cannot_lock_payroll(env):
    r = env.as_role("worker").post("/api/payroll-locks/lock", json={"week_start": "2026-01-05"})
    assert r.status_code == 403


def test_worker_cannot_read_audit_log(env):
    assert env.as_role("worker").get("/api/audit-logs/").status_code == 403


def test_worker_cannot_approve_entry(env):
    entry_id = env.make_entry("submitted")
    assert env.as_role("worker").post(f"/api/time-entries/{entry_id}/approve").status_code == 403


def test_worker_cannot_reject_entry(env):
    entry_id = env.make_entry("submitted")
    assert env.as_role("worker").post(f"/api/time-entries/{entry_id}/reject").status_code == 403


def test_supervisor_cannot_export(env):
    assert env.as_role("supervisor").get("/api/export/sage-csv").status_code == 403


def test_supervisor_cannot_lock_payroll(env):
    r = env.as_role("supervisor").post("/api/payroll-locks/lock", json={"week_start": "2026-01-05"})
    assert r.status_code == 403


def test_supervisor_can_read_audit_log(env):
    assert env.as_role("supervisor").get("/api/audit-logs/").status_code == 200


def test_admin_can_list_users(env):
    assert env.as_role("admin").get("/api/users/").status_code == 200
