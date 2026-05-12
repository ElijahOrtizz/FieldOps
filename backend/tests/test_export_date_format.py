"""
Test: Sage 100 CSV export date columns use MM/DD/YYYY format.

Covers all three date fields in _entry_rows:
  - Date         (entry work date)
  - Approval_Date (when the entry was approved)
  - Export_Date   (today's date, added at export time)
"""
import sys, os, csv, io
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.export import _entry_rows, SAGE_DATE_FMT


# ── Minimal stubs ─────────────────────────────────────────────────────────────

class _Sup:
    first_name = "Jane"
    last_name  = "Smith"

class _Approval:
    supervisor = _Sup()
    created_at = datetime(2026, 3, 5, 10, 0, 0, tzinfo=timezone.utc)

class _Emp:
    sage_employee_id = None
    employee_number  = "E001"
    first_name = "Joe"
    last_name  = "Worker"

class _Job:
    job_number = "J001"
    job_name   = "Test Job"

class _CC:
    code        = "01-100"
    description = "General Labor"

class _Entry:
    employee   = _Emp()
    job        = _Job()
    cost_code  = _CC()
    approval   = _Approval()
    date       = date(2026, 5, 1)
    start_time = "07:00"
    end_time   = "15:30"
    total_hours = 8.5
    pay_type   = "Regular"
    notes      = ""


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_sage_date_fmt_constant():
    assert SAGE_DATE_FMT == "%m/%d/%Y"


def test_entry_date_is_mm_dd_yyyy():
    rows = _entry_rows([_Entry()])
    entry_date = rows[0][6]          # Date column (index 6)
    assert entry_date == "05/01/2026", f"Expected 05/01/2026, got {entry_date!r}"


def test_approval_date_is_mm_dd_yyyy():
    rows = _entry_rows([_Entry()])
    approval_date = rows[0][14]      # Approval_Date column (index 14)
    assert approval_date == "03/05/2026", f"Expected 03/05/2026, got {approval_date!r}"


def test_export_date_is_mm_dd_yyyy():
    rows = _entry_rows([_Entry()])
    export_date = rows[0][15]        # Export_Date column (index 15)
    # Value is today — just validate format, not exact date
    parts = export_date.split("/")
    assert len(parts) == 3, f"Expected MM/DD/YYYY, got {export_date!r}"
    assert len(parts[0]) == 2 and len(parts[1]) == 2 and len(parts[2]) == 4, \
        f"Expected MM/DD/YYYY, got {export_date!r}"


def test_no_iso_dates_in_csv_output():
    """No date column should contain a YYYY-MM-DD value."""
    import re
    iso_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    rows = _entry_rows([_Entry()])
    date_cols = [rows[0][6], rows[0][14], rows[0][15]]
    for val in date_cols:
        assert not iso_pattern.match(val), f"ISO date found in CSV: {val!r}"


def test_column_count_unchanged():
    """Ensure no columns were accidentally added or removed (expect 16)."""
    rows = _entry_rows([_Entry()])
    assert len(rows[0]) == 16, f"Expected 16 columns, got {len(rows[0])}"
