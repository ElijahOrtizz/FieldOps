"""
OT/DT classification — pure function, no DB access.

Rules are applied in two passes:
  1. Daily pass: classify each day's hours using daily_ot_threshold / daily_dt_threshold.
  2. Weekly pass: accumulated regular hours that exceed weekly_ot_threshold become OT.

Defaults match federal FLSA / Iowa: weekly OT at 40 h, no daily thresholds, no DT, no 7th-day rule.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Optional
from collections import defaultdict


@dataclass
class OTSettings:
    daily_ot_threshold: Optional[float] = None   # None = disabled
    daily_dt_threshold: Optional[float] = None   # None = disabled
    weekly_ot_threshold: Optional[float] = 40.0  # None = no weekly OT
    weekly_dt_threshold: Optional[float] = None
    seventh_day_rule: bool = False
    ot_multiplier: float = 1.5
    dt_multiplier: float = 2.0


@dataclass
class DayBreakdown:
    date: date
    regular_hours: float
    ot_hours: float
    dt_hours: float


@dataclass
class WeekHoursBreakdown:
    days: list  # list[DayBreakdown]
    regular_hours: float
    ot_hours: float
    dt_hours: float
    total_hours: float
    ot_multiplier: float
    dt_multiplier: float


def classify_week_hours(
    entries: list,
    settings: OTSettings,
    week_start_date: date,
) -> WeekHoursBreakdown:
    """
    Classify a list of TimeEntry records into regular / OT / DT for one week.

    Caller is responsible for:
      - Passing only entries within the target week
      - Excluding entries with status == 'rejected' before calling

    Returns a WeekHoursBreakdown with per-day detail and weekly totals.
    """
    if not entries:
        return WeekHoursBreakdown(
            days=[],
            regular_hours=0.0,
            ot_hours=0.0,
            dt_hours=0.0,
            total_hours=0.0,
            ot_multiplier=settings.ot_multiplier,
            dt_multiplier=settings.dt_multiplier,
        )

    # Group by date, summing total_hours
    day_totals: dict[date, float] = defaultdict(float)
    for entry in entries:
        day_totals[entry.date] += entry.total_hours

    sorted_dates = sorted(day_totals.keys())
    has_all_seven = len(sorted_dates) == 7

    day_breakdowns: list[DayBreakdown] = []
    weekly_regular = 0.0
    weekly_ot = 0.0
    weekly_dt = 0.0

    for i, d in enumerate(sorted_dates):
        day_total = day_totals[d]
        is_seventh_day = settings.seventh_day_rule and has_all_seven and i == 6

        if is_seventh_day:
            # CA 7th-day rule: all hours are OT, hours > 8 become DT
            day_reg = 0.0
            day_ot = min(day_total, 8.0)
            day_dt = max(0.0, day_total - 8.0)

        elif settings.daily_ot_threshold is not None:
            # Daily OT (and optionally DT) thresholds
            day_reg = min(day_total, settings.daily_ot_threshold)
            if settings.daily_dt_threshold is not None:
                day_ot = max(0.0, min(day_total, settings.daily_dt_threshold) - settings.daily_ot_threshold)
                day_dt = max(0.0, day_total - settings.daily_dt_threshold)
            else:
                day_ot = max(0.0, day_total - settings.daily_ot_threshold)
                day_dt = 0.0

        else:
            # No daily thresholds — all hours are regular at this stage
            day_reg = day_total
            day_ot = 0.0
            day_dt = 0.0

        day_breakdowns.append(DayBreakdown(
            date=d,
            regular_hours=round(day_reg, 4),
            ot_hours=round(day_ot, 4),
            dt_hours=round(day_dt, 4),
        ))
        weekly_regular += day_reg
        weekly_ot += day_ot
        weekly_dt += day_dt

    # Weekly OT pass: regular hours exceeding weekly_ot_threshold → OT
    if settings.weekly_ot_threshold is not None and weekly_regular > settings.weekly_ot_threshold:
        overflow = weekly_regular - settings.weekly_ot_threshold
        weekly_regular = settings.weekly_ot_threshold
        weekly_ot += overflow

    total = weekly_regular + weekly_ot + weekly_dt

    return WeekHoursBreakdown(
        days=day_breakdowns,
        regular_hours=round(weekly_regular, 2),
        ot_hours=round(weekly_ot, 2),
        dt_hours=round(weekly_dt, 2),
        total_hours=round(total, 2),
        ot_multiplier=settings.ot_multiplier,
        dt_multiplier=settings.dt_multiplier,
    )
