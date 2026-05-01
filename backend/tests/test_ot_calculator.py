"""
Unit tests for services/ot_calculator.py

Run: cd backend && python -m pytest tests/test_ot_calculator.py -v
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import date
from dataclasses import dataclass
from services.ot_calculator import classify_week_hours, OTSettings


# ── Minimal TimeEntry stub (no DB dependency) ──────────────────────────────

@dataclass
class FakeEntry:
    date: date
    total_hours: float
    status: str = "submitted"


# ── Iowa / FLSA settings (default) ────────────────────────────────────────

IOWA = OTSettings()  # weekly 40h OT, no daily thresholds


# ── CA settings ────────────────────────────────────────────────────────────

CA = OTSettings(
    daily_ot_threshold=8.0,
    daily_dt_threshold=12.0,
    weekly_ot_threshold=40.0,
)


# ── Helper ─────────────────────────────────────────────────────────────────

WEEK_START = date(2026, 4, 27)  # Monday


def make_entries(hours_per_day: list[float], start: date = WEEK_START) -> list[FakeEntry]:
    """Build one entry per day starting from `start`."""
    from datetime import timedelta
    return [
        FakeEntry(date=start + timedelta(days=i), total_hours=h)
        for i, h in enumerate(hours_per_day)
    ]


# ── Tests ──────────────────────────────────────────────────────────────────

def test_iowa_45_hours_5_days():
    """Iowa: 9h x 5 days = 40 reg + 5 OT, no DT."""
    entries = make_entries([9, 9, 9, 9, 9])
    result = classify_week_hours(entries, IOWA, WEEK_START)

    assert result.regular_hours == 40.0
    assert result.ot_hours == 5.0
    assert result.dt_hours == 0.0
    assert result.total_hours == 45.0


def test_iowa_38_hours_under_threshold():
    """Iowa: 38h spread across 5 days — all regular, no OT."""
    entries = make_entries([8, 8, 8, 7, 7])
    result = classify_week_hours(entries, IOWA, WEEK_START)

    assert result.regular_hours == 38.0
    assert result.ot_hours == 0.0
    assert result.dt_hours == 0.0
    assert result.total_hours == 38.0


def test_ca_10_hour_day():
    """CA daily: 10h → 8 reg + 2 OT, no DT."""
    entries = make_entries([10.0])
    result = classify_week_hours(entries, CA, WEEK_START)

    assert result.regular_hours == 8.0
    assert result.ot_hours == 2.0
    assert result.dt_hours == 0.0
    assert result.total_hours == 10.0


def test_ca_14_hour_day():
    """CA daily: 14h → 8 reg + 4 OT + 2 DT."""
    entries = make_entries([14.0])
    result = classify_week_hours(entries, CA, WEEK_START)

    assert result.regular_hours == 8.0
    assert result.ot_hours == 4.0
    assert result.dt_hours == 2.0
    assert result.total_hours == 14.0


def test_empty_week():
    """No entries → all zeros."""
    result = classify_week_hours([], IOWA, WEEK_START)

    assert result.regular_hours == 0.0
    assert result.ot_hours == 0.0
    assert result.dt_hours == 0.0
    assert result.total_hours == 0.0
    assert result.days == []


def test_rejected_entries_excluded_by_caller():
    """
    Rejected entries are filtered before calling classify_week_hours.
    An empty list (all entries rejected) returns zeros — no crash.
    """
    rejected = [
        FakeEntry(date=WEEK_START, total_hours=8.0, status="rejected"),
        FakeEntry(date=WEEK_START, total_hours=4.0, status="rejected"),
    ]
    # Caller filters: only pass non-rejected
    active = [e for e in rejected if e.status != "rejected"]
    result = classify_week_hours(active, IOWA, WEEK_START)

    assert result.total_hours == 0.0
    assert result.regular_hours == 0.0
