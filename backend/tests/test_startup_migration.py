"""ensure_ot_columns must be safe to run repeatedly and must upgrade an old company_settings table."""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool
from database import Base
import models
from main import ensure_ot_columns

OT_COLUMNS = {"daily_ot_threshold", "daily_dt_threshold", "weekly_ot_threshold",
              "weekly_dt_threshold", "seventh_day_rule", "ot_multiplier", "dt_multiplier"}


def _engine():
    return create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False},
                         poolclass=StaticPool)


def test_upgrades_a_legacy_table_and_backfills_defaults():
    eng = _engine()
    with eng.begin() as c:
        c.execute(text("CREATE TABLE company_settings (id INTEGER PRIMARY KEY, company_name VARCHAR, "
                       "default_pay_type VARCHAR, overtime_threshold FLOAT, sage_export_format VARCHAR, "
                       "upload_dir VARCHAR, updated_at DATETIME)"))
        c.execute(text("INSERT INTO company_settings (id, company_name) VALUES (1, 'Calray')"))
    ensure_ot_columns(eng)
    assert OT_COLUMNS <= {c["name"] for c in inspect(eng).get_columns("company_settings")}
    with eng.connect() as c:
        row = c.execute(text("SELECT weekly_ot_threshold, ot_multiplier, dt_multiplier, seventh_day_rule "
                             "FROM company_settings WHERE id = 1")).one()
    assert row[0] == 40.0 and row[1] == 1.5 and row[2] == 2.0 and not row[3]


def test_running_twice_changes_nothing():
    eng = _engine()
    Base.metadata.create_all(bind=eng)
    with eng.begin() as c:
        c.execute(text("INSERT INTO company_settings (id, company_name, weekly_ot_threshold, ot_multiplier) "
                       "VALUES (1, 'Calray', 44.0, 1.75)"))
    ensure_ot_columns(eng)
    ensure_ot_columns(eng)
    with eng.connect() as c:
        row = c.execute(text("SELECT weekly_ot_threshold, ot_multiplier FROM company_settings WHERE id = 1")).one()
    assert row[0] == 44.0 and row[1] == 1.75  # custom values are never overwritten


def test_fresh_database_is_fine():
    eng = _engine()
    Base.metadata.create_all(bind=eng)
    ensure_ot_columns(eng)
