from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum, Date, Time
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base


class UserRole(str, enum.Enum):
    worker = "worker"
    supervisor = "supervisor"
    admin = "admin"


class EntryStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"
    exported = "exported"
    needs_correction = "needs_correction"


class MaterialStatus(str, enum.Enum):
    requested = "requested"
    approved = "approved"
    ordered = "ordered"
    delivered = "delivered"
    denied = "denied"


class MaterialPriority(str, enum.Enum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.worker, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    employee = relationship("Employee", back_populates="user", uselist=False)
    audit_logs = relationship("AuditLog", back_populates="user")


class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    employee_number = Column(String, unique=True, index=True, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    phone = Column(String)
    trade = Column(String)
    pay_type = Column(String, default="Regular")
    hourly_rate = Column(Float, nullable=True)
    supervisor_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    sage_employee_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="employee")
    supervisor = relationship("Employee", remote_side=[id])
    time_entries = relationship("TimeEntry", back_populates="employee")
    material_requests = relationship("MaterialRequest", back_populates="requested_by_employee", foreign_keys="MaterialRequest.requested_by_id")
    approved_material_requests = relationship("MaterialRequest", back_populates="approved_by_employee", foreign_keys="MaterialRequest.approved_by_id")


class Job(Base):
    __tablename__ = "jobs"
    id = Column(Integer, primary_key=True, index=True)
    job_number = Column(String, unique=True, index=True, nullable=False)
    job_name = Column(String, nullable=False)
    client_name = Column(String)
    address = Column(String)
    city = Column(String)
    state = Column(String)
    status = Column(String, default="active")
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    budget_hours = Column(Float, nullable=True)
    budget_cost = Column(Float, nullable=True)
    sage_job_id = Column(String, nullable=True)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    time_entries = relationship("TimeEntry", back_populates="job")
    material_requests = relationship("MaterialRequest", back_populates="job")


class CostCode(Base):
    __tablename__ = "cost_codes"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=False)
    category = Column(String)
    is_active = Column(Boolean, default=True)
    sage_cost_code = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    time_entries = relationship("TimeEntry", back_populates="cost_code")
    material_requests = relationship("MaterialRequest", back_populates="cost_code")


class TimeEntry(Base):
    __tablename__ = "time_entries"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    cost_code_id = Column(Integer, ForeignKey("cost_codes.id"), nullable=False)
    date = Column(Date, nullable=False)
    start_time = Column(String, nullable=True)
    end_time = Column(String, nullable=True)
    total_hours = Column(Float, nullable=False)
    pay_type = Column(String, default="Regular")
    notes = Column(Text)
    status = Column(Enum(EntryStatus), default=EntryStatus.submitted)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    exported_at = Column(DateTime(timezone=True), nullable=True)
    export_batch_id = Column(Integer, ForeignKey("export_batches.id"), nullable=True)
    sage_sync_status = Column(String, default="not_ready")  # not_ready, ready, synced, failed
    sage_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    employee = relationship("Employee", back_populates="time_entries")
    job = relationship("Job", back_populates="time_entries")
    cost_code = relationship("CostCode", back_populates="time_entries")
    approval = relationship("Approval", back_populates="time_entry", uselist=False)
    receipts = relationship("Receipt", back_populates="time_entry")
    export_batch = relationship("ExportBatch", back_populates="time_entries")


class Approval(Base):
    __tablename__ = "approvals"
    id = Column(Integer, primary_key=True, index=True)
    time_entry_id = Column(Integer, ForeignKey("time_entries.id"), nullable=False)
    supervisor_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    action = Column(String, nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    time_entry = relationship("TimeEntry", back_populates="approval")
    supervisor = relationship("Employee")


class Receipt(Base):
    __tablename__ = "receipts"
    id = Column(Integer, primary_key=True, index=True)
    time_entry_id = Column(Integer, ForeignKey("time_entries.id"), nullable=False)
    filename = Column(String, nullable=False)
    original_name = Column(String)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer)
    file_type = Column(String, nullable=True)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    time_entry = relationship("TimeEntry", back_populates="receipts")
    uploaded_by = relationship("User")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)
    resource_type = Column(String, nullable=True)
    resource_id = Column(Integer, nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="audit_logs")


