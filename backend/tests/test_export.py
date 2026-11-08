"""Sage-ready CSV export: filtering, format, and the download vs confirm split."""
import csv
import io
from datetime import date, timedelta

import models

EXPECTED_HEADER = [
    "Employee_ID", "Employee_Name", "Job_Number", "Job_Name",
    "Cost_Code", "Cost_Code_Desc", "Date", "Day_Of_Week",
    "Start_Time", "End_Time", "Hours", "Pay_Type",
    "Notes", "Approved_By", "Approval_Date", "Export_Date",
]


def _rows(response):
    return list(csv.DictReader(io.StringIO(response.text)))


def test_preview_lists_only_approved_entries(env):
    env.make_entry("approved")
    env.make_entry("submitted", days_ago=4)
    r = env.as_role("admin").get("/api/export/preview")
    assert r.status_code == 200
    assert r.json()["record_count"] == 1


def test_csv_has_one_row_with_eight_hours(env):
    env.make_entry("approved", hours=8.0)
    r = env.as_role("admin").get("/api/export/sage-csv")
    rows = _rows(r)
    assert len(rows) == 1
    assert float(rows[0]["Hours"]) == 8.0
    assert rows[0]["Pay_Type"] == "Regular"


def test_csv_excludes_unapproved_entries(env):
    env.make_entry("approved", days_ago=3)
    env.make_entry("submitted", days_ago=4)
    env.make_entry("rejected", days_ago=5)
    rows = _rows(env.as_role("admin").get("/api/export/sage-csv"))
    assert len(rows) == 1


def test_csv_header_keeps_sage_column_order(env):
    env.make_entry("approved")
    r = env.as_role("admin").get("/api/export/sage-csv")
    assert next(csv.reader(io.StringIO(r.text))) == EXPECTED_HEADER


def test_csv_date_uses_us_format(env):
    env.make_entry("approved", days_ago=3)
    expected = (date.today() - timedelta(days=3)).strftime("%m/%d/%Y")
    rows = _rows(env.as_role("admin").get("/api/export/sage-csv"))
    assert rows[0]["Date"] == expected


def test_download_without_confirmation_leaves_entries_approved(env):
    entry_id = env.make_entry("approved")
    assert env.as_role("admin").get("/api/export/sage-csv").status_code == 200
    db = env.session()
    entry = db.query(models.TimeEntry).get(entry_id)
    status = entry.status.value if hasattr(entry.status, "value") else str(entry.status)
    assert status == "approved"
    assert db.query(models.ExportBatch).count() == 0
    db.close()


def test_confirmation_marks_exported_and_records_batch(env):
    entry_id = env.make_entry("approved")
    env.as_role("admin").get("/api/export/sage-csv?mark_exported=true")
    db = env.session()
    entry = db.query(models.TimeEntry).get(entry_id)
    status = entry.status.value if hasattr(entry.status, "value") else str(entry.status)
    assert status == "exported"
    batch = db.query(models.ExportBatch).one()
    assert batch.record_count == 1
    assert entry.export_batch_id == batch.id
    db.close()


def test_exported_entries_are_not_exported_twice(env):
    env.make_entry("approved")
    admin = env.as_role("admin")
    admin.get("/api/export/sage-csv?mark_exported=true")
    assert admin.get("/api/export/sage-csv").status_code == 404
    assert admin.get("/api/export/sage-csv?include_exported=true").status_code == 200


def test_export_with_nothing_approved_returns_404(env):
    env.make_entry("submitted")
    assert env.as_role("admin").get("/api/export/sage-csv").status_code == 404
