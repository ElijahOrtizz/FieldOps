"""Shared audit logging helper used by all routers."""
import json
from datetime import datetime
from sqlalchemy.orm import Session
import models


def log_action(
    db: Session,
    user_id: int,
    action: str,
    resource_type: str = None,
    resource_id: int = None,
    old_value: dict = None,
    new_value: dict = None,
    note: str = None,
    details: str = None,
):
    """Create an audit log entry. Call before or after the DB commit."""
    entry = models.AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        old_value=json.dumps(old_value, default=str) if old_value else None,
        new_value=json.dumps(new_value, default=str) if new_value else None,
        note=note,
        details=details,
    )
    db.add(entry)
    # Caller must call db.commit()
