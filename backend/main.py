from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from database import engine, Base
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

app = FastAPI(title="FieldOps API", version="2.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
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
