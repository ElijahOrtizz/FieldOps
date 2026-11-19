from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
import models
import ratelimit
from auth import verify_password, get_password_hash, create_access_token, get_current_user

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: str = "worker"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, http_request: Request, db: Session = Depends(get_db)):
    email_key = request.email.strip().lower()
    forwarded = http_request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (http_request.client.host if http_request.client else "unknown")

    wait = ratelimit.retry_after(email_key, ip)
    if wait:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Try again in {max(1, wait // 60)} minute(s).",
            headers={"Retry-After": str(wait)},
        )

    user = db.query(models.User).filter(models.User.email == request.email).first()
    if not user or not verify_password(request.password, user.hashed_password):
        ratelimit.record_failure(email_key, ip)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    ratelimit.record_success(email_key)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    token = create_access_token({"sub": str(user.id)})
    employee = user.employee

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "employee_id": employee.id if employee else None,
            "name": f"{employee.first_name} {employee.last_name}" if employee else user.email,
        }
    }


@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee = current_user.employee
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "employee_id": employee.id if employee else None,
        "name": f"{employee.first_name} {employee.last_name}" if employee else current_user.email,
        "is_active": current_user.is_active,
    }
