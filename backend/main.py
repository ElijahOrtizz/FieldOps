from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from database import engine, Base, SessionLocal
from routers import (
    auth, users, jobs, cost_codes, time_entries,
    approvals, export, reports, employees,
    material_requests, audit_logs, settings, payroll_locks
)
from routers import sage_integration
from routers import schedule as schedule_router
from routers import worker as worker_router
from routers import daily_review as daily_review_router

Base.metadata.create_all(bind=engine)


def ensure_default_admin():
    import models
    from auth import get_password_hash
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.email == "admin@fieldops.com").first()
        if existing:
            print("Default admin exists")
        else:
            admin = models.User(
                email="admin@fieldops.com",
                hashed_password=get_password_hash("admin123"),
                role=models.UserRole.admin,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print("Created default admin")
    finally:
        db.close()


ensure_default_admin()


def ensure_ot_columns():
    """
    Idempotent startup migration: adds OT/DT columns to company_settings
    if they don't already exist, then backfills defaults on existing rows.
    Works on both SQLite and PostgreSQL.
    """
    from sqlalchemy import text
    new_columns = [
        ("daily_ot_threshold",  "REAL"),
        ("daily_dt_threshold",  "REAL"),
        ("weekly_ot_threshold", "REAL"),
        ("weekly_dt_threshold", "REAL"),
        ("seventh_day_rule",    "INTEGER"),
        ("ot_multiplier",       "REAL"),
        ("dt_multiplier",       "REAL"),
    ]
    with engine.connect() as conn:
        for col_name, col_type in new_columns:
            try:
                conn.execute(text(
                    f"ALTER TABLE company_settings ADD COLUMN {col_name} {col_type}"
                ))
                conn.commit()
            except Exception:
                # Column already exists — safe to ignore
                conn.rollback()

        # Backfill defaults on any existing rows that have NULLs
        conn.execute(text(
            "UPDATE company_settings "
            "SET weekly_ot_threshold = 40.0 WHERE weekly_ot_threshold IS NULL"
        ))
        conn.execute(text(
            "UPDATE company_settings "
            "SET ot_multiplier = 1.5 WHERE ot_multiplier IS NULL"
        ))
        conn.execute(text(
            "UPDATE company_settings "
            "SET dt_multiplier = 2.0 WHERE dt_multiplier IS NULL"
        ))
        conn.execute(text(
            "UPDATE company_settings "
            "SET seventh_day_rule = 0 WHERE seventh_day_rule IS NULL"
        ))
        conn.commit()


ensure_ot_columns()

app = FastAPI(title="Stryda API", version="2.3.0")

_cors_env = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
CORS_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Phase 1
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(employees.router, prefix="/api/employees", tags=["employees"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(cost_codes.router, prefix="/api/cost-codes", tags=["cost_codes"])
app.include_router(time_entries.router, prefix="/api/time-entries", tags=["time_entries"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["approvals"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])

# Phase 2
app.include_router(material_requests.router, prefix="/api/material-requests", tags=["material_requests"])
app.include_router(audit_logs.router, prefix="/api/audit-logs", tags=["audit_logs"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])

# Phase 2.3
app.include_router(schedule_router.router, prefix="/api/schedule", tags=["schedule"])

# Phase 2.2
app.include_router(payroll_locks.router, prefix="/api/payroll-locks", tags=["payroll_locks"])
app.include_router(sage_integration.router, prefix="/api/sage", tags=["sage"])

# Phase 2.4
app.include_router(worker_router.router, prefix="/api/worker", tags=["worker"])
# Phase 2.5
app.include_router(daily_review_router.router, prefix="/api/supervisor", tags=["daily_review"])


@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": "2.2.0"}
