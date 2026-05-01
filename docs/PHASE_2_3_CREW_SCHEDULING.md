# Stryda Phase 2.3 — Crew Scheduling + Job Assignment Board

## Overview

Phase 2.3 adds weekly crew scheduling before work happens, then compares planned assignments against actual timecards after work is done. It is informational only — variance flags do not modify payroll or approvals.

---

## Navigation

| Role | Nav link |
|---|---|
| Admin | Crew Schedule (between Weekly Timecards and Reports) |
| Supervisor | Crew Schedule (between Weekly Timecards and Reports) |
| Worker | Today's Schedule (in left nav) + "Today's Assignment" card on dashboard |

---

## Crew Schedule Page (`/crew-schedule`)

### Schedule Tab (default)
- Week navigator (← →) with Today shortcut
- Sticky filter bar with employee search + job filter
- 7-day horizontal board — one column per day
- Each day column shows jobs with assigned employees under each
- Per-job planned hours total
- Per-employee weekly totals grid at the bottom (OT warning if ≥ 40h)
- **Assign** button → opens assignment modal for any day
- **Print Week** → browser print of full week crew sheet

### Variance Tab
- Compares planned schedule assignments vs actual time entries
- Issue types flagged:
  - `missing_timecard` — scheduled but no timecard logged
  - `unscheduled_work` — timecard exists but no schedule assignment
  - `wrong_job` — logged to a different job than scheduled
  - `over_planned` — actual hours > planned by > 30 min
  - `under_planned` — actual hours < planned by > 30 min
  - `overtime_risk` — weekly planned or actual ≥ 34h (85% of 40h threshold)
- Variance flags are informational only — no payroll changes

---

## Assignment Modal

**Single assign** — click Assign button or click any existing assignment card.
**Bulk assign** — select multiple employees in the employee multi-select.

Fields:
- Date (required)
- Job (required)
- Employee(s) — searchable multi-select
- Planned Start Time (required)
- Planned End Time (required)
- Planned Hours (auto-calculated from start/end)
- Supervisor
- Role/Trade
- Notes
- Status (for edits: Scheduled / Changed / Completed / Missed)

Validation: end time after start, hours positive, employee + job + date required.

---

## Print: Daily Crew Sheet

Click **Print Week** for the full week, or the **🖨** button on any day card for just that day.

Print layout includes:
- Company name placeholder
- Date + job info
- Supervisor
- Employee list with planned start/end, hours, role/trade
- Notes column
- Blank signature/check-in column

---

## Worker View

Workers see their own assignments via:
1. **WorkerDashboard** — "Today's Assignment" card shows job, time, supervisor, location, notes
2. **Crew Schedule page** — filtered to their own assignments only (read-only)

---

## Backend Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/schedule/weekly` | Weekly schedule grid grouped by day → job → employees |
| POST | `/api/schedule/assign` | Create one assignment |
| POST | `/api/schedule/bulk-assign` | Assign multiple employees to same job/day |
| PATCH | `/api/schedule/assignments/{id}` | Edit an assignment |
| DELETE | `/api/schedule/assignments/{id}` | Soft-delete (status = removed) |
| GET | `/api/schedule/variance` | Schedule vs actual timecard comparison |
| GET | `/api/schedule/today` | Worker's assignments for today |

---

## Database Table: `schedule_assignments`

| Column | Type | Description |
|---|---|---|
| id | int | PK |
| employee_id | FK | Employee |
| job_id | FK | Job |
| supervisor_id | FK | Supervisor employee |
| date | date | Assignment date |
| planned_start_time | string | HH:MM |
| planned_end_time | string | HH:MM |
| planned_hours | float | Auto-calculated or manual |
| role | string | Trade/role for this assignment |
| notes | text | Optional notes |
| status | enum | scheduled / changed / completed / missed / removed |
| created_by_id | FK | User who created |
| created_at | datetime | |
| updated_at | datetime | |

---

## Test Checklist

- [ ] Navigate to Crew Schedule → weekly board loads with demo data
- [ ] Click ← to go to the seeded week, see assignments grouped by day/job
- [ ] Click **Assign** → modal opens with date pre-filled
- [ ] Select 3 employees, pick a job, set start 07:00 end 15:30 → hours auto-calculates to 8.5
- [ ] Save → assignments appear on the board
- [ ] Click an assignment card → edit modal opens with existing values
- [ ] Change job → save → card updates
- [ ] Click 🗑 on a card → assignment removed (soft delete, disappears from board)
- [ ] Click **Variance** tab → issues list loads
- [ ] Verify "Missing Timecard" flags for employees with schedule but no time entries
- [ ] Verify "Unscheduled Work" flags for time entries with no matching schedule
- [ ] Click **Print Week** → browser print dialog, crew sheet layout shows
- [ ] Login as worker1 → WorkerDashboard shows "Today's Assignment" card
- [ ] Worker navigates to Crew Schedule → only sees their own assignments

---

## What Phase 2.4 Should Be

### Option A — Sage Direct API Connection
Replace the simulated Sage sync with real Sage 100/300 API credentials and live push of approved/locked timecards.

### Option B — Timecard Mobile PWA
Offline-capable worker app for submitting time from the job site without a laptop. GPS location tagging, photo receipt upload, push notifications for rejection/correction.

### Option C — Purchase Orders + Vendor Management
Full procurement workflow: vendor list, PO creation from material requests, PO approval, receipt/invoice upload, Sage AP integration.

### Option D — AI Ops Layer
- AI missing-time detection (alert if no entry by end of day)
- AI job-cost overage warnings (flag when job is trending over budget)
- AI wrong-job detection from GPS vs job address
- Natural language time entry ("8 hours framing on Riverside")
