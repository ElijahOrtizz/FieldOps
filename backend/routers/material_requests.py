from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from database import get_db
import models
from auth import get_current_user, require_role
from audit import log_action

router = APIRouter()


class MaterialRequestCreate(BaseModel):
    job_id: int
    cost_code_id: Optional[int] = None
    material_name: str
    quantity: float = 1
    unit: Optional[str] = None
    needed_by_date: Optional[date] = None
    priority: Optional[str] = "normal"
    notes: Optional[str] = None


class MaterialRequestUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    denial_reason: Optional[str] = None
    quantity: Optional[float] = None
    needed_by_date: Optional[date] = None
    priority: Optional[str] = None


def mr_to_dict(mr):
    return {
        "id": mr.id,
        "material_name": mr.material_name,
        "quantity": mr.quantity,
        "unit": mr.unit,
        "needed_by_date": mr.needed_by_date,
        "priority": str(mr.priority),
        "status": str(mr.status),
        "notes": mr.notes,
        "denial_reason": mr.denial_reason,
        "job_id": mr.job_id,
        "job_number": mr.job.job_number if mr.job else None,
        "job_name": mr.job.job_name if mr.job else None,
        "cost_code_id": mr.cost_code_id,
        "cost_code": mr.cost_code.code if mr.cost_code else None,
        "requested_by_id": mr.requested_by_id,
        "requested_by": f"{mr.requested_by_employee.first_name} {mr.requested_by_employee.last_name}" if mr.requested_by_employee else None,
        "approved_by_id": mr.approved_by_id,
        "approved_by": f"{mr.approved_by_employee.first_name} {mr.approved_by_employee.last_name}" if mr.approved_by_employee else None,
        "approved_at": mr.approved_at,
        "created_at": mr.created_at,
        "updated_at": mr.updated_at,
    }


@router.get("/")
def list_material_requests(
    job_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.MaterialRequest)

    # Workers see only their own requests
    if current_user.role == "worker":
        emp = current_user.employee
        if not emp:
            return []
        query = query.filter(models.MaterialRequest.requested_by_id == emp.id)
    elif current_user.role == "supervisor":
        emp = current_user.employee
        if emp:
            crew_ids = [e.id for e in db.query(models.Employee).filter(
                models.Employee.supervisor_id == emp.id).all()]
            crew_ids.append(emp.id)
            query = query.filter(models.MaterialRequest.requested_by_id.in_(crew_ids))

    if job_id:
        query = query.filter(models.MaterialRequest.job_id == job_id)
    if status:
        query = query.filter(models.MaterialRequest.status == status)

    items = query.order_by(models.MaterialRequest.created_at.desc()).all()
    return [mr_to_dict(m) for m in items]


@router.post("/")
def create_material_request(
    data: MaterialRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    emp = current_user.employee
    if not emp:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    job = db.query(models.Job).filter(models.Job.id == data.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    mr = models.MaterialRequest(
        requested_by_id=emp.id,
        job_id=data.job_id,
        cost_code_id=data.cost_code_id,
        material_name=data.material_name,
        quantity=data.quantity,
        unit=data.unit,
        needed_by_date=data.needed_by_date,
        priority=data.priority,
        notes=data.notes,
        status="requested",
    )
    db.add(mr)
    db.flush()

    log_action(db, current_user.id, "created",
               resource_type="material_request", resource_id=mr.id,
               new_value={"material_name": data.material_name, "job_id": data.job_id})
    db.commit()
    db.refresh(mr)
    return mr_to_dict(mr)


@router.put("/{mr_id}")
def update_material_request(
    mr_id: int,
    data: MaterialRequestUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    mr = db.query(models.MaterialRequest).filter(models.MaterialRequest.id == mr_id).first()
    if not mr:
        raise HTTPException(status_code=404, detail="Material request not found")

    # Workers can only edit their own pending requests
    if current_user.role == "worker":
        emp = current_user.employee
        if not emp or mr.requested_by_id != emp.id:
            raise HTTPException(status_code=403, detail="Not your request")
        if str(mr.status) != "requested":
            raise HTTPException(status_code=400, detail="Cannot edit a request that is already in progress")

    old_status = str(mr.status)
    emp = current_user.employee

    if data.status is not None and current_user.role in ["supervisor", "admin"]:
        mr.status = data.status
        if data.status in ["approved", "ordered", "delivered"] and emp:
            mr.approved_by_id = emp.id
            mr.approved_at = datetime.now()
        if data.status == "denied":
            mr.denial_reason = data.denial_reason

    if data.notes is not None:
        mr.notes = data.notes
    if data.quantity is not None:
        mr.quantity = data.quantity
    if data.needed_by_date is not None:
        mr.needed_by_date = data.needed_by_date
    if data.priority is not None:
        mr.priority = data.priority

    log_action(db, current_user.id, f"status_changed_to_{data.status or 'updated'}",
               resource_type="material_request", resource_id=mr_id,
               old_value={"status": old_status}, new_value={"status": data.status},
               note=data.denial_reason)
    db.commit()
    db.refresh(mr)
    return mr_to_dict(mr)


@router.delete("/{mr_id}")
def delete_material_request(
    mr_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    mr = db.query(models.MaterialRequest).filter(models.MaterialRequest.id == mr_id).first()
    if not mr:
        raise HTTPException(status_code=404, detail="Material request not found")

    if current_user.role == "worker":
        emp = current_user.employee
        if not emp or mr.requested_by_id != emp.id:
            raise HTTPException(status_code=403, detail="Not your request")
        if str(mr.status) != "requested":
            raise HTTPException(status_code=400, detail="Cannot delete an in-progress request")

    db.delete(mr)
    db.commit()
    return {"message": "Deleted"}
