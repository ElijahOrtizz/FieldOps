# Admin and Payroll Guide

For admins and payroll staff. Supervisors can use the approval and review pages listed below.

## Weekly payroll steps

1. **Approval Queue.** Review submitted entries. Approve, reject, or flag for correction. Rejected and flagged entries go back to the worker.
2. **Daily Review** (supervisors). Compare scheduled crew to actual time, mark absences, and sign off the day.
3. **Weekly Timecards.** Check each employee's week. Approve entries here too.
4. **Lock payroll.** On Weekly Timecards, press **Lock** for the week. If entries are still pending, the system stops you and tells you how many (admins can override). Locked weeks cannot be approved, rejected, or edited by workers.
5. **Export to Sage.** Choose the dates, preview the entries, then press **Download Sage CSV**. Only approved entries are included.
6. **Import the CSV into Sage.** Stryda does not connect to Sage directly. The CSV is the handoff.

If you need to change a locked week, press **Unlock**, make the change, and lock again. Unlocking is recorded.

## Export notes

- The "mark as exported" box is checked by default. Checked means the entries are marked exported when the file is generated, so they will not be included in the next export.
- Uncheck the box to download a copy without changing entry status.
- **Export History** lists every confirmed export with who ran it and how many entries it had.
- An entry that is not approved will not appear. If the preview is empty, check approvals first.

## Other pages

- **Time Entries:** all entries with filters.
- **Jobs, Employees, Cost Codes:** reference data. Employee numbers are used as the Sage employee ID unless a Sage ID is set.
- **Settings:** overtime rules. The default is overtime after 40 hours in a week.
- **Reports:** hours by job and employee.
- **Audit Log:** who approved, edited, rejected, locked, or exported, and when.

## Common messages

| Message | Meaning |
|---|---|
| Cannot lock: N entries still pending approval | Approve or reject them first. |
| Payroll week is locked | Unlock the week before changing the entry. |
| No approved entries found for the given filters | Nothing is ready to export for those dates. |
