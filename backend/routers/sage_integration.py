"""
Sage Integration Layer — Phase 2.2

This module provides a clean separation between FieldOps and Sage 100/300.
Currently simulates sync operations. To connect a real Sage API:
1. Add Sage credentials to .env (SAGE_CLIENT_ID, SAGE_CLIENT_SECRET, SAGE_COMPANY_ID)
2. Replace the `_call_sage_api()` stub below with real HTTP calls
3. Map FieldOps field names to Sage field names using the FIELD_MAP constants

The simulated sync marks entries as synced/failed without touching Sage.
All actions are audit-logged regardless of real/simulated mode.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timedelta
from database import get_db
import models
from auth import require_role, get_current_user
from audit import log_action
import random

router = APIRouter()

# ── Sage field mappings (for future real API connection) ────────────────────
SAGE_FIELD_MAP = {
    "employee": "sage_employee_id",   # maps to Employee.sage_employee_id
    "job": "sage_job_id",             # maps to Job.sage_job_id
    "cost_code": "sage_cost_code",    # maps to CostCode.sage_cost_code
    "hours": "total_hours",
    "pay_type": "pay_type",
    "date": "date",
}

SAGE_SYNC_ELIGIBLE = ["approved"]   # Only approved entries can be synced


def _call_sage_api(payload: dict) -> dict:
    """
    STUB: Replace this with real Sage API call when credentials are available.

    Example real implementation:
        import httpx
        resp = httpx.post(
            f"{settings.SAGE_BASE_URL}/api/timecards",
            headers={"Authorization": f"Bearer {get_sage_token()}"},
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    For now: simulate a ~95% success rate.
    """
    # Simulate network latency and occasional failures
    success = random.random() > 0.05   # 5% simulated failure rate
    if success:
        return {"status": "success", "sage_transaction_id": f"SAGE-{random.randint(10000, 99999)}"}
    else:
        raise Exception("Simulated Sage connection timeout")


def _entry_is_sage_eligible(entry) -> bool:
    status = entry.status.value if hasattr(entry.status, "value") else str(entry.status)
    return status in SAGE_ELIGIBLE_STATUSES


SAGE_ELIGIBLE_STATUSES = ["approved"]


class SagePrepareRequest(BaseModel):
    week_start: Optional[date] = None
    entry_ids: Optional[List[int]] = None   # specific entries, or leave None for week-based


class SageSyncRequest(BaseModel):
    entry_ids: List[int]


def _entry_sage_dict(entry) -> dict:
    emp = entry.employee
    return {
        "employee_id": emp.sage_employee_id or emp.employee_number if emp else "",
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "",
        "job_number": entry.job.sage_job_id or entry.job.job_number if entry.job else "",
        "cost_code": entry.cost_code.sage_cost_code or entry.cost_code.code if entry.cost_code else "",
        "date": entry.date.strftime("%Y-%m-%d") if entry.date else "",
        "hours": entry.total_hours,
        "pay_type": entry.pay_type or "Regular",
    }


@router.post("/prepare")
def sage_prepare(
    data: SagePrepareRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    """
    Mark approved entries as 'ready' for Sage sync.
    This is a staging step — entries are not sent yet, just flagged.
    """
    query = db.query(models.TimeEntry).filter(
        models.TimeEntry.status == "approved",
        models.TimeEntry.sage_sync_status.in_(["not_ready", "failed"])
    )

    if data.week_start:
        we = data.week_start + timedelta(days=6)
        query = query.filter(
            models.TimeEntry.date >= data.week_start,
            models.TimeEntry.date <= we,
        )
        # Require the week to be locked before Sage prep
        lock = db.query(models.PayrollLock).filter(
            models.PayrollLock.week_start == data.week_start,
            models.PayrollLock.status == "locked"
        ).first()
        if not lock:
            raise HTTPException(
                status_code=422,
                detail=f"Cannot prepare for Sage: payroll week of {data.week_start} is not locked. "
                       f"Lock the week first to prevent edits before syncing."
            )

    if data.entry_ids:
        query = query.filter(models.TimeEntry.id.in_(data.entry_ids))
        # For individual entry IDs without week_start, check each entry's week is locked
        if not data.week_start:
            entries_check = query.all()
            unlocked_dates = []
            for e in entries_check:
                entry_week_start = e.date - timedelta(days=e.date.weekday())
                lock = db.query(models.PayrollLock).filter(
                    models.PayrollLock.week_start == entry_week_start,
                    models.PayrollLock.status == "locked"
                ).first()
                if not lock:
                    unlocked_dates.append(str(entry_week_start))
            if unlocked_dates:
                unique_weeks = list(set(unlocked_dates))
                raise HTTPException(
                    status_code=422,
                    detail=f"Cannot prepare: entries from unlocked week(s): {', '.join(unique_weeks)}. Lock those weeks first."
                )

    entries = query.all()
    if not entries:
        raise HTTPException(status_code=404, detail="No eligible entries found (must be approved, from a locked week, and not already ready/synced)")

    for e in entries:
        e.sage_sync_status = "ready"

    log_action(db, current_user.id, "sage_prepare",
               resource_type="sage_batch",
               new_value={"entry_count": len(entries), "week_start": str(data.week_start) if data.week_start else None},
               note=f"Marked {len(entries)} entries as ready for Sage sync")
    db.commit()

    return {"marked_ready": len(entries), "entry_ids": [e.id for e in entries]}


@router.post("/sync")
def sage_sync(
    data: SageSyncRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    """
    Simulate (or execute) Sage sync for ready entries.

    When real Sage API credentials are configured, this endpoint will:
    1. Build Sage-formatted payloads per entry
    2. POST each to the Sage Timecard API
    3. On success: mark entry as 'synced', record sage_synced_at
    4. On failure: mark as 'failed', log error details
    """
    entries = db.query(models.TimeEntry).filter(
        models.TimeEntry.id.in_(data.entry_ids),
        models.TimeEntry.sage_sync_status == "ready"
    ).all()

    if not entries:
        raise HTTPException(status_code=404, detail="No ready entries found with those IDs")

    # Double-check: every entry must still belong to a locked payroll week
    unlocked_rejected = []
    for e in entries:
        entry_week_start = e.date - timedelta(days=e.date.weekday())
        lock = db.query(models.PayrollLock).filter(
            models.PayrollLock.week_start == entry_week_start,
            models.PayrollLock.status == "locked"
        ).first()
        if not lock:
            unlocked_rejected.append(e.id)
    if unlocked_rejected:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot sync: {len(unlocked_rejected)} entr(ies) belong to an unlocked payroll week. "
                   f"Re-lock the week or remove those entries. IDs: {unlocked_rejected}"
        )

    synced, failed = [], []

    for entry in entries:
        payload = _entry_sage_dict(entry)
        try:
            result = _call_sage_api(payload)
            entry.sage_sync_status = "synced"
            entry.sage_synced_at = datetime.now()
            log_action(db, current_user.id, "sage_sync_success",
                       resource_type="time_entry", resource_id=entry.id,
                       new_value={"sage_transaction_id": result.get("sage_transaction_id"), "payload": payload},
                       note="Synced to Sage successfully")
            synced.append(entry.id)
        except Exception as ex:
            entry.sage_sync_status = "failed"
            log_action(db, current_user.id, "sage_sync_failed",
                       resource_type="time_entry", resource_id=entry.id,
                       old_value={"sage_sync_status": "ready"},
                       new_value={"sage_sync_status": "failed", "error": str(ex)},
                       note=f"Sage sync failed: {ex}")
            failed.append(entry.id)

    db.commit()
    return {
        "synced": synced,
        "failed": failed,
        "synced_count": len(synced),
        "failed_count": len(failed),
    }


@router.get("/status")
def sage_sync_status_summary(
    week_start: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin", "supervisor"))
):
    """Summary of Sage sync status for a given week (or all time)."""
    query = db.query(models.TimeEntry)
    if week_start:
        we = week_start + timedelta(days=6)
        query = query.filter(models.TimeEntry.date >= week_start, models.TimeEntry.date <= we)

    entries = query.all()
    counts = {"not_ready": 0, "ready": 0, "synced": 0, "failed": 0}
    for e in entries:
        s = e.sage_sync_status or "not_ready"
        counts[s] = counts.get(s, 0) + 1

    ready_entries = [e for e in entries if e.sage_sync_status == "ready"]
    return {
        "counts": counts,
        "ready_entry_ids": [e.id for e in ready_entries],
        "total_entries": len(entries),
    }
