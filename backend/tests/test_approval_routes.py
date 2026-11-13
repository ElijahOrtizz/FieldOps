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
