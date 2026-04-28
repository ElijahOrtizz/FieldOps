from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
import models
from auth import require_role

router = APIRouter()


class SettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    default_pay_type: Optional[str] = None
    overtime_threshold: Optional[float] = None
    sage_export_format: Optional[str] = None
    upload_dir: Optional[str] = None


def get_or_create_settings(db: Session) -> models.CompanySettings:
    settings = db.query(models.CompanySettings).first()
    if not settings:
        settings = models.CompanySettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def settings_to_dict(s):
    return {
        "company_name": s.company_name,
        "default_pay_type": s.default_pay_type,
        "overtime_threshold": s.overtime_threshold,
        "sage_export_format": s.sage_export_format,
        "upload_dir": s.upload_dir,
        "updated_at": s.updated_at,
    }


@router.get("/")
def get_settings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    return settings_to_dict(get_or_create_settings(db))


@router.put("/")
def update_settings(
    data: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin"))
):
    settings = get_or_create_settings(db)
    for field, value in data.dict(exclude_none=True).items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings_to_dict(settings)
