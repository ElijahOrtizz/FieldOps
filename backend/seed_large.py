"""
Large crew seed — adds 30 realistic employees + time entries across the current week.
Safe to run multiple times (skips existing records).
Run: python3 seed_large.py
"""
import sys, os, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
import models
from auth import get_password_hash
from datetime import date, timedelta

Base.metadata.create_all(bind=engine)
db = SessionLocal()

TRADES = [
    "Carpenter", "Carpenter", "Carpenter",
    "Electrician", "Electrician",
    "Plumber", "Plumber",
    "Laborer", "Laborer", "Laborer",
    "Ironworker", "Mason", "Drywall",
    "Painter", "Equipment Operator",
    "Foreman", "Superintendent",
]

FIRST_NAMES = [
    "Carlos", "Maria", "DeShawn", "Tyler", "Priya", "James", "Sandra",
    "Miguel", "Jessica", "Robert", "Aisha", "Kevin", "Stephanie", "Luis",
    "Natasha", "Marcus", "Emily", "David", "Fatima", "Chris", "Angela",
    "Jason", "Yolanda", "Eric", "Brianna", "Anthony", "Mei", "Patrick",
    "Layla", "Brandon", "Jasmine", "Victor", "Hannah", "Omar", "Diana",
]

LAST_NAMES = [
    "Rodriguez", "Johnson", "Smith", "Williams", "Lee", "Davis", "Martinez",
    "Brown", "Wilson", "Taylor", "Anderson", "Thomas", "Jackson", "White",
    "Harris", "Thompson", "Garcia", "Moore", "Martin", "Walker", "Allen",
    "Young", "Hernandez", "King", "Lewis", "Robinson", "Clark", "Scott",
]

NOTES = [
    "Framing south wall", "Finish carpentry - doors", "Electrical rough-in",
    "Drywall hang 2nd floor", "Concrete form setup", "Site cleanup",
    "Mechanical room piping", "Roofing crew support", "Window installation",
    "Safety inspection walk", "Material staging", "Demo work level 3",
    "", "", "",  # some blank notes
]

