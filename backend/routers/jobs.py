from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import date
from database import get_db
import models
from auth import get_current_user, require_role

router = APIRouter()


class JobCreate(BaseModel):
    job_number: str
    job_name: str
    client_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    status: Optional[str] = "active"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    budget_hours: Optional[float] = None
    budget_cost: Optional[float] = None
    sage_job_id: Optional[str] = None
    notes: Optional[str] = None


class JobUpdate(BaseModel):
    job_name: Optional[str] = None
    client_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    budget_hours: Optional[float] = None
    budget_cost: Optional[float] = None
    sage_job_id: Optional[str] = None
    notes: Optional[str] = None


def job_to_dict(job, db=None):
    d = {
        "id": job.id,
        "job_number": job.job_number,
        "job_name": job.job_name,
        "client_name": job.client_name,
        "address": job.address,
        "city": job.city,
        "state": job.state,
        "status": job.status,
        "start_date": job.start_date,
        "end_date": job.end_date,
        "budget_hours": job.budget_hours,
        "budget_cost": job.budget_cost,
        "sage_job_id": job.sage_job_id,
        "notes": job.notes,
        "created_at": job.created_at,
    }
    if db:
        total_hours = db.query(func.sum(models.TimeEntry.total_hours)).filter(
            models.TimeEntry.job_id == job.id,
            models.TimeEntry.status.in_(["approved", "exported"])
        ).scalar() or 0
        d["approved_hours"] = round(total_hours, 2)
        if job.budget_hours:
            d["budget_used_pct"] = round((total_hours / job.budget_hours) * 100, 1)
        else:
            d["budget_used_pct"] = None
    return d


@router.get("/")
def list_jobs(
    active_only: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.Job)
    if active_only:
        query = query.filter(models.Job.status == "active")
    return [job_to_dict(j, db) for j in query.order_by(models.Job.job_number).all()]


@router.get("/{job_id}")
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_to_dict(job, db)


@router.post("/")
def create_job(
    data: JobCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    existing = db.query(models.Job).filter(models.Job.job_number == data.job_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Job number already exists")
    job = models.Job(**data.dict())
    db.add(job)
    db.commit()
    db.refresh(job)
    return job_to_dict(job)


@router.put("/{job_id}")
def update_job(
    job_id: int,
    data: JobUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    for field, value in data.dict(exclude_none=True).items():
        setattr(job, field, value)
    db.commit()
    db.refresh(job)
    return job_to_dict(job)


@router.delete("/{job_id}")
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = "archived"
    db.commit()
    return {"message": "Job archived"}
