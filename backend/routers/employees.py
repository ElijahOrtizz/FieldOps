from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
import models
from auth import get_current_user, require_role

router = APIRouter()


class EmployeeCreate(BaseModel):
    employee_number: str
    first_name: str
    last_name: str
    phone: Optional[str] = None
    trade: Optional[str] = None
    pay_type: Optional[str] = "Regular"
    hourly_rate: Optional[float] = None
    supervisor_id: Optional[int] = None
    user_id: Optional[int] = None
    sage_employee_id: Optional[str] = None


class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    trade: Optional[str] = None
    pay_type: Optional[str] = None
    hourly_rate: Optional[float] = None
    supervisor_id: Optional[int] = None
    is_active: Optional[bool] = None
    sage_employee_id: Optional[str] = None


def employee_to_dict(emp):
    return {
        "id": emp.id,
        "employee_number": emp.employee_number,
        "first_name": emp.first_name,
        "last_name": emp.last_name,
        "full_name": f"{emp.first_name} {emp.last_name}",
        "phone": emp.phone,
        "trade": emp.trade,
        "pay_type": emp.pay_type,
        "hourly_rate": emp.hourly_rate,
        "supervisor_id": emp.supervisor_id,
        "supervisor_name": f"{emp.supervisor.first_name} {emp.supervisor.last_name}" if emp.supervisor else None,
        "user_id": emp.user_id,
        "user_email": emp.user.email if emp.user else None,
        "user_role": emp.user.role if emp.user else None,
        "is_active": emp.is_active,
        "sage_employee_id": emp.sage_employee_id,
        "created_at": emp.created_at,
    }


@router.get("/")
def list_employees(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.Employee)
    if active_only:
        query = query.filter(models.Employee.is_active == True)
    return [employee_to_dict(e) for e in query.all()]


@router.get("/{employee_id}")
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    emp = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee_to_dict(emp)


@router.post("/")
def create_employee(
    data: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    existing = db.query(models.Employee).filter(models.Employee.employee_number == data.employee_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Employee number already exists")

    emp = models.Employee(**data.dict())
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return employee_to_dict(emp)


@router.put("/{employee_id}")
def update_employee(
    employee_id: int,
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    emp = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    for field, value in data.dict(exclude_none=True).items():
        setattr(emp, field, value)
    db.commit()
    db.refresh(emp)
    return employee_to_dict(emp)


@router.delete("/{employee_id}")
def deactivate_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    emp = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp.is_active = False
    db.commit()
    return {"message": "Employee deactivated"}
