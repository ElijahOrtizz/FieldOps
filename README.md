# FieldOps

FieldOps is a full-stack construction operations platform for small-to-mid contractors. It connects crew scheduling, worker time tracking, supervisor daily review, weekly payroll approval, job costing, and Sage-ready payroll workflows into one clean system.

## Core Workflow

Crew Schedule → Worker Assignment → Clock In/Out → Supervisor Daily Review → Weekly Payroll Approval → Payroll Lock → Sage-Ready Sync → Job Cost Visibility

## Why FieldOps

Many contractors still collect field time through paper, texts, and spreadsheets before manually entering payroll into Sage. FieldOps is designed to close that gap by helping contractors collect clean time, catch mistakes earlier, and view labor cost risk before payroll closes.

## Key Features

- Crew scheduling
- Worker clock in / clock out
- Correction requests
- Supervisor daily review
- Weekly timecards
- Payroll approval and locking
- Sage-ready export/sync workflow
- Job costing dashboard
- Jobs, employees, cost codes, and material requests
- Audit history and role-based access

## Tech Stack

- React
- Vite
- FastAPI
- Python
- SQLAlchemy
- SQLite
- JWT authentication

## Local Setup

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 seed.py
python3 seed_large.py
python3 -m uvicorn main:app --reload --port 8000
