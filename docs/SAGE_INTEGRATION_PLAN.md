# Stryda — Sage Integration Plan

## Overview

Stryda is designed Sage-first. The MVP uses manual CSV export as a bridge, with all data structures and IDs pre-mapped to Sage's schema so that a direct API/connector integration can be added in a future version with minimal refactoring.

---

## Phase 1 — MVP: Sage-Ready CSV Export (Current)

### How It Works

All approved time entries can be exported as a CSV from the **Export** page (`/export`). The file is formatted to match the field names and structure Sage 100 Contractor and Sage 300 CRE expect for payroll and job-cost import.

### CSV Columns

| Column | Source in Stryda | Sage Field |
|---|---|---|
| `Employee_ID` | `employees.sage_employee_id` | Employee ID |
| `Employee_Name` | `employees.full_name` | Employee Name |
| `Job_Number` | `jobs.job_number` / `jobs.sage_job_id` | Job Number |
| `Job_Name` | `jobs.job_name` | Job Name |
| `Cost_Code` | `cost_codes.code` / `cost_codes.sage_cost_code` | Cost Code |
| `Cost_Code_Desc` | `cost_codes.description` | Cost Code Description |
| `Date` | `time_entries.date` | Date |
| `Day_Of_Week` | Derived from date | Day |
| `Start_Time` | `time_entries.start_time` | Start Time |
| `End_Time` | `time_entries.end_time` | End Time |
| `Hours` | `time_entries.total_hours` | Hours |
| `Pay_Type` | `time_entries.pay_type` | Pay Type (Regular/OT/DT) |
| `Notes` | `time_entries.notes` | Description/Notes |
| `Approved_By` | `approvals → users.full_name` | Approver |
| `Approval_Date` | `approvals.approved_at` | Approval Date |
| `Export_Date` | Generated at export time | Export Date |

### How to Import into Sage

1. From Stryda **Export** page, select date range and jobs, then click **Download Sage CSV**
2. Optionally check **Mark as Exported** to prevent duplicate exports
3. Open Sage 100 Contractor → **5-2-2 Payroll Records** → Import
4. Map columns to Sage fields (one-time setup)
5. Review and post

---

## Phase 2 — Direct Sage API Integration (Planned)

### What Would Be Required

- Sage 100 Contractor or Sage 300 CRE with API/ODBC access enabled
- A middleware service (Python FastAPI or Node) that acts as a Sage connector
- OAuth or API key credentials from Sage (varies by version)
- Mapping layer between Stryda internal IDs and Sage IDs (already partially built — see `sage_employee_id`, `sage_job_id`, `sage_cost_code` fields)

### Integration Architecture

```
Stryda Backend (FastAPI)
        │
        ▼
  Sage Connector Service
  (new microservice or router)
        │
   ┌────┴────┐
   │         │
Sage API   ODBC/Direct
(if avail) (fallback)
        │
   Sage 100 / 300
```

### Endpoints to Build

```
POST /sage/sync/employees     → Pull employees from Sage into Stryda
POST /sage/sync/jobs          → Pull active jobs from Sage
POST /sage/sync/cost-codes    → Pull cost codes from Sage
POST /sage/push/time-entries  → Push approved entries to Sage payroll
POST /sage/push/job-costs     → Push job cost transactions to Sage
```

---

## Data Flow: What Gets Imported FROM Sage

| Data | Sage Source | Stryda Destination | Frequency |
|---|---|---|---|
| Employees | Sage Employee records | `employees` table | On sync / daily |
| Jobs | Sage Job records | `jobs` table | On sync / daily |
| Cost Codes | Sage Cost Code table | `cost_codes` table | On sync / weekly |
| Vendors | Sage Vendor list | `vendors` table (future) | On sync |
| Equipment | Sage Equipment list | `equipment` table (future) | On sync |

---

## Data Flow: What Gets Pushed TO Sage

| Data | Stryda Source | Sage Destination | Trigger |
|---|---|---|---|
| Approved time entries | `time_entries` (approved) | Sage Payroll / Job Cost | On export or auto-nightly |
| Expenses / Receipts | `receipts` table (future) | Sage AP / Job Cost | On approval |
| Job cost allocations | Derived from time + cost code | Sage Job Cost | On export |
| Equipment usage | `equipment_usage` (future) | Sage Equipment module | On approval |
| Material purchases | `purchase_orders` (future) | Sage PO module | On PO approval |

---

## Sage ID Mapping Strategy

All Stryda entities that correspond to a Sage record carry a `sage_*` ID field:

- `employees.sage_employee_id` — maps to Sage Employee ID
- `jobs.sage_job_id` — maps to Sage Job Number
- `cost_codes.sage_cost_code` — maps to Sage Cost Code

These fields are nullable in MVP (manual entry optional). When Sage sync is live, they will be populated automatically on import and used as the join key on export.

**Rule:** Stryda is the source of truth for time entry data. Sage is the source of truth for employee, job, and cost code master data.

---

## Sage Versions Targeted

| Version | Integration Method | Status |
|---|---|---|
| Sage 100 Contractor | CSV import (manual) | ✅ MVP |
| Sage 300 CRE | CSV import (manual) | ✅ MVP |
| Sage 100 Contractor | Direct API / ODBC | 🔜 Phase 2 |
| Sage 300 CRE | Sage Intelligence / API | 🔜 Phase 2 |
| Sage Intacct | REST API | 🔜 Phase 3 |

---

## Notes for Developers

- Do not remove `sage_employee_id`, `sage_job_id`, or `sage_cost_code` fields from the schema — they are load-bearing for the Phase 2 sync
- The `exported_at` field on `time_entries` tracks which records have been pushed to Sage and prevents double-export
- The CSV export endpoint lives at `GET /api/export/sage-csv` and accepts `date_from`, `date_to`, `job_id`, and `mark_exported` query params
- All Sage-related logic should be isolated in `routers/export.py` and a future `routers/sage_sync.py` — do not mix it into other routers