class MaterialRequest(Base):
    __tablename__ = "material_requests"
    id = Column(Integer, primary_key=True, index=True)
    requested_by_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    cost_code_id = Column(Integer, ForeignKey("cost_codes.id"), nullable=True)
    material_name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False, default=1)
    unit = Column(String, nullable=True)
    needed_by_date = Column(Date, nullable=True)
    priority = Column(Enum(MaterialPriority), default=MaterialPriority.normal)
    notes = Column(Text, nullable=True)
    status = Column(Enum(MaterialStatus), default=MaterialStatus.requested)
    approved_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    denial_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    requested_by_employee = relationship("Employee", back_populates="material_requests", foreign_keys=[requested_by_id])
    approved_by_employee = relationship("Employee", back_populates="approved_material_requests", foreign_keys=[approved_by_id])
    job = relationship("Job", back_populates="material_requests")
    cost_code = relationship("CostCode", back_populates="material_requests")


class ExportBatch(Base):
    __tablename__ = "export_batches"
    id = Column(Integer, primary_key=True, index=True)
    exported_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    exported_at = Column(DateTime(timezone=True), server_default=func.now())
    file_name = Column(String, nullable=True)
    record_count = Column(Integer, default=0)
    notes = Column(Text, nullable=True)

    exported_by = relationship("User")
    time_entries = relationship("TimeEntry", back_populates="export_batch")


class CompanySettings(Base):
    __tablename__ = "company_settings"
    id = Column(Integer, primary_key=True, default=1)
    company_name = Column(String, default="FieldOps")
    default_pay_type = Column(String, default="Regular")
    overtime_threshold = Column(Float, default=8.0)
    sage_export_format = Column(String, default="sage_100")
    upload_dir = Column(String, default="uploads")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PayrollLock(Base):
    __tablename__ = "payroll_locks"
    id = Column(Integer, primary_key=True, index=True)
    week_start = Column(Date, nullable=False, index=True)
    week_end = Column(Date, nullable=False)
    locked_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    locked_at = Column(DateTime(timezone=True), server_default=func.now())
    unlocked_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    unlocked_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="locked")  # locked / unlocked
    notes = Column(Text, nullable=True)

    locked_by = relationship("User", foreign_keys=[locked_by_id])
    unlocked_by = relationship("User", foreign_keys=[unlocked_by_id])


class ScheduleStatus(str, enum.Enum):
    scheduled = "scheduled"
    changed = "changed"
    completed = "completed"
    missed = "missed"
    removed = "removed"


class ScheduleAssignment(Base):
    __tablename__ = "schedule_assignments"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    supervisor_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    date = Column(Date, nullable=False, index=True)
    planned_start_time = Column(String, nullable=True)   # "HH:MM"
    planned_end_time = Column(String, nullable=True)
    planned_hours = Column(Float, nullable=True)
    role = Column(String, nullable=True)                 # trade/role for this assignment
    notes = Column(Text, nullable=True)
    status = Column(Enum(ScheduleStatus), default=ScheduleStatus.scheduled)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    employee = relationship("Employee", foreign_keys=[employee_id])
    job = relationship("Job")
    supervisor = relationship("Employee", foreign_keys=[supervisor_id])
    created_by = relationship("User")


# ── Phase 2.4 ─────────────────────────────────────────────────────────────────

class ClockStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class CorrectionStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ClockSession(Base):
    __tablename__ = "clock_sessions"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    schedule_assignment_id = Column(Integer, ForeignKey("schedule_assignments.id"), nullable=True)
    clock_in_time = Column(DateTime(timezone=True), nullable=False)
    clock_out_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(ClockStatus), default=ClockStatus.active)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    employee = relationship("Employee")
    job = relationship("Job")


class CorrectionRequest(Base):
    __tablename__ = "correction_requests"
    id = Column(Integer, primary_key=True, index=True)
    time_entry_id = Column(Integer, ForeignKey("time_entries.id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    reason = Column(Text, nullable=False)
    requested_start_time = Column(String, nullable=True)
    requested_end_time = Column(String, nullable=True)
    requested_job_id = Column(Integer, ForeignKey("jobs.id"), nullable=True)
    requested_notes = Column(Text, nullable=True)
    status = Column(Enum(CorrectionStatus), default=CorrectionStatus.pending)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    review_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    time_entry = relationship("TimeEntry")
    employee = relationship("Employee")
    requested_job = relationship("Job")
    reviewed_by = relationship("User")


# ── Phase 2.5 ─────────────────────────────────────────────────────────────────

class SignoffStatus(str, enum.Enum):
    open = "open"
    signed_off = "signed_off"
    reopened = "reopened"


class DailySignoff(Base):
    __tablename__ = "daily_signoffs"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=True)
    supervisor_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    status = Column(Enum(SignoffStatus), default=SignoffStatus.open)
    notes = Column(Text, nullable=True)
    signed_off_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    job = relationship("Job")
    supervisor = relationship("Employee")
