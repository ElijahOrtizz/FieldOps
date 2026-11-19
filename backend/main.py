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
from routers import schedule as schedule_router
from routers import worker as worker_router
from routers import daily_review as daily_review_router
from routers import alerts as alerts_router

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


if os.getenv("STRYDA_ENV", "prod") == "dev":
    ensure_default_admin()


def ensure_ot_columns(eng=None):
    """
    Idempotent startup migration: adds OT/DT columns to company_settings
    if they are missing, then backfills defaults on rows that have NULLs.

    Safe to run any number of times, and on both SQLite and PostgreSQL:
    - only columns that are really missing are added (checked with the inspector),
    - only a "column already exists" race between two starting servers is ignored,
      any other error stops startup instead of being hidden,
    - the backfill goes through the ORM, so booleans are typed correctly on Postgres.
    """
    from sqlalchemy import text, inspect
    from sqlalchemy.exc import DBAPIError
    from sqlalchemy.orm import Session
    import models

    eng = eng or engine
    new_columns = [
        ("daily_ot_threshold",  "REAL"),
        ("daily_dt_threshold",  "REAL"),
        ("weekly_ot_threshold", "REAL"),
        ("weekly_dt_threshold", "REAL"),
        ("seventh_day_rule",    "BOOLEAN"),
        ("ot_multiplier",       "REAL"),
        ("dt_multiplier",       "REAL"),
    ]

    def existing():
        return {c["name"] for c in inspect(eng).get_columns("company_settings")}

    have = existing()
    with eng.connect() as conn:
        for col_name, col_type in new_columns:
            if col_name in have:
                continue
            try:
                conn.execute(text(
                    f"ALTER TABLE company_settings ADD COLUMN {col_name} {col_type}"
                ))
                conn.commit()
            except DBAPIError:
                conn.rollback()
                if col_name not in existing():
                    raise  # a real failure, not a startup race

    # Backfill defaults on any existing rows that have NULLs
    CS = models.CompanySettings
    with Session(eng) as db:
        for col, value in (
            (CS.weekly_ot_threshold, 40.0),
            (CS.ot_multiplier, 1.5),
            (CS.dt_multiplier, 2.0),
            (CS.seventh_day_rule, False),
        ):
            db.query(CS).filter(col.is_(None)).update({col: value}, synchronize_session=False)
        db.commit()


ensure_ot_columns()

app = FastAPI(title="Stryda API", version="2.3.0")

_cors_env = os.getenv("CORS_ORIGINS")
_stryda_env = os.getenv("STRYDA_ENV", "prod")

if _cors_env:
    CORS_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()]
elif _stryda_env == "dev":
    CORS_ORIGINS = ["http://localhost:3000", "http://localhost:5173"]
else:
    raise RuntimeError(
        "CORS_ORIGINS env var is required when STRYDA_ENV is not 'dev'. "
        "Set CORS_ORIGINS to a comma-separated list of allowed frontend origins, "
        "or set STRYDA_ENV=dev for local development."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Receipts are served through an authenticated API route. The public /uploads
# folder exists only for local dev and is never mounted in production.
if os.getenv("STRYDA_ENV") == "dev":
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

# Phase 2.4
app.include_router(worker_router.router, prefix="/api/worker", tags=["worker"])
# Phase 2.5
app.include_router(daily_review_router.router, prefix="/api/supervisor", tags=["daily_review"])
app.include_router(alerts_router.router, prefix="/api/alerts", tags=["alerts"])


@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": "2.2.0"}
