# Stryda — Weekly Timecards UX Upgrade

## What Changed

This upgrade makes the Weekly Timecards page production-ready for large crews (100+ employees).

---

## Sticky Filter Bar

The filter bar is pinned to the top of the page using `position: sticky; top: 0`.
It stays visible while scrolling through long employee lists.

**Row 1 controls (left to right):**
- Week navigator (← current week →) with "Today" shortcut
- Employee search — filters instantly by name, employee number, or trade
- Employee dropdown (for exact single-employee selection)
- Job dropdown (shows only jobs returned for this week)
- **"With Time" toggle** — hides employees with zero hours when enabled; shows all when off
- Clear filters button (appears when any filter is active)
- ↑ All / ↓ All — collapse or expand all visible employee cards
- Approve All (N) — bulk-approve all submitted entries in view
- Lock / Unlock — payroll lock for the week (admin only)
- Print — opens browser print dialog

**Row 2 controls:**
- **Quick status chips** — All / Needs Review / Approved / Rejected / Exported / Ready for Sage
- **Employee count feedback** — "12 with time · Showing 18 of 40"

---

## Quick Status Chips

Each chip filters the employee list:

| Chip | Shows employees where… |
|---|---|
| All | No filter |
| Needs Review | Any entry has `status = submitted` |
| Approved | Any entry has `status = approved` |
| Rejected | Any entry has `status = rejected` |
| Exported | Any entry has `status = exported` or `sage_sync_status = synced` |
| Ready for Sage | Any entry has `sage_sync_status = ready` |

Active chip is visually highlighted with a border and tinted background.

---

## Only With Time Toggle

When enabled (default: off), employees with `total_hours = 0` for the selected week are hidden.
This is client-side filtering — no extra API call needed.

The backend returns all active employees (including those with zero hours), so toggling is instant.

---

## Auto-Collapse Logic

- **≤ 10 employees shown** → all cards expanded by default
- **> 10 employees shown** → all cards collapsed by default

Users can manually toggle each card. The **↑ All / ↓ All** buttons force-collapse or force-expand all visible cards simultaneously.

---

## Employee Count Feedback

The bottom-right of the sticky bar always shows:
- How many employees have time this week (from backend summary)
- How many are currently visible after client-side filters

Example: `12 with time · Showing 5 of 40`

When showing fewer than total: count is highlighted in brand color.

---

## Demo Data (seed_large.py)

A `seed_large.py` script adds 35 realistic employees with varied time entries across the current week.

```bash
cd stryda/backend
python3 seed_large.py
```

After running: ~40 total employees, ~30 with time this week, ~10 with no time.

This gives a realistic dataset for testing:
- The "Only With Time" toggle
- Status chip filtering
- Auto-collapse at > 10 employees
- Search by name/trade

Safe to run multiple times — skips already-existing records.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/pages/WeeklyTimecardsPage.jsx` | Full UX upgrade |
| `backend/routers/reports.py` | Added `total_employee_count` + `employees_with_time` to summary |
| `backend/seed_large.py` | New — 35 demo employees + time entries |

---

## Test Checklist

- [ ] Navigate to Weekly Timecards → sticky filter bar stays visible while scrolling
- [ ] Type in search box → employee list filters instantly by name
- [ ] Type a trade name (e.g. "Carpenter") → filters to matching trades
- [ ] Toggle "With Time" → employees with 0h disappear; toggle off to restore
- [ ] Click "Needs Review" chip → only employees with pending entries shown
- [ ] Click "Approved" chip → only employees with approved entries shown
- [ ] Click "Ready for Sage" chip → only employees with sage_ready entries shown
- [ ] Click "↑ All" → all cards collapse
- [ ] Click "↓ All" → all cards expand
- [ ] With > 10 employees, navigate to a busy week → cards start collapsed
- [ ] With ≤ 10 employees, navigate to a quiet week → cards start expanded
- [ ] Employee count feedback updates correctly as filters change
- [ ] Approve All button shows correct pending count
- [ ] Lock/Unlock week works
- [ ] Print opens browser print dialog with employee timecards
- [ ] View/Edit modal opens from entry cards
