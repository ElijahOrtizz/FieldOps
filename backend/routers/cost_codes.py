from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
import models
from auth import get_current_user, require_role

router = APIRouter()


class CostCodeCreate(BaseModel):
    code: str
    description: str
    category: Optional[str] = "Labor"
    sage_cost_code: Optional[str] = None


class CostCodeUpdate(BaseModel):
    description: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    sage_cost_code: Optional[str] = None


@router.get("/")
def list_cost_codes(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.CostCode)
    if active_only:
        query = query.filter(models.CostCode.is_active == True)
    return [
        {
            "id": cc.id,
            "code": cc.code,
            "description": cc.description,
            "category": cc.category,
            "is_active": cc.is_active,
            "sage_cost_code": cc.sage_cost_code,
        }
        for cc in query.order_by(models.CostCode.code).all()
    ]


@router.post("/")
def create_cost_code(
    data: CostCodeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    existing = db.query(models.CostCode).filter(models.CostCode.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Cost code already exists")
    cc = models.CostCode(**data.dict())
    db.add(cc)
    db.commit()
    db.refresh(cc)
    return {"id": cc.id, "code": cc.code, "description": cc.description, "category": cc.category}


@router.put("/{cc_id}")
def update_cost_code(
    cc_id: int,
    data: CostCodeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    cc = db.query(models.CostCode).filter(models.CostCode.id == cc_id).first()
    if not cc:
        raise HTTPException(status_code=404, detail="Cost code not found")
    for field, value in data.dict(exclude_none=True).items():
        setattr(cc, field, value)
    db.commit()
    return {"id": cc.id, "code": cc.code, "description": cc.description}


@router.delete("/{cc_id}")
def delete_cost_code(
    cc_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    cc = db.query(models.CostCode).filter(models.CostCode.id == cc_id).first()
    if not cc:
        raise HTTPException(status_code=404, detail="Cost code not found")
    cc.is_active = False
    db.commit()
    return {"message": "Cost code deactivated"}
