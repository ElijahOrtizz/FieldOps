# FieldOps Phase Roadmap

## Phase 1 (Complete) — Sage-Ready MVP

Core timecard system with approval workflow and CSV export.

- Role-based login (worker / supervisor / admin)
- Worker time entry with job + cost code selection
- Supervisor approval queue (approve / reject / bulk approve)
- Admin dashboard with job cost overview
- Jobs, employees, cost code management
- Sage-ready CSV export (Sage 100 Contractor / Sage 300 CRE format)
- Basic reports (hours by job, cost code breakdown)

---

## Phase 2 (Complete) — Field Operations Platform

Turns FieldOps from a timecard tool into a real contractor operations system.

### What Phase 2 Added

**Approval Audit Trail**
- Full audit log of every approval, rejection, edit, and export action
- Stores old vs. new values for every edit
- Viewable by admin and supervisor in the Audit Log page

**Supervisor Edit Before Approval**
- Supervisors and admins can edit time entries before approving
- Fix job, cost code, hours, start/end time, pay type, or notes
- Every edit is automatically logged in the audit trail

**Material Requests Module**
- Workers submit material requests (name, quantity, unit, job, priority, needed-by date)
- Supervisors/admins approve, deny, mark as ordered or delivered
- Full status workflow: requested → approved → ordered → delivered / denied
- Role-scoped visibility: workers see own, supervisors see crew, admins see all

**Export History**
- Every Sage CSV export creates a batch record
- Export History page shows file name, record count, exported by, and timestamp
- Export audit logs written automatically on each export

**Admin Settings Page**
- Company name
- Default pay type (Regular / OT / DT)
- Overtime threshold (hours/day)
- Sage export format (Sage 100 / Sage 300)
- Upload directory path

**Improved Reports**
- Hours by job (bar chart)
- Hours by employee (ranked bar)
- Time entry status breakdown (pie chart: submitted / approved / rejected / exported)
- Material requests by status (mini cards)
- Hours by cost code (ranked bar)

**Navigation Overhaul**
- Admin: 12 nav items covering all modules
- Supervisor: Dashboard, Approvals, Crew Time, Material Requests, Reports, Activity Log
- Worker: Dashboard, Log Time, My Entries, Material Requests

---

## Phase 3 (Planned) — Sage Direct Integration + Purchasing

### Sage Direct Integration
- Direct Sage API / ODBC connection to pull employees, jobs, cost codes automatically
- Scheduled nightly sync: Sage → FieldOps master data
- Push approved time entries directly to Sage payroll (no manual CSV import)
- Sage Intacct REST API support
- Sync error reporting and conflict resolution

### Purchasing & Procurement
- Vendor management (name, contact, trade specialty, rating)
- Vendor price comparison for material requests
- Purchase order creation from approved material requests
- PO approval workflow (supervisor → admin → finance)
- Receipt/invoice upload linked to POs
- Sage AP integration: push approved POs to Sage accounts payable

### Inventory
- Job site inventory tracking (what's on site, what's consumed)
- Material usage logs linked to time entries and cost codes
- Low-stock alerts per job
- Inventory reports by job and cost code

---

## Phase 4 (Planned) — AI Intelligence Layer

### AI Missing Time Detection
- Flag workers who haven't submitted time for a scheduled work day
- Supervisor alert: "Jordan Vega has no time logged for Wednesday"
- Configurable work schedule per employee

### AI Job Cost Warnings
- Real-time job cost tracking vs. budget
- Alert when a job hits 80% of budget hours
- Alert when a cost code is trending over its portion of budget
- Projected completion date based on current burn rate

### AI Material Estimator
- Based on job type, scope, and historical data, suggest materials needed
- Auto-generate draft material requests from job creation
- Learn from actual usage vs. estimated

### AI Anomaly Detection
- Flag duplicate time entries (same employee, date, job)
- Flag unusually high or low hour counts
- Flag cost codes that don't match the work description
- Flag entries submitted significantly after the work date

### Natural Language Entry
- Workers can type: "8 hours framing on the Riverside project" → auto-filled form
- Powered by the Anthropic API

### Bid vs. Actual Reporting
- Compare original project bid assumptions to actual hours/costs
- Identify jobs where labor is over/under bid
- Report for project managers and estimators
