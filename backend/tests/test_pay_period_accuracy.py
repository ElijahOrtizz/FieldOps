"""
Pay period accuracy check (synthetic data).

Three weekly pay periods for three workers are loaded as approved entries.
Expected regular and overtime hours were calculated by hand from the daily
hours below (federal rule: overtime is hours over 40 in a workweek). The test
checks two things:

  1. services/ot_calculator splits each worker-week exactly as calculated.
  2. The Sage CSV from the real export endpoint totals the same hours per
     worker as the hand calculation.

The CSV carries total hours per entry and a Pay_Type column. It does not
split regular and overtime hours, so overtime is checked at the calculator
level and totals are checked at the CSV level.

Data is synthetic and labeled as such. It is not Calray payroll data.
"""
import csv
import io
from collections import defaultdict
from datetime import date, timedelta

import models
from services.ot_calculator import OTSettings, classify_week_hours

WEEK_STARTS = [date(2026, 9, 7), date(2026, 9, 14), date(2026, 9, 21)]  # Mondays

# worker employee_number -> per week: (hours Mon..Sun, expected regular, expected overtime)
# Hand calculations:
#   E101 wk1 8x5 = 40 -> 40 / 0          E101 wk2 10x4 + 6 = 46 -> 40 / 6
#   E101 wk3 8x5 + 4 = 44 -> 40 / 4
#   E102 wk1 9x5 + 5 = 50 -> 40 / 10     E102 wk2 8x3 = 24 -> 24 / 0
#   E102 wk3 8x7 = 56 -> 40 / 16
#   E103 wk1 4x5 = 20 -> 20 / 0          E103 wk2 8x4 + 8.5 = 40.5 -> 40 / 0.5
#   E103 wk3 12x3 = 36 -> 36 / 0
DATA = {
    "E101": [
        ([8, 8, 8, 8, 8, 0, 0], 40.0, 0.0),
        ([10, 10, 10, 10, 6, 0, 0], 40.0, 6.0),
        ([8, 8, 8, 8, 8, 4, 0], 40.0, 4.0),
    ],
    "E102": [
        ([9, 9, 9, 9, 9, 5, 0], 40.0, 10.0),
        ([8, 8, 8, 0, 0, 0, 0], 24.0, 0.0),
        ([8, 8, 8, 8, 8, 8, 8], 40.0, 16.0),
    ],
    "E103": [
        ([4, 4, 4, 4, 4, 0, 0], 20.0, 0.0),
        ([8, 8, 8, 8, 8.5, 0, 0], 40.0, 0.5),
        ([12, 12, 12, 0, 0, 0, 0], 36.0, 0.0),
    ],
}
# Hand totals across the three weeks: E101 130, E102 130, E103 96.5
EXPECTED_TOTALS = {"E101": 130.0, "E102": 130.0, "E103": 96.5}


def _load(env):
    db = env.session()
    for number in DATA:
        emp = models.Employee(first_name=number, last_name="Synthetic",
                              employee_number=number, hourly_rate=20.0)
        db.add(emp)
        db.commit()
        for week_idx, (hours, _, _) in enumerate(DATA[number]):
            for day_idx, h in enumerate(hours):
                if h:
                    db.add(models.TimeEntry(
                        employee_id=emp.id, job_id=env.ids["job"], cost_code_id=env.ids["cc"],
                        date=WEEK_STARTS[week_idx] + timedelta(days=day_idx),
                        total_hours=float(h), pay_type="Regular", status="approved",
                    ))
        db.commit()
    db.close()


def test_calculator_matches_hand_calculation_for_every_worker_week(env):
    _load(env)
    db = env.session()
    for number, weeks in DATA.items():
        emp = db.query(models.Employee).filter_by(employee_number=number).one()
        for week_idx, (_, exp_reg, exp_ot) in enumerate(weeks):
            start = WEEK_STARTS[week_idx]
            entries = db.query(models.TimeEntry).filter(
                models.TimeEntry.employee_id == emp.id,
                models.TimeEntry.date >= start,
                models.TimeEntry.date <= start + timedelta(days=6),
            ).all()
            result = classify_week_hours(entries, OTSettings(), start)
            assert (result.regular_hours, result.ot_hours, result.dt_hours) == (exp_reg, exp_ot, 0.0), \
                f"{number} week {week_idx + 1}"
    db.close()


def test_csv_totals_match_hand_totals_per_worker(env):
    _load(env)
    r = env.as_role("admin").get("/api/export/sage-csv")
    assert r.status_code == 200
    totals = defaultdict(float)
    for row in csv.DictReader(io.StringIO(r.text)):
        totals[row["Employee_ID"]] += float(row["Hours"])
    assert {k: round(v, 2) for k, v in totals.items()} == EXPECTED_TOTALS


def test_all_hand_calculated_hours_are_accounted_for(env):
    # Regular + overtime from the hand table equals the hours loaded.
    for number, weeks in DATA.items():
        assert sum(sum(h) for h, _, _ in weeks) == EXPECTED_TOTALS[number]
        assert sum(reg + ot for _, reg, ot in weeks) == EXPECTED_TOTALS[number]


def test_california_style_daily_rules_match_hand_calculation():
    # Day 1: 8h -> 8 regular. Day 2: 10h -> 8 regular + 2 OT.
    # Day 3: 13h -> 8 regular + 4 OT (8 to 12) + 1 DT (over 12).
    # Totals: 24 regular, 6 OT, 1 DT = 31 hours.
    class E:
        def __init__(self, d, h):
            self.date, self.total_hours = d, float(h)

    monday = WEEK_STARTS[0]
    entries = [E(monday, 8), E(monday + timedelta(days=1), 10), E(monday + timedelta(days=2), 13)]
    settings = OTSettings(daily_ot_threshold=8.0, daily_dt_threshold=12.0)
    r = classify_week_hours(entries, settings, monday)
    assert (r.regular_hours, r.ot_hours, r.dt_hours, r.total_hours) == (24.0, 6.0, 1.0, 31.0)
