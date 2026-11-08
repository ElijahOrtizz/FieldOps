"""
Shared fixture for API tests added in the capstone semester.

Each test gets a fresh in-memory database with three users (worker,
supervisor, admin), one job, and one cost code. Dependency overrides are
installed per test and restored afterwards, so these tests do not interfere
with the module-level overrides used by test_time_entry_validation.py.
"""
import os
import sys
import tempfile
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Must be set before importing main / auth. CI sets these too.
os.environ.setdefault("STRYDA_ENV", "dev")
os.environ.setdefault(
    "DATABASE_URL",
    "sqlite:///" + os.path.join(tempfile.gettempdir(), "stryda_tests.db"),
)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, joinedload
from sqlalchemy.pool import StaticPool

from database import Base, get_db
import models
from auth import get_current_user, get_password_hash
from main import app

# bcrypt is slow on purpose; hash once and reuse for every test user.
TEST_PASSWORD_HASH = get_password_hash("test-only")


class Env:
    """Handle to the per-test app, database, and acting user."""

    def __init__(self, client, session_factory, ids, state):
        self.client = client
        self._session_factory = session_factory
        self.ids = ids
        self._state = state

    def as_role(self, role: str):
        self._state["user_id"] = self.ids[role + "_user"]
        return self.client

    def session(self):
        return self._session_factory()

    def make_entry(self, status="submitted", days_ago=3, hours=8.0):
        db = self._session_factory()
        entry = models.TimeEntry(
            employee_id=self.ids["worker_emp"],
            job_id=self.ids["job"],
            cost_code_id=self.ids["cc"],
            date=date.today() - timedelta(days=days_ago),
            total_hours=hours,
            pay_type="Regular",
            status=status,
        )
        db.add(entry)
        db.commit()
        entry_id = entry.id
        db.close()
        return entry_id


@pytest.fixture
def env():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = Session()
    ids = {}
    for role, prefix in [("worker", "W"), ("supervisor", "S"), ("admin", "A")]:
        user = models.User(
            email=f"{role}@test.local",
            hashed_password=TEST_PASSWORD_HASH,
            role=getattr(models.UserRole, role),
            is_active=True,
        )
        db.add(user)
        db.commit()
        emp = models.Employee(
            user_id=user.id, first_name=role.title(), last_name="Test",
            employee_number=f"{prefix}001", hourly_rate=25.0,
        )
        db.add(emp)
        db.commit()
        ids[role + "_user"] = user.id
        ids[role + "_emp"] = emp.id

    job = models.Job(job_number="J001", job_name="Test Job", status="active")
    cc = models.CostCode(code="01-100", description="General Labor", category="Labor")
    db.add_all([job, cc])
    db.commit()
    ids["job"] = job.id
    ids["cc"] = cc.id
    db.close()

    state = {"user_id": ids["worker_user"]}

    def override_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    def override_user():
        session = Session()
        user = session.query(models.User).options(
            joinedload(models.User.employee)
        ).filter(models.User.id == state["user_id"]).first()
        if user.employee:
            session.expunge(user.employee)
        session.expunge(user)
        session.close()
        return user

    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        yield Env(TestClient(app), Session, ids, state)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved)
