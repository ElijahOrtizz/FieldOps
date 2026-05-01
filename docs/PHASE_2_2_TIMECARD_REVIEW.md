# Stryda Phase 2.2 — Timecard Review & Payroll Workflow

## Overview

Phase 2.2 turns Stryda into a full weekly payroll review tool. Admins and supervisors can now review timecards, edit entries, approve by day or week, lock payroll after review, print timecards, and export only the right entries to Sage.

---

## Features

### 1. Time Entry View/Edit Modal

Available from: Weekly Timecards (click any entry card)

Shows:
- Employee, date, start/end time, hours, job, cost code, pay type, notes
- Status badge
- Attachments (linked receipts)
- Approval record
- Collapsible audit history (all edits/approvals for this entry)

Edit rules:
- Workers: view only on approved/exported entries
- Supervisors: can edit submitted entries; can change status to approved/rejected
- Admins: can edit any entry; must acknowledge warning before editing approved/exported entries
- Locked weeks: non-admins cannot edit; admins see a warning but can still proceed

Every save creates an audit log entry.

### 2. Weekly Approval Workflow

On Weekly Timecards:

**Approve Day** — button appears on each day cell when submitted entries exist. Approves all submitted entries for that employee on that day.

**Approve Week** — button on each employee card. Approves all submitted entries for that employee for the entire week.

**Approve All** — top-level button (admin/supervisor). Approves every submitted entry for all employees in the selected week.

Rules:
- Only `submitted` entries are changed — approved, rejected, and exported entries are not touched
- All approval actions create audit log entries
- Locked weeks block the Approve buttons

### 3. Payroll Lock

Admin-only feature on the Weekly Timecards page.

**Lock Week**: Locks the selected week for payroll. Shows a prominent amber banner.
- Non-admins cannot edit any time entries for locked weeks (backend also enforces this with HTTP 423)
- Supervisors and workers see "Week is payroll-locked" if they try to edit

**Unlock Week**: Admin can unlock at any time.

Lock records are stored in `payroll_locks` table with who locked/unlocked and when.

### 4. Print Weekly Timecards

**Print** button on Weekly Timecards page (top right).

Prints a clean paper-formatted timecard grid for all visible employees (or filtered employee).

Print layout includes:
- Employee name, trade, week range
- Day-by-day table: job, cost code, start/end, hours, status, notes
- Weekly total row
- Employee signature line
- Supervisor signature line

Uses browser print CSS — no PDF dependency.

### 5. Export to Sage — Improved Rules

Updated ExportPage:
- **Preview table**: shows every entry that will be exported before download
- **Record count + total hours** displayed above preview
- **Only approved entries** exported by default (no submitted, rejected, or draft)
- **Already-exported entries skipped** unless "Include already exported" is checked
- **Warning banner** when re-exporting is enabled
- **Confirmation dialog** before download: "This will export X entries (Yh)"
- **Mark as exported** checkbox (default on) — marks entries as `exported` after download
- Export batch record created on every marked export
- Audit log entry written for every export

### 6. Timecard Status Summary

On Weekly Timecards, four summary cards:
- Total hours this week
- Approved hours (✓)
- Pending hours (awaiting approval)
- Ready for Sage (= approved hours)

---

## New Backend Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/payroll-locks/check?week_start=` | Any | Check if a week is locked |
| GET | `/api/payroll-locks/` | Supervisor+ | List all lock records |
| POST | `/api/payroll-locks/lock` | Admin | Lock a week |
| POST | `/api/payroll-locks/unlock` | Admin | Unlock a week |
| POST | `/api/approvals/approve-week` | Supervisor+ | Approve submitted entries for a week/day/employee |
| GET | `/api/time-entries/{id}/audit` | Any | Fetch audit log for one entry |
| GET | `/api/export/preview` | Admin | Preview entries before export |

### Updated Endpoints

`PUT /api/time-entries/{id}` — now enforces:
- Payroll lock check (HTTP 423 if locked and not admin+force)
- Exported entry protection (must use `force: true` as admin)
- Start/end time validation (end must be after start)
- Hours must be positive
- Audit log on every edit

`GET /api/export/sage-csv` — now supports `include_exported` param and skips already-exported by default.

---

## Database Changes

New table: `payroll_locks`

| Column | Type | Description |
|---|---|---|
| id | int | PK |
| week_start | date | Monday of the locked week |
| week_end | date | Sunday of the locked week |
| locked_by_id | int FK | User who locked |
| locked_at | datetime | When locked |
| unlocked_by_id | int FK | User who unlocked (if applicable) |
| unlocked_at | datetime | When unlocked |
| status | string | `locked` or `unlocked` |
| notes | text | Optional note |

No existing tables were modified — only additive changes.

---

## Test Checklist

- [ ] Login as admin → Weekly Timecards loads
- [ ] Use ← arrow to navigate to a week with data
- [ ] Click any entry card → edit modal opens
- [ ] Edit job or hours → save → entry updated, audit log recorded
- [ ] Try setting end time before start time → validation error shown
- [ ] Click "Approve All" → all submitted entries approved
- [ ] Navigate to a fresh week → click "Lock Week"
- [ ] Locked banner appears; "Approve" buttons disappear
- [ ] Login as supervisor → try to edit a locked entry → blocked
- [ ] Login as admin → edit locked entry → warning shown, still editable
- [ ] Admin unlocks week → locked banner disappears
- [ ] Click Print → print preview opens with timecard layout
- [ ] Navigate to Export to Sage → preview table shows approved entries
- [ ] Uncheck "Mark as exported" → download CSV → entries remain approved
- [ ] Check "Mark as exported" → download → entries show as exported
- [ ] Check "Include already exported" → warning banner appears
- [ ] Filter by employee on weekly timecards → only that employee shown
- [ ] Audit log page → edit actions recorded

---

## Known Limitations

- Print uses browser print CSS; no custom PDF generation yet
- Payroll lock only prevents edits via the API — direct DB access bypasses it (expected)
- The `force: true` admin override for exported entries is passed from the frontend modal but does not show a separate "unlock" UX — the admin just sees the warning and proceeds
- `approve-week` endpoint does not check if the week is locked (approval is a separate action from editing)
- Supervisor "approve day" currently scoped to their crew per the existing supervisor/crew logic
