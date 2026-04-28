# FieldOps Phase 2.1 — Weekly Timecards

## Feature Overview

The Weekly Timecards page gives admins and supervisors a complete view of who worked what, when, on which job, for any week.

## How to Access

- **Admin sidebar:** Weekly Timecards
- **Supervisor sidebar:** Weekly Timecards
- **URL:** `/weekly-timecards`

## What It Shows

### Week Navigation
- Previous / Next week arrows
- Current week label (e.g. "Apr 20 – Apr 26")
- "Jump to current week" shortcut

### Filters
- Employee filter dropdown
- Job filter dropdown
- Status filter (pending / approved / rejected / exported)

### Week Summary Cards (top)
- Total hours across all employees
- Approved hours (ready for Sage export)
- Pending hours (submitted, awaiting approval)
- Top job by hours

### Job Total Bar
- Hours per job across the full week, shown as labeled chips

### Employee Cards (one per employee)
Each card shows:
- Employee name, trade, number
- Weekly total hours
- Approved / submitted / rejected / exported hour breakdowns
- Expandable/collapsible (click header to toggle)

**Desktop:** 7-column grid (Mon–Sun), each cell shows:
- Job number + name
- Cost code + description
- Start/end time
- Hours
- Notes
- Status badge (approved / submitted / rejected / exported)

**Mobile:** stacked daily list with the same data

**Footer:** per-employee summary of hours by job and hours by cost code

## New Backend Endpoint

```
GET /api/reports/weekly-timecards
```

**Query parameters:**
| Param | Type | Description |
|---|---|---|
| `week_start` | date (YYYY-MM-DD) | Monday of the target week. Defaults to current week. |
| `employee_id` | int (optional) | Filter to one employee |
| `job_id` | int (optional) | Filter to entries on one job |
| `status` | string (optional) | Filter by entry status |

**Response structure:**
```json
{
  "week_start": "2026-04-20",
  "week_end":   "2026-04-26",
  "summary": {
    "total_hours": 100.0,
    "approved_hours": 39.5,
    "submitted_hours": 51.5,
    "employee_count": 5,
    "hours_by_job": [...],
    "hours_by_cost_code": [...]
  },
  "employees": [
    {
      "employee_name": "Tyler Brooks",
      "total_hours": 43.5,
      "approved_hours": 8.5,
      "submitted_hours": 26.0,
      "rejected_hours": 9.0,
      "exported_hours": 0,
      "hours_by_job": [...],
      "hours_by_cost_code": [...],
      "days": [
        {
          "date": "2026-04-21",
          "day_name": "Tuesday",
          "total_hours": 8.5,
          "entries": [
            {
              "id": 7,
              "job_number": "2024-001",
              "job_name": "Oakwood Medical Center",
              "cost_code": "LAB-001",
              "hours": 8.5,
              "status": "submitted"
            }
          ]
        }
      ]
    }
  ]
}
```

All 7 days are always included in the response, even days with no entries (`entries: []`).

## How to Test

1. Start the backend: `python3 -m uvicorn main:app --reload --port 8000`
2. Start the frontend: `npm run dev`
3. Login as admin: `admin@fieldops.com / admin123`
4. Click **Weekly Timecards** in the sidebar
5. Current week should load with seeded demo data (check that week has entries — seed data is randomized across past 4 weeks)
6. Use the `←` arrow to go back one week until you see employees with hours
7. Click an employee card header to collapse/expand
8. Try filters: filter to a specific employee or job
9. Try the status filter: "Approved only"
10. Login as supervisor and confirm Weekly Timecards shows crew entries
