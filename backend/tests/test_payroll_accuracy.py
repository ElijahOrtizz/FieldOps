"""
Payroll accuracy checks for services/ot_calculator.py.

Each expected value below is calculated by hand in the comment above it,
independently of the code under test.
"""
import os
import sys
from dataclasses import dataclass
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.ot_calculator import OTSettings, classify_week_hours  # noqa: E402

MONDAY = date(2026, 1, 5)


@dataclass
class Entry:
    date: date
    total_hours: float
    status: str = "approved"


def week(hours):
    return [Entry(MONDAY + timedelta(days=i), h) for i, h in enumerate(hours)]


def test_46_hour_week_is_40_regular_and_6_overtime():
    # 10+10+10+10+6 = 46. Over 40 by 6.
    r = classify_week_hours(week([10, 10, 10, 10, 6]), OTSettings(), MONDAY)
    assert (r.regular_hours, r.ot_hours, r.dt_hours, r.total_hours) == (40.0, 6.0, 0.0, 46.0)


def test_exactly_40_hours_has_no_overtime():
    # 5 x 8 = 40. Not over 40.
    r = classify_week_hours(week([8] * 5), OTSettings(), MONDAY)
    assert (r.regular_hours, r.ot_hours) == (40.0, 0.0)


def test_half_hour_over_40_is_half_hour_overtime():
    # 8+8+8+8+8.5 = 40.5. Over 40 by 0.5.
    r = classify_week_hours(week([8, 8, 8, 8, 8.5]), OTSettings(), MONDAY)
    assert (r.regular_hours, r.ot_hours) == (40.0, 0.5)


def test_daily_double_time_split_on_a_14_hour_day():
    # 14h with daily OT at 8 and DT at 12: 8 regular, 4 OT (8 to 12), 2 DT (12 to 14).
    settings = OTSettings(daily_ot_threshold=8.0, daily_dt_threshold=12.0)
    r = classify_week_hours(week([14]), settings, MONDAY)
    assert (r.regular_hours, r.ot_hours, r.dt_hours, r.total_hours) == (8.0, 4.0, 2.0, 14.0)


def test_daily_rules_then_weekly_overflow():
    # Six 8h days: each day is all regular (48 regular). Weekly cap 40 moves 8 to OT.
    settings = OTSettings(daily_ot_threshold=8.0, daily_dt_threshold=12.0)
    r = classify_week_hours(week([8] * 6), settings, MONDAY)
    assert (r.regular_hours, r.ot_hours, r.dt_hours) == (40.0, 8.0, 0.0)


def test_seventh_day_rule_makes_all_seventh_day_hours_overtime():
    # Seven 8h days. Day 7 is all OT (8). Days 1 to 6 = 48 regular, 8 over 40 becomes OT.
    # Regular 40, OT 8 + 8 = 16, total 56.
    r = classify_week_hours(week([8] * 7), OTSettings(seventh_day_rule=True), MONDAY)
    assert (r.regular_hours, r.ot_hours, r.dt_hours, r.total_hours) == (40.0, 16.0, 0.0, 56.0)


def test_two_entries_on_one_day_are_added_before_daily_threshold():
    # 5 + 4 = 9h on one day, daily OT at 8: 8 regular, 1 OT.
    entries = [Entry(MONDAY, 5.0), Entry(MONDAY, 4.0)]
    r = classify_week_hours(entries, OTSettings(daily_ot_threshold=8.0), MONDAY)
    assert (r.regular_hours, r.ot_hours) == (8.0, 1.0)


def test_empty_week_is_all_zero():
    r = classify_week_hours([], OTSettings(), MONDAY)
    assert (r.regular_hours, r.ot_hours, r.dt_hours, r.total_hours) == (0.0, 0.0, 0.0, 0.0)


def test_custom_multipliers_are_passed_through():
    r = classify_week_hours(week([8]), OTSettings(ot_multiplier=1.75, dt_multiplier=2.5), MONDAY)
    assert (r.ot_multiplier, r.dt_multiplier) == (1.75, 2.5)
