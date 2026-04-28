from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
import models
from auth import require_role

router = APIRouter()


@router.get("/")
def list_audit_logs(
    resource_type: Optional[str] = None,
    resource_id: Optional[int] = None,
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin", "supervisor"))
):
    query = db.query(models.AuditLog)

    if resource_type:
        query = query.filter(models.AuditLog.resource_type == resource_type)
    if resource_id:
        query = query.filter(models.AuditLog.resource_id == resource_id)
    if action:
        query = query.filter(models.AuditLog.action == action)
    if user_id:
        query = query.filter(models.AuditLog.user_id == user_id)

    logs = query.order_by(models.AuditLog.created_at.desc()).limit(limit).all()

    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "note": log.note,
            "details": log.details,
            "user_id": log.user_id,
            "user_email": log.user.email if log.user else None,
            "user_name": f"{log.user.employee.first_name} {log.user.employee.last_name}" if (log.user and log.user.employee) else log.user.email if log.user else "System",
            "created_at": log.created_at,
        })
    return result
