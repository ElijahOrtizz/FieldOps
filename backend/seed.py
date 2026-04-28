"""
Seed script for FieldOps MVP demo data.
Run: python seed.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
import models
from auth import get_password_hash
from datetime import date, timedelta
import random

Base.metadata.create_all(bind=engine)
db = SessionLocal()


def seed():
    print("Seeding database...")

    # --- USERS ---
    users_data = [
        {"email": "admin@fieldops.com", "password": "admin123", "role": "admin"},
        {"email": "supervisor@fieldops.com", "password": "super123", "role": "supervisor"},
        {"email": "worker1@fieldops.com", "password": "work123", "role": "worker"},
        {"email": "worker2@fieldops.com", "password": "work123", "role": "worker"},
        {"email": "worker3@fieldops.com", "password": "work123", "role": "worker"},
    ]

    users = []
    for ud in users_data:
        existing = db.query(models.User).filter(models.User.email == ud["email"]).first()
        if not existing:
            u = models.User(
                email=ud["email"],
                hashed_password=get_password_hash(ud["password"]),
                role=ud["role"]
            )
            db.add(u)
            db.flush()
            users.append(u)
            print(f"  Created user: {ud['email']} ({ud['role']})")
        else:
            users.append(existing)

    db.commit()

    # --- EMPLOYEES ---
    employees_data = [
        {"employee_number": "E001", "first_name": "Alex", "last_name": "Rivera", "trade": "Foreman", "pay_type": "Regular", "hourly_rate": 32.0, "email": "admin@fieldops.com"},
        {"employee_number": "E002", "first_name": "Marcus", "last_name": "Cole", "trade": "Carpenter", "pay_type": "Regular", "hourly_rate": 28.0, "email": "supervisor@fieldops.com"},
        {"employee_number": "E003", "first_name": "Tyler", "last_name": "Brooks", "trade": "Laborer", "pay_type": "Regular", "hourly_rate": 22.0, "email": "worker1@fieldops.com"},
        {"employee_number": "E004", "first_name": "Jordan", "last_name": "Vega", "trade": "Electrician", "pay_type": "Regular", "hourly_rate": 30.0, "email": "worker2@fieldops.com"},
        {"employee_number": "E005", "first_name": "Casey", "last_name": "Park", "trade": "Carpenter", "pay_type": "Regular", "hourly_rate": 26.0, "email": "worker3@fieldops.com"},
    ]

    employees = []
    for i, ed in enumerate(employees_data):
        existing = db.query(models.Employee).filter(models.Employee.employee_number == ed["employee_number"]).first()
        if not existing:
            user = db.query(models.User).filter(models.User.email == ed["email"]).first()
            emp = models.Employee(
                employee_number=ed["employee_number"],
                first_name=ed["first_name"],
                last_name=ed["last_name"],
                trade=ed["trade"],
                pay_type=ed["pay_type"],
                hourly_rate=ed["hourly_rate"],
                user_id=user.id if user else None,
                sage_employee_id=f"SAGE-{ed['employee_number']}"
            )
            db.add(emp)
            db.flush()
            employees.append(emp)
            print(f"  Created employee: {ed['first_name']} {ed['last_name']}")
        else:
            employees.append(existing)

    db.commit()

    # Set supervisor for workers (supervisor is employees[1])
    supervisor = employees[1]
    for emp in employees[2:]:
        if not emp.supervisor_id:
            emp.supervisor_id = supervisor.id
    db.commit()

    # --- JOBS ---
    jobs_data = [
        {
            "job_number": "2024-001",
            "job_name": "Oakwood Medical Center - Phase 2",
            "client_name": "Oakwood Health Systems",
            "city": "Jacksonville",
            "state": "FL",
            "status": "active",
            "budget_hours": 2400,
            "budget_cost": 185000,
            "start_date": date(2024, 1, 15),
        },
        {
            "job_number": "2024-002",
            "job_name": "Harbor View Apartments - Renovation",
            "client_name": "Harbor View Properties",
            "city": "Jacksonville",
            "state": "FL",
            "status": "active",
            "budget_hours": 1800,
            "budget_cost": 132000,
            "start_date": date(2024, 2, 1),
        },
        {
            "job_number": "2024-003",
            "job_name": "Riverside Office Park - Tenant Build-out",
            "client_name": "Riverside Commercial RE",
            "city": "Orange Park",
            "state": "FL",
            "status": "active",
            "budget_hours": 960,
            "budget_cost": 74000,
            "start_date": date(2024, 3, 10),
        },
        {
            "job_number": "2023-018",
            "job_name": "Summerfield Community Center",
            "client_name": "City of Jacksonville",
            "city": "Jacksonville",
            "state": "FL",
            "status": "completed",
            "budget_hours": 3200,
            "budget_cost": 248000,
            "start_date": date(2023, 6, 1),
            "end_date": date(2024, 1, 31),
        },
    ]

    jobs = []
    for jd in jobs_data:
        existing = db.query(models.Job).filter(models.Job.job_number == jd["job_number"]).first()
        if not existing:
            j = models.Job(**jd, sage_job_id=f"SAGE-J-{jd['job_number']}")
            db.add(j)
            db.flush()
            jobs.append(j)
            print(f"  Created job: {jd['job_number']} - {jd['job_name']}")
        else:
            jobs.append(existing)

    db.commit()

    # --- COST CODES ---
    cost_codes_data = [
        {"code": "01-000", "description": "General Conditions", "category": "Labor"},
        {"code": "03-100", "description": "Concrete Formwork", "category": "Labor"},
        {"code": "03-200", "description": "Concrete Reinforcing", "category": "Labor"},
        {"code": "03-300", "description": "Cast-in-Place Concrete", "category": "Labor"},
        {"code": "06-100", "description": "Rough Carpentry", "category": "Labor"},
        {"code": "06-200", "description": "Finish Carpentry", "category": "Labor"},
        {"code": "09-200", "description": "Drywall / Gypsum Board", "category": "Labor"},
        {"code": "09-300", "description": "Tile Work", "category": "Labor"},
        {"code": "09-900", "description": "Painting & Coatings", "category": "Labor"},
        {"code": "16-100", "description": "Rough Electrical", "category": "Labor"},
        {"code": "16-200", "description": "Finish Electrical", "category": "Labor"},
        {"code": "15-100", "description": "Rough Plumbing", "category": "Labor"},
        {"code": "15-200", "description": "Finish Plumbing", "category": "Labor"},
        {"code": "02-200", "description": "Earthwork / Grading", "category": "Labor"},
        {"code": "EQ-100", "description": "Equipment Operation", "category": "Equipment"},
        {"code": "OT-001", "description": "Overtime Labor", "category": "Labor"},
    ]

    cost_codes = []
    for cc in cost_codes_data:
        existing = db.query(models.CostCode).filter(models.CostCode.code == cc["code"]).first()
        if not existing:
            c = models.CostCode(**cc, sage_cost_code=f"SAGE-CC-{cc['code']}")
            db.add(c)
            db.flush()
            cost_codes.append(c)
        else:
            cost_codes.append(existing)
    db.commit()
    print(f"  Created {len(cost_codes_data)} cost codes")

    # --- TIME ENTRIES ---
    today = date.today()
    statuses = ["submitted", "submitted", "approved", "approved", "approved", "rejected"]
    worker_emps = employees[2:]  # E003, E004, E005
    active_jobs = jobs[:3]
    labor_codes = [cc for cc in cost_codes if cc.category == "Labor"]

    entry_count = 0
    for i in range(25):
        entry_date = today - timedelta(days=random.randint(0, 14))
        emp = random.choice(worker_emps)
        job = random.choice(active_jobs)
        cc = random.choice(labor_codes)
        hours = round(random.choice([7.5, 8.0, 8.5, 9.0, 4.0]), 1)
        status = random.choice(statuses)
        start_h = random.choice(["06:30", "07:00", "07:30"])
        end_h = "15:30" if hours == 8.0 else "16:00"

        existing = db.query(models.TimeEntry).filter(
            models.TimeEntry.employee_id == emp.id,
            models.TimeEntry.date == entry_date,
            models.TimeEntry.job_id == job.id
        ).first()
        if existing:
            continue

        entry = models.TimeEntry(
            employee_id=emp.id,
            job_id=job.id,
            cost_code_id=cc.id,
            date=entry_date,
            start_time=start_h,
            end_time=end_h,
            total_hours=hours,
            pay_type="Regular",
            notes=random.choice([
                "Framing south wall section",
                "Finish carpentry - door frames",
                "Drywall hang - 2nd floor",
                "Concrete form setup",
                "Site cleanup and prep",
                "",
            ]),
            status=status
        )
        db.add(entry)
        db.flush()

        if status == "approved":
            approval = models.Approval(
                time_entry_id=entry.id,
                supervisor_id=supervisor.id,
                action="approved",
                notes="Looks good."
            )
            db.add(approval)
        elif status == "rejected":
            approval = models.Approval(
                time_entry_id=entry.id,
                supervisor_id=supervisor.id,
                action="rejected",
                notes="Incorrect job number. Please resubmit."
            )
            db.add(approval)

        entry_count += 1

    db.commit()
    print(f"  Created {entry_count} time entries")


    # --- COMPANY SETTINGS ---
    if not db.query(models.CompanySettings).first():
        settings = models.CompanySettings(
            company_name="Demo Contractor LLC",
            default_pay_type="Regular",
            overtime_threshold=8.0,
            sage_export_format="sage_100",
            upload_dir="uploads",
        )
        db.add(settings)
        db.commit()
        print("  Created company settings")

    # --- MATERIAL REQUESTS (Phase 2 demo data) ---
    mat_count = db.query(models.MaterialRequest).count()
    if mat_count == 0:
        workers_emp = db.query(models.Employee).filter(models.Employee.is_active == True).all()
        active_jobs_list = db.query(models.Job).filter(models.Job.status == "active").all()
        cost_codes_list = db.query(models.CostCode).filter(models.CostCode.is_active == True).all()

        if workers_emp and active_jobs_list:
            mat_data = [
                {"material_name": "2x4x8 Framing Lumber", "quantity": 200, "unit": "each", "priority": "high", "status": "requested"},
                {"material_name": "Concrete Mix - 80lb Bags", "quantity": 50, "unit": "bags", "priority": "urgent", "status": "approved"},
                {"material_name": "Drywall Sheets 4x8", "quantity": 40, "unit": "sheets", "priority": "normal", "status": "ordered"},
                {"material_name": "Box Nails 16d", "quantity": 10, "unit": "boxes", "priority": "low", "status": "delivered"},
                {"material_name": "Primer Paint - White", "quantity": 5, "unit": "gallons", "priority": "normal", "status": "requested"},
                {"material_name": "Safety Harness Set", "quantity": 3, "unit": "each", "priority": "high", "status": "approved"},
            ]
            for i, md in enumerate(mat_data):
                emp_req = workers_emp[i % len(workers_emp)]
                job_req = active_jobs_list[i % len(active_jobs_list)]
                mr = models.MaterialRequest(
                    requested_by_id=emp_req.id,
                    job_id=job_req.id,
                    cost_code_id=cost_codes_list[i % len(cost_codes_list)].id if cost_codes_list else None,
                    material_name=md["material_name"],
                    quantity=md["quantity"],
                    unit=md["unit"],
                    priority=md["priority"],
                    status=md["status"],
                    needed_by_date=date.today() + timedelta(days=(i + 3) * 2),
                )
                db.add(mr)
            db.commit()
            print(f"  Created {len(mat_data)} material requests")

    print("\n✅ Seed complete!")
    print("\nDemo login credentials:")
    print("  Admin:      admin@fieldops.com / admin123")
    print("  Supervisor: supervisor@fieldops.com / super123")
    print("  Worker:     worker1@fieldops.com / work123")


if __name__ == "__main__":
    seed()
    db.close()
