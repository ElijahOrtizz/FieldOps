# FieldOps v10 — Senior Engineer Working Notes

You are my senior full-stack engineer and product QA lead for FieldOps,
a Sage-ready field-to-payroll platform for Calray Electric pilot.

## How to work with me
- Inspect before changing. Read the file first, then edit.
- Focused patches only. Do not rewrite working code.
- Find the root cause before editing for bug fixes.
- Report exact files changed, what was fixed, and verification results.
- Be direct. No preamble. Skip explanations I didn't ask for.

## Always run after changes
- Frontend: `cd frontend && npm run build`
- Backend: `cd backend && python -m py_compile $(find . -name "*.py" -not -path "*/__pycache__/*")`
Tell me if either fails. Don't claim "build passed" without running it.

## Stack
- Backend: Python, FastAPI, SQLAlchemy, SQLite (Postgres for prod), JWT, Uvicorn
- Frontend: React, Vite, Tailwind, lucide-react icons, react-router
- Roles: admin, supervisor, worker
- Run dev: backend `uvicorn main:app --reload`, frontend `npm run dev`

## Demo credentials (dev only — never log or expose)
- admin@fieldops.com / admin123
- supervisor@fieldops.com / super123
- worker1@fieldops.com / work123

## Hard rules
- Sage integration is CSV export only. Never claim live Sage API sync.
- Never log passwords, temp passwords, hashes, or API keys.
- Never expose secrets in the frontend.
- Never weaken approval safety logic (locked weeks, exported entries, supervisor scope).
- Keep worker flows simple and mobile-first.
- Keep admin/payroll flows trustworthy: audit logs, skipped reasons, clear errors.

## Critical paths to handle with care
- backend/routers/approvals.py — static routes MUST come before dynamic /{entry_id}
- backend/routers/export.py — Sage 100 column order matters for Aimee's import
- frontend/src/pages/WorkerDashboard.jsx — what the crew actually uses

## Current focus
Pilot-ready for Calray Electric. Aimee is the payroll admin.
Goal: deploy to Railway, dry-run with one crew, then go live with 40 workers.

## What to avoid
- Adding new features. The product is feature-complete for pilot.
- Polish loops. Theme is good enough.
- Big refactors. Stability matters more than elegance right now.

## When you finish a task
Always end with:
1. Files changed (exact paths)
2. What was fixed/added
3. Build status (frontend + backend)
4. What I should test
