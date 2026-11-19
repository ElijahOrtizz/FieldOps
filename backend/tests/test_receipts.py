"""Receipt uploads: access control, file limits, and authenticated download."""
import io
import models
import storage


def _upload(client, entry_id, name="r.png", data=b"\x89PNG-data"):
    return client.post(f"/api/time-entries/{entry_id}/upload", files={"file": (name, io.BytesIO(data))})


def test_owner_can_upload_and_download(env, tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "LOCAL_DIR", str(tmp_path))
    eid = env.make_entry("submitted")
    r = _upload(env.as_role("worker"), eid)
    assert r.status_code == 200, r.text
    got = env.as_role("worker").get(f"/api/time-entries/receipts/{r.json()['id']}/file")
    assert got.status_code == 200
    assert got.content == b"\x89PNG-data"


def test_other_worker_cannot_upload_or_download(env, tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "LOCAL_DIR", str(tmp_path))
    eid = env.make_entry("submitted")
    rid = _upload(env.as_role("admin"), eid).json()["id"]
    # supervisor is not the worker's supervisor in this fixture
    assert _upload(env.as_role("supervisor"), eid).status_code == 403
    assert env.as_role("supervisor").get(f"/api/time-entries/receipts/{rid}/file").status_code == 403


def test_bad_type_and_oversize_rejected(env, tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "LOCAL_DIR", str(tmp_path))
    eid = env.make_entry("submitted")
    c = env.as_role("worker")
    assert _upload(c, eid, name="x.exe").status_code == 400
    assert _upload(c, eid, name="x.png", data=b"").status_code == 400
    assert _upload(c, eid, name="x.png", data=b"a" * (10 * 1024 * 1024 + 1)).status_code == 413


def test_download_requires_login_and_valid_receipt(env):
    assert env.as_role("admin").get("/api/time-entries/receipts/9999/file").status_code == 404


def test_s3_backend_is_used_when_bucket_set(env, monkeypatch):
    calls = {}

    class FakeS3:
        def put_object(self, **kw):
            calls["put"] = kw

    monkeypatch.setenv("S3_BUCKET", "stryda-test")
    monkeypatch.setattr(storage, "_s3", lambda: FakeS3())
    eid = env.make_entry("submitted")
    r = _upload(env.as_role("worker"), eid)
    assert r.status_code == 200, r.text
    assert calls["put"]["Bucket"] == "stryda-test"
    assert calls["put"]["Key"].startswith("receipts/")
    db = env.session()
    loc = db.query(models.Receipt).first().file_path
    db.close()
    assert loc.startswith("s3://stryda-test/receipts/")