def seed():
    today = date.today()
    week_start = today - timedelta(days=today.weekday())  # Monday
    week_end = week_start + timedelta(days=6)

    # Get supervisor employee to link to
    supervisor_user = db.query(models.User).filter(models.User.role == "supervisor").first()
    supervisor_emp = supervisor_user.employee if supervisor_user else None

    # Get active jobs and cost codes
    jobs = db.query(models.Job).filter(models.Job.status == "active").all()
    cost_codes = db.query(models.CostCode).filter(models.CostCode.is_active == True).all()

    if not jobs or not cost_codes:
        print("ERROR: No jobs or cost codes found. Run seed.py first.")
        return

    added_emps = 0
    added_entries = 0

    used_names = set()
    for i in range(35):
        # Pick unique name
        for _ in range(50):
            fn = random.choice(FIRST_NAMES)
            ln = random.choice(LAST_NAMES)
            if (fn, ln) not in used_names:
                used_names.add((fn, ln))
                break

        emp_num = f"EMP-{1000 + i:04d}"
        existing = db.query(models.Employee).filter(
            models.Employee.employee_number == emp_num).first()
        if existing:
            emp = existing
        else:
            trade = random.choice(TRADES)
            emp = models.Employee(
                employee_number=emp_num,
                first_name=fn,
                last_name=ln,
                trade=trade,
                pay_type="Regular",
                hourly_rate=random.choice([28.0, 32.0, 35.0, 38.0, 42.0, 48.0]),
                supervisor_id=supervisor_emp.id if supervisor_emp else None,
                is_active=True,
            )
            db.add(emp)
            db.flush()
            added_emps += 1

        # ~80% of employees log time this week
        if random.random() > 0.20:
            # Log 3-5 days of time
            days_worked = random.sample(range(7), k=random.randint(3, 5))
            for day_offset in days_worked:
                entry_date = week_start + timedelta(days=day_offset)
                # Skip weekends for most workers
                if day_offset >= 5 and random.random() > 0.25:
                    continue
                # Check if already has an entry that day
                existing_entry = db.query(models.TimeEntry).filter(
                    models.TimeEntry.employee_id == emp.id,
                    models.TimeEntry.date == entry_date,
                ).first()
                if existing_entry:
                    continue

                job = random.choice(jobs)
                cc = random.choice(cost_codes)
                start_h = random.randint(6, 8)
                hours = random.choice([8, 8, 8, 8.5, 9, 10])
                end_h = start_h + int(hours)
                start_time = f"{start_h:02d}:00"
                end_time = f"{end_h:02d}:{'30' if hours % 1 else '00'}"

                # Random status distribution
                r = random.random()
                if r < 0.45:
                    status = "submitted"
                elif r < 0.75:
                    status = "approved"
                elif r < 0.88:
                    status = "rejected"
                else:
                    status = "exported"

                entry = models.TimeEntry(
                    employee_id=emp.id,
                    job_id=job.id,
                    cost_code_id=cc.id,
                    date=entry_date,
                    start_time=start_time,
                    end_time=end_time,
                    total_hours=hours,
                    pay_type="Regular",
                    notes=random.choice(NOTES),
                    status=status,
                    sage_sync_status="not_ready",
                )
                db.add(entry)
                added_entries += 1

    db.commit()
    db.close()

    total_emps = len(db.query(models.Employee).all()) if False else None
    print(f"✅ Large seed complete:")
    print(f"   Added {added_emps} new employees")
    print(f"   Added {added_entries} new time entries")
    print(f"   (employees without time this week: ~20% of {added_emps})")


    # --- SCHEDULE ASSIGNMENTS (Phase 2.3 demo data) ---
    existing_sched = db.query(models.ScheduleAssignment).count()
    if existing_sched == 0:
        import random as _rand
        active_employees = db.query(models.Employee).filter(models.Employee.is_active == True).all()
        active_jobs = db.query(models.Job).filter(models.Job.status == "active").all()
        if active_employees and active_jobs:
            sched_count = 0
            for emp in _rand.sample(active_employees, min(20, len(active_employees))):
                # Schedule 3-5 days this week
                for day_offset in _rand.sample(range(5), k=_rand.randint(3, 5)):
                    sched_date = week_start + timedelta(days=day_offset)
                    job = _rand.choice(active_jobs)
                    start_h = _rand.choice([6, 7, 8])
                    hours = _rand.choice([8, 8.5, 9, 10])
                    end_h = start_h + int(hours)
                    a = models.ScheduleAssignment(
                        employee_id=emp.id,
                        job_id=job.id,
                        date=sched_date,
                        planned_start_time=f"{start_h:02d}:00",
                        planned_end_time=f"{end_h:02d}:{'30' if hours % 1 else '00'}",
                        planned_hours=hours,
                        role=emp.trade,
                        status="scheduled",
                    )
                    db.add(a)
                    sched_count += 1
            db.commit()
            print(f"   Added {sched_count} schedule assignments")
    # ── Phase 2.4/2.5 demo data ──────────────────────────────────────────────
    from datetime import datetime as dt

    # Skip if already seeded
    if db.query(models.ClockSession).count() == 0:
        worker_emps = db.query(models.Employee).filter(models.Employee.is_active == True).limit(3).all()
        active_jobs = db.query(models.Job).filter(models.Job.status == "active").limit(2).all()
        if worker_emps and active_jobs:
            # Completed clock session (earlier today)
            cs = models.ClockSession(
                employee_id=worker_emps[0].id,
                job_id=active_jobs[0].id,
                clock_in_time=dt.now().replace(hour=7, minute=0, second=0, microsecond=0),
                clock_out_time=dt.now().replace(hour=15, minute=30, second=0, microsecond=0),
                status="completed",
            )
            db.add(cs)
            # Active clock session (still clocked in)
            if len(worker_emps) > 1:
                cs2 = models.ClockSession(
                    employee_id=worker_emps[1].id,
                    job_id=active_jobs[0].id,
                    clock_in_time=dt.now().replace(hour=8, minute=0, second=0, microsecond=0),
                    status="active",
                )
                db.add(cs2)
            db.commit()
            print(f"   Added clock session demo data")

    # Correction request demo
    if db.query(models.CorrectionRequest).count() == 0:
        entry = db.query(models.TimeEntry).filter(models.TimeEntry.status == "submitted").first()
        if entry:
            cr = models.CorrectionRequest(
                time_entry_id=entry.id,
                employee_id=entry.employee_id,
                reason="Logged wrong job — should be 2024-003 not 2024-001",
                requested_job_id=db.query(models.Job).filter(models.Job.job_number == "2024-003").first().id
                    if db.query(models.Job).filter(models.Job.job_number == "2024-003").first() else None,
                status="pending",
            )
            db.add(cr)
            db.commit()
            print(f"   Added correction request demo data")


if __name__ == "__main__":
    seed()
    db.close()
