# Stryda backlog

The nightly task reads this file, takes the first item marked `todo`, and updates its status in the pull request it opens. Edit it any time to reprioritize. Items marked `blocked` need a decision from Eli and are skipped.

Statuses: `todo`, `in review` (branch pushed, pull request open), `done` (merged), `blocked`.

## Phase 2: pilot hardening

| # | Item | Status |
|---|------|--------|
| 1 | Payroll lock, crew scope and entry state guards on approval routes | done |
| 2 | Guarded receipt upload, private S3 or local storage, Dockerfile | done |
| 3 | Login rate limit | done |
| 4 | Readable API errors on every page | done |
| 5 | Alerts API and supervisor dashboard alerts panel | in review |
| 6 | Supervisor with no employee profile sees nothing (queue, entries, daily review), mark-absent limited to own crew | in review |
| 7 | Startup migration safe on a fresh Postgres database | in review |
| 8 | Same no-profile supervisor scope fix in reports.py, schedule.py and material_requests.py, with tests | in review |
| 9 | docs/DEPLOY_AWS.md: RDS PostgreSQL, App Runner with backend/Dockerfile, private S3 (S3_BUCKET, AWS_REGION), Secrets Manager (SECRET_KEY, DATABASE_URL), CORS_ORIGINS, STRYDA_ENV=prod, backups, budget alert. No invented prices. | todo |
| 10 | CSV export split into regular, overtime and double time columns | blocked: needs column layout from Eli |
| 11 | "Mark as exported" default behavior | blocked: needs decision from Eli |
| 12 | Production cutover: clean demo accounts, rotate credentials | blocked: Eli only |
| 18 | Supervisors with a profile still see company-wide data in reports.py job-cost, status-summary and job-cost-snapshot; limit those to the supervisor's crew with tests | todo |

## Phase 3: direction

| # | Item | Status |
|---|------|--------|
| 13 | Purchase orders, slice 1 (backend): create a purchase order from an approved material request, with status, approve and reject using the existing approval and audit patterns, plus tests | todo |
| 14 | Purchase orders, slice 2 (frontend): list, create and approve screens, mobile friendly | todo |
| 15 | Vendors: vendor records and a price history per material, fed by purchase orders | todo |
| 16 | Inventory per job site, starting from received materials | todo |
| 17 | Direct Sage connection, read only | blocked: needs Calray's Sage product, version and API access. CSV stays the fallback. |
