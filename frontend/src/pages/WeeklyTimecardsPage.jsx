import { useEffect, useState, useCallback, useRef } from 'react'
import {
  reportsApi, employeesApi, jobsApi, costCodesApi,
  approvalsApi, payrollLocksApi, timeEntriesApi, sageApi
} from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { PageHeader, LoadingSpinner, EmptyState } from '../components/common'
import TimeEntryEditModal from '../components/common/TimeEntryEditModal'
import {
  CalendarDays, ChevronLeft, ChevronRight, CheckCircle2,
  Lock, Unlock, Printer, Edit2, CheckSquare, AlertTriangle,
  Search, X, RotateCcw, Send, RefreshCw, BadgeCheck, Ban,
  MessageSquare, Users, ChevronsUpDown, ChevronDown, ChevronUp,
  Eye, EyeOff
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

// ─── helpers ──────────────────────────────────────────────────────────────────
function toMonday(d) {
  const dt = new Date(d)
  const day = dt.getDay()
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day))
  return dt.toISOString().slice(0, 10)
}
function addDays(dateStr, n) {
  const d = new Date(dateStr); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function fmtDate(str) {
  try { return format(parseISO(str), 'MMM d') } catch { return str }
}
function todayMonday() { return toMonday(new Date().toISOString().slice(0, 10)) }

// ─── status config ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  approved:  { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', label: 'Approved' },
  submitted: { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',       label: 'Pending'  },
  rejected:  { cls: 'bg-red-500/15 text-red-400 border-red-500/20',             label: 'Rejected' },
  exported:  { cls: 'bg-purple-500/15 text-purple-400 border-purple-500/20',    label: 'Exported' },
  draft:     { cls: 'bg-slate-500/15 text-slate-400 border-slate-500/20',       label: 'Draft'    },
  needs_correction: { cls: 'bg-orange-500/15 text-orange-400 border-orange-500/20', label: 'Needs Fix' },
}
const SAGE_CFG = {
  not_ready: null,
  ready:     { cls: 'text-brand-400',   label: '⚡ Ready'  },
  synced:    { cls: 'text-emerald-400', label: '✓ Synced' },
  failed:    { cls: 'text-red-400',     label: '✗ Failed' },
}

function Badge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.draft
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}
function SageBadge({ syncStatus }) {
  const cfg = SAGE_CFG[syncStatus]
  if (!cfg) return null
  return <span className={`text-[10px] font-semibold ${cfg.cls}`}>{cfg.label}</span>
}

// ─── print CSS ─────────────────────────────────────────────────────────────────
const PRINT_CSS = `@media print {
  body * { visibility: hidden; }
  #print-area, #print-area * { visibility: visible; }
  #print-area { position: fixed; top: 0; left: 0; width: 100%; background: white; color: black; padding: 20px; font-family: sans-serif; font-size: 10px; }
  .no-print { display: none !important; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th, td { border: 1px solid #ccc; padding: 3px 5px; }
  th { background: #f0f0f0; font-weight: bold; }
  h1 { font-size: 14px; margin-bottom: 2px; }
  h2 { font-size: 11px; margin: 12px 0 4px; border-bottom: 1px solid #ddd; }
  .sig-row { display: flex; gap: 40px; margin-top: 24px; }
  .sig-line { flex: 1; border-top: 1px solid #999; padding-top: 3px; font-size: 9px; color: #666; }
  .page-break { page-break-after: always; }
}`
if (!document.getElementById('fo-print-css')) {
  const s = document.createElement('style'); s.id = 'fo-print-css'
  s.textContent = PRINT_CSS; document.head.appendChild(s)
}

function PrintArea({ employees, weekLabel }) {
  return (
    <div id="print-area" style={{ display: 'none' }}>
      <h1>FieldOps — Weekly Timecards &nbsp;·&nbsp; {weekLabel}</h1>
      <p style={{ fontSize: 9, color: '#777', marginBottom: 12 }}>
        Printed: {format(new Date(), 'MMM d, yyyy h:mm a')}
      </p>
      {employees.map(emp => (
        <div key={emp.employee_id} className="page-break">
          <h2>{emp.employee_name} &nbsp;·&nbsp; {emp.trade || 'Employee'} &nbsp;·&nbsp; #{emp.employee_number}</h2>
          <table>
            <thead>
              <tr><th>Day</th><th>Date</th><th>Job</th><th>Cost Code</th><th>Start</th><th>End</th><th>Hrs</th><th>Status</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {emp.days.map(day => day.entries.length === 0 ? (
                <tr key={day.date}>
                  <td>{day.day_name.slice(0, 3)}</td><td>{day.date}</td>
                  <td colSpan={7} style={{ color: '#bbb', fontStyle: 'italic' }}>—</td>
                </tr>
              ) : day.entries.map((e, i) => (
                <tr key={e.id}>
                  {i === 0 ? <><td>{day.day_name.slice(0, 3)}</td><td>{day.date}</td></> : <><td/><td/></>}
                  <td>{e.job_number}</td><td>{e.cost_code}</td>
                  <td>{e.start_time || ''}</td><td>{e.end_time || ''}</td>
                  <td style={{ fontWeight: 'bold' }}>{e.hours}</td>
                  <td style={{ textTransform: 'capitalize' }}>{e.status}</td>
                  <td style={{ maxWidth: 120, overflow: 'hidden' }}>{e.notes || ''}</td>
                </tr>
              )))}
              <tr style={{ fontWeight: 'bold', background: '#f5f5f5' }}>
                <td colSpan={6}>Weekly Total</td>
                <td>{emp.total_hours}h</td><td colSpan={2}/>
              </tr>
            </tbody>
          </table>
          <div className="sig-row" style={{ display: 'flex', gap: 40, marginTop: 24 }}>
            <div className="sig-line" style={{ flex: 1, borderTop: '1px solid #999', paddingTop: 3, fontSize: 9, color: '#666' }}>
              Employee Signature ___________________________ &nbsp; Date ___________<br/>
              {emp.employee_name}
            </div>
            <div className="sig-line" style={{ flex: 1, borderTop: '1px solid #999', paddingTop: 3, fontSize: 9, color: '#666' }}>
              Supervisor Signature ___________________________ &nbsp; Date ___________
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t) }, [])
  const bg = type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
  return (
    <div className={`fixed bottom-6 right-6 z-[60] ${bg} text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-2xl max-w-xs`}>
      {msg}
    </div>
  )
}

// ─── note modal ─────────────────────────────────────────────────────────────────
function NoteModal({ title, placeholder, onConfirm, onClose }) {
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-5 shadow-2xl">
        <h3 className="font-semibold text-slate-100 mb-3">{title}</h3>
        <textarea className="input min-h-[72px] mb-4" value={note}
          onChange={e => setNote(e.target.value)} placeholder={placeholder} autoFocus />
        <div className="flex gap-3">
          <button onClick={() => onConfirm(note)} className="btn-primary">Confirm</button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── quick status chips ────────────────────────────────────────────────────────
const CHIPS = [
  { key: 'all',          label: 'All',             color: 'text-slate-300 border-slate-700 bg-slate-800' },
  { key: 'needs_review', label: 'Needs Review',     color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  { key: 'approved',     label: 'Approved',         color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  { key: 'rejected',     label: 'Rejected',         color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  { key: 'exported',     label: 'Exported',         color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
  { key: 'sage_ready',   label: 'Ready for Sage',   color: 'text-brand-400 border-brand-500/30 bg-brand-500/10' },
]

function employeeMatchesChip(emp, chip) {
  if (chip === 'all') return true
  const entries = emp.days.flatMap(d => d.entries)
  if (chip === 'needs_review') return entries.some(e => e.status === 'submitted' || e.status === 'needs_correction')
  if (chip === 'approved')     return entries.some(e => e.status === 'approved')
  if (chip === 'rejected')     return entries.some(e => e.status === 'rejected')
  if (chip === 'exported')     return entries.some(e => e.status === 'exported' || e.sage_sync_status === 'synced')
  if (chip === 'sage_ready')   return entries.some(e => e.sage_sync_status === 'ready')
  return true
}

// ─── entry quick actions ───────────────────────────────────────────────────────
function EntryActions({ entry, canApprove, isLocked, onAction, onEdit }) {
  const [showNote, setShowNote] = useState(null)
  const status = entry.status
  return (
    <div className="flex items-center gap-0.5 shrink-0 no-print">
      <button onClick={() => onEdit(entry.id)}
        className="p-1 text-slate-600 hover:text-brand-400 transition-colors" title="View/Edit">
        <Edit2 className="w-3 h-3" />
      </button>
      {canApprove && !isLocked && (status === 'submitted' || status === 'needs_correction') && (
        <>
          <button onClick={() => onAction(entry.id, 'approve')}
            className="p-1 text-slate-600 hover:text-emerald-400 transition-colors" title="Approve">
            <CheckCircle2 className="w-3 h-3" />
          </button>
          <button onClick={() => setShowNote('reject')}
            className="p-1 text-slate-600 hover:text-red-400 transition-colors" title="Reject">
            <Ban className="w-3 h-3" />
          </button>
          <button onClick={() => setShowNote('correction')}
            className="p-1 text-slate-600 hover:text-amber-400 transition-colors" title="Needs Correction">
            <MessageSquare className="w-3 h-3" />
          </button>
        </>
      )}
      {showNote === 'reject' && (
        <NoteModal title="Reject Entry" placeholder="Reason for rejection…"
          onConfirm={note => { onAction(entry.id, 'reject', note); setShowNote(null) }}
          onClose={() => setShowNote(null)} />
      )}
      {showNote === 'correction' && (
        <NoteModal title="Needs Correction" placeholder="What needs fixing…"
          onConfirm={note => { onAction(entry.id, 'needsCorrection', note); setShowNote(null) }}
          onClose={() => setShowNote(null)} />
      )}
    </div>
  )
}

// ─── day cell ─────────────────────────────────────────────────────────────────
const DAY_HDRS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function DayCell({ day, canApprove, isLocked, onAction, onEdit, onApproveDay, approving }) {
  const submittedCount = day.entries.filter(e => e.status === 'submitted').length
  if (!day.entries.length) {
    return <div className="py-4 text-center"><span className="text-[9px] text-slate-800">—</span></div>
  }
  return (
    <div className="py-1.5 px-1.5 space-y-1.5">
      {day.entries.map(e => (
        <div key={e.id} className="bg-slate-800/70 rounded-lg px-2 py-1.5">
          <div className="flex items-start justify-between gap-0.5 mb-0.5">
            <span className="font-mono text-[10px] text-brand-400 font-semibold leading-none truncate">{e.job_number}</span>
            <div className="flex items-center gap-0.5 shrink-0">
              <Badge status={e.status} />
              <SageBadge syncStatus={e.sage_sync_status} />
              <EntryActions entry={e} canApprove={canApprove} isLocked={isLocked}
                onAction={onAction} onEdit={onEdit} />
            </div>
          </div>
          <p className="text-[9px] text-slate-600 truncate">{e.cost_code}</p>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[9px] text-slate-700">
              {e.start_time && e.end_time ? `${e.start_time}–${e.end_time}` : ''}
            </span>
            <span className="text-[11px] font-bold text-slate-300">{e.hours}h</span>
          </div>
          {e.notes && <p className="text-[9px] text-slate-700 italic truncate">{e.notes}</p>}
        </div>
      ))}
      <div className="flex items-center justify-between pt-0.5">
        {canApprove && submittedCount > 0 && !isLocked ? (
          <button onClick={() => onApproveDay(day.date)} disabled={approving}
            className="text-[9px] text-emerald-500 hover:text-emerald-400 flex items-center gap-0.5 disabled:opacity-40">
            <CheckSquare className="w-2.5 h-2.5" /> Approve day
          </button>
        ) : <span />}
        {day.total_hours > 0 &&
          <span className="text-[9px] font-bold text-slate-600">{day.total_hours}h</span>}
      </div>
    </div>
  )
}

// ─── employee card ─────────────────────────────────────────────────────────────
function EmployeeCard({ emp, defaultCollapsed, canApprove, isLocked, isAdmin,
                        onAction, onEdit, onApproveDay, onApproveWeek, onSageSync,
                        approving, sageSyncing, forceCollapse }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  // Respond to global expand/collapse commands
  useEffect(() => {
    if (forceCollapse !== null) setCollapsed(forceCollapse)
  }, [forceCollapse])

  const entries = emp.days.flatMap(d => d.entries)
  const submitted  = entries.filter(e => e.status === 'submitted' || e.status === 'needs_correction').length
  const rejected   = entries.filter(e => e.status === 'rejected').length
  const readyForSage = entries.filter(e => e.sage_sync_status === 'ready').length
  const syncedCount  = entries.filter(e => e.sage_sync_status === 'synced').length
  const allApproved  = emp.submitted_hours === 0 && emp.rejected_hours === 0 && emp.approved_hours > 0

  return (
    <div className="card !p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/40 hover:bg-slate-800/60 transition-colors">
        <button onClick={() => setCollapsed(c => !c)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div className="w-7 h-7 rounded-full bg-brand-800 flex items-center justify-center text-xs font-bold text-brand-300 shrink-0">
            {emp.employee_name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-slate-100 text-sm truncate">{emp.employee_name}</p>
              {allApproved && <BadgeCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" title="All approved" />}
            </div>
            <p className="text-[10px] text-slate-600 truncate">{emp.trade || 'Employee'} · #{emp.employee_number}</p>
          </div>
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-sm font-bold text-slate-100 leading-none">{emp.total_hours}h</p>
              <p className="text-[9px] text-slate-700 mt-0.5">this week</p>
            </div>
            <div className="flex flex-col gap-0.5 text-right min-w-[72px]">
              {emp.approved_hours > 0 && <span className="text-[9px] font-semibold text-emerald-400">{emp.approved_hours}h ✓</span>}
              {emp.submitted_hours > 0 && <span className="text-[9px] font-semibold text-amber-400">{emp.submitted_hours}h pend.</span>}
              {emp.rejected_hours  > 0 && <span className="text-[9px] font-semibold text-red-400">{emp.rejected_hours}h rej.</span>}
              {emp.needs_correction_hours > 0 && <span className="text-[9px] font-semibold text-orange-400">{emp.needs_correction_hours}h fix</span>}
              {emp.exported_hours  > 0 && <span className="text-[9px] font-semibold text-purple-400">{emp.exported_hours}h exp.</span>}
              {syncedCount         > 0 && <span className="text-[9px] font-semibold text-brand-400">{syncedCount} synced</span>}
            </div>
          </div>
          {collapsed
            ? <ChevronDown className="w-3.5 h-3.5 text-slate-700 shrink-0" />
            : <ChevronUp   className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
        </button>

        {/* Card-level actions */}
        <div className="flex items-center gap-1.5 shrink-0 no-print">
          {canApprove && submitted > 0 && !isLocked && (
            <button onClick={() => onApproveWeek(emp.employee_id)} disabled={approving}
              className="btn-success text-[10px] py-1 px-2 flex items-center gap-1 disabled:opacity-40"
              title={`Approve ${submitted} pending entries`}>
              <CheckSquare className="w-3 h-3" />{submitted}
            </button>
          )}
          {isAdmin && readyForSage > 0 && (
            <button onClick={() => onSageSync(emp)} disabled={sageSyncing}
              className="text-[10px] py-1 px-2 rounded-lg border border-brand-500/30 text-brand-400 hover:bg-brand-500/10 flex items-center gap-1 disabled:opacity-40"
              title={`Sync ${readyForSage} entries to Sage`}>
              <Send className="w-3 h-3" />{readyForSage}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Desktop 7-col grid */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  {emp.days.map((day, i) => (
                    <th key={day.date} className="border-r border-b border-slate-800/60 last:border-r-0 px-1 py-1 text-center">
                      <p className="text-[10px] font-bold text-slate-500">{DAY_HDRS[i]}</p>
                      <p className="text-[9px] text-slate-700">{fmtDate(day.date)}</p>
                      {day.total_hours > 0 &&
                        <p className="text-[9px] font-bold text-slate-500 mt-0.5">{day.total_hours}h</p>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {emp.days.map(day => (
                    <td key={day.date} className="border-r border-slate-800/60 last:border-r-0 align-top">
                      <DayCell day={day} canApprove={canApprove} isLocked={isLocked}
                        onAction={onAction} onEdit={onEdit}
                        onApproveDay={d => onApproveDay(emp.employee_id, d)}
                        approving={approving} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile stacked */}
          <div className="lg:hidden divide-y divide-slate-800/60">
            {emp.days.map(day => (
              <div key={day.date} className="px-4 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-400">{day.day_name.slice(0,3)}
                    <span className="text-slate-700 font-normal text-[10px] ml-1.5">{fmtDate(day.date)}</span>
                  </span>
                  {day.total_hours > 0 && <span className="text-xs font-bold text-slate-300">{day.total_hours}h</span>}
                </div>
                {day.entries.length === 0
                  ? <p className="text-[10px] text-slate-800 italic">No time logged</p>
                  : day.entries.map(e => (
                    <div key={e.id} className="mb-1 bg-slate-800/60 rounded-lg px-2.5 py-1.5 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-mono text-[10px] text-brand-400 font-semibold">{e.job_number}</span>
                          <Badge status={e.status} />
                          <SageBadge syncStatus={e.sage_sync_status} />
                        </div>
                        <p className="text-[10px] text-slate-600">{e.cost_code}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs font-bold text-slate-200">{e.hours}h</span>
                        <EntryActions entry={e} canApprove={canApprove} isLocked={isLocked}
                          onAction={onAction} onEdit={onEdit} />
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>

          {/* Job summary footer */}
          {emp.hours_by_job.length > 0 && (
            <div className="border-t border-slate-800/60 px-4 py-2 bg-slate-900/20 no-print">
              <div className="flex flex-wrap gap-1.5">
                {emp.hours_by_job.map(j => (
                  <span key={j.job_number} className="text-[9px] bg-slate-800/60 rounded px-2 py-0.5">
                    <span className="font-mono text-brand-500">{j.job_number}</span>
                    <span className="text-slate-600 mx-1">·</span>
                    <span className="font-bold text-slate-400">{j.hours}h</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── sticky filter bar ─────────────────────────────────────────────────────────
function FilterBar({
  weekStart, setWeekStart,
  search, setSearch,
  employees, filterEmp, setFilterEmp,
  jobs, filterJob, setFilterJob,
  filterStatus, setFilterStatus,
  filterSage, setFilterSage,
  activeChip, setActiveChip,
  onlyWithTime, setOnlyWithTime,
  onClearFilters, hasFilters,
  onApproveAll, onLock, onUnlock, onPrint,
  onExpandAll, onCollapseAll,
  lockInfo, isAdmin, canApprove, approving, loading,
  submittedCount,
  shownCount, totalCount, withTimeCount,
}) {
  const prevWeek = () => {
    const d = new Date(weekStart); d.setDate(d.getDate() - 7)
    setWeekStart(d.toISOString().slice(0, 10))
  }
  const nextWeek = () => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7)
    setWeekStart(d.toISOString().slice(0, 10))
  }
  const isCurrentWeek = weekStart === todayMonday()
  const weekEndStr = weekStart ? addDays(weekStart, 6) : ''

  return (
    <div className="sticky top-0 z-30 bg-slate-950/97 backdrop-blur-md border-b border-slate-800 -mx-6 px-6 py-2.5 mb-4 no-print shadow-lg shadow-black/20">

      {/* Row 1: week nav + search + dropdowns + action buttons */}
      <div className="flex flex-wrap gap-2 items-center mb-2">

        {/* Week navigator */}
        <div className="flex items-center gap-0.5 bg-slate-800/80 rounded-lg px-0.5 py-0.5 shrink-0">
          <button onClick={prevWeek} className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1.5 px-2.5">
            <CalendarDays className="w-3 h-3 text-brand-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-200 min-w-[110px] text-center">
              {weekStart ? `${fmtDate(weekStart)} – ${fmtDate(weekEndStr)}` : '…'}
            </span>
          </div>
          <button onClick={nextWeek} className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {!isCurrentWeek && (
          <button onClick={() => setWeekStart(todayMonday())}
            className="text-[10px] text-brand-500 hover:text-brand-400 underline underline-offset-2 shrink-0">
            Today
          </button>
        )}

        {/* Employee search */}
        <div className="relative flex-1 min-w-[130px] max-w-[180px]">
          <Search className="w-3 h-3 text-slate-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className="input !py-1.5 !pl-7 !pr-6 text-xs h-[30px]"
            placeholder="Name, ID, trade…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <select className="input !py-1 text-xs !w-auto max-w-[140px] h-[30px]"
          value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">All Employees</option>
          {employees.filter(e => e.is_active).map(e => (
            <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
          ))}
        </select>

        <select className="input !py-1 text-xs !w-auto max-w-[150px] h-[30px]"
          value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number}</option>)}
        </select>

        {/* Only with time toggle */}
        <button onClick={() => setOnlyWithTime(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors shrink-0 ${
            onlyWithTime
              ? 'border-brand-500/50 bg-brand-500/15 text-brand-300'
              : 'border-slate-700 bg-slate-800/50 text-slate-500 hover:text-slate-300'
          }`}
          title="Only show employees who logged time this week"
        >
          {onlyWithTime ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          With Time
        </button>

        {hasFilters && (
          <button onClick={onClearFilters}
            className="text-[10px] text-slate-600 hover:text-slate-400 flex items-center gap-1 shrink-0">
            <RotateCcw className="w-3 h-3" /> Clear
          </button>
        )}

        {/* Right-side actions */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <button onClick={onCollapseAll} className="text-[10px] text-slate-600 hover:text-slate-300 flex items-center gap-0.5" title="Collapse all">
            <ChevronUp className="w-3 h-3" /> All
          </button>
          <button onClick={onExpandAll} className="text-[10px] text-slate-600 hover:text-slate-300 flex items-center gap-0.5 mr-2" title="Expand all">
            <ChevronDown className="w-3 h-3" /> All
          </button>

          {canApprove && !loading && submittedCount > 0 && !lockInfo.locked && (
            <button onClick={onApproveAll} disabled={approving}
              className="btn-success text-[10px] py-1 px-2.5 flex items-center gap-1 disabled:opacity-40">
              <CheckCircle2 className="w-3 h-3" /> Approve ({submittedCount})
            </button>
          )}
          {isAdmin && !lockInfo.locked && !loading && (
            <button onClick={onLock}
              className="btn-secondary text-[10px] py-1 px-2.5 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Lock
            </button>
          )}
          {isAdmin && lockInfo.locked && (
            <button onClick={onUnlock}
              className="text-[10px] py-1 px-2.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 flex items-center gap-1">
              <Unlock className="w-3 h-3" /> Unlock
            </button>
          )}
          {!loading && (
            <button onClick={onPrint}
              className="btn-secondary text-[10px] py-1 px-2.5 flex items-center gap-1">
              <Printer className="w-3 h-3" /> Print
            </button>
          )}
        </div>
      </div>

      {/* Row 2: quick chips + count feedback */}
      <div className="flex items-center gap-2 flex-wrap">
        {CHIPS.map(chip => (
          <button
            key={chip.key}
            onClick={() => setActiveChip(chip.key)}
            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors ${
              activeChip === chip.key
                ? chip.color + ' opacity-100'
                : 'border-slate-800 bg-slate-900 text-slate-600 hover:text-slate-400'
            }`}
          >
            {chip.label}
          </button>
        ))}

        {/* Count feedback */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="text-[10px] text-slate-600 flex items-center gap-1">
            <Users className="w-3 h-3" />
            {withTimeCount != null && (
              <span className="text-slate-500">{withTimeCount} with time ·</span>
            )}
            <span className={shownCount < totalCount ? 'text-brand-500' : 'text-slate-500'}>
              Showing {shownCount} of {totalCount}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── main page ─────────────────────────────────────────────────────────────────
export default function WeeklyTimecardsPage() {
  const { user } = useAuth()
  const isAdmin    = user?.role === 'admin'
  const canApprove = user?.role === 'admin' || user?.role === 'supervisor'

  const [weekStart, setWeekStart]   = useState(todayMonday)
  const [allEmployees, setAllEmployees] = useState([])
  const [jobs, setJobs]             = useState([])
  const [costCodes, setCostCodes]   = useState([])
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [lockInfo, setLockInfo]     = useState({ locked: false, lock: null })
  const [approving, setApproving]   = useState(false)
  const [sageSyncing, setSageSyncing] = useState(false)
  const [toast, setToast]           = useState(null)
  const [editEntryId, setEditEntryId]   = useState(null)
  const [editEntryData, setEditEntryData] = useState(null)

  // Filter/UX state
  const [search, setSearch]             = useState('')
  const [filterEmp, setFilterEmp]       = useState('')
  const [filterJob, setFilterJob]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSage, setFilterSage]     = useState('')
  const [activeChip, setActiveChip]     = useState('all')
  const [onlyWithTime, setOnlyWithTime] = useState(false)
  const [forceCollapse, setForceCollapse] = useState(null)  // null=no force, true=collapse, false=expand

  const hasFilters = !!(search || filterEmp || filterJob || filterStatus || filterSage || activeChip !== 'all' || onlyWithTime)

  // Load support data once
  useEffect(() => {
    employeesApi.list(false).then(r => setAllEmployees(r.data)).catch(() => {})
    jobsApi.list(false).then(r => setJobs(r.data)).catch(() => {})
    costCodesApi.list().then(r => setCostCodes(r.data)).catch(() => {})
  }, [])

  // Reload timecards when week/backend-filters change
  const load = useCallback(() => {
    setLoading(true)
    const params = { week_start: weekStart }
    if (filterEmp) params.employee_id = filterEmp
    if (filterJob) params.job_id = filterJob
    if (filterStatus) params.status = filterStatus

    Promise.all([
      reportsApi.weeklyTimecards(params),
      payrollLocksApi.check(weekStart),
    ])
      .then(([tc, lk]) => { setData(tc.data); setLockInfo(lk.data) })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [weekStart, filterEmp, filterJob, filterStatus])

  useEffect(() => { load() }, [load])

  const showToast = (msg, type = 'success') => setToast({ msg, type })

  // ── Client-side filtering ──────────────────────────────────────────────────
  const allFromBackend = data?.employees || []

  const filteredEmployees = allFromBackend.filter(emp => {
    // only with time toggle
    if (onlyWithTime && emp.total_hours === 0) return false
    // text search
    if (search) {
      const q = search.toLowerCase()
      if (
        !emp.employee_name.toLowerCase().includes(q) &&
        !emp.employee_number?.toLowerCase().includes(q) &&
        !(emp.trade || '').toLowerCase().includes(q)
      ) return false
    }
    // sage filter dropdown
    if (filterSage) {
      const entries = emp.days.flatMap(d => d.entries)
      if (!entries.some(e => e.sage_sync_status === filterSage)) return false
    }
    // quick chip
    if (!employeeMatchesChip(emp, activeChip)) return false
    return true
  })

  // Auto-collapse logic: default collapse if > 10 shown
  const defaultCollapsed = filteredEmployees.length > 10

  const allEntries = filteredEmployees.flatMap(e => e.days.flatMap(d => d.entries))
  const submittedCount  = allEntries.filter(e => e.status === 'submitted' || e.status === 'needs_correction').length
  const approvedCount   = allEntries.filter(e => e.status === 'approved').length
  const readyForSageCount = allEntries.filter(e => e.sage_sync_status === 'ready').length
  const syncedCount     = allEntries.filter(e => e.sage_sync_status === 'synced').length

  const summary = data?.summary
  const withTimeCount = summary?.employees_with_time
  const totalCount    = summary?.total_employee_count ?? allFromBackend.length

  const weekLabel = data ? `${fmtDate(data.week_start)} – ${fmtDate(data.week_end)}` : weekStart

  // ── Approval actions ────────────────────────────────────────────────────────
  const handleAction = async (entryId, action, note) => {
    try {
      await timeEntriesApi[action](entryId, note ? { notes: note } : {})
      showToast(action === 'approve' ? 'Entry approved' : action === 'reject' ? 'Entry rejected' : 'Flagged for correction')
      load()
    } catch (e) {
      showToast(e.response?.data?.detail || `Error: ${action}`, 'error')
    }
  }

  const handleApproveDay = async (empId, dayDate) => {
    setApproving(true)
    try {
      const r = await approvalsApi.approveWeek({ week_start: weekStart, employee_id: empId, day_date: dayDate })
      showToast(`Approved ${r.data.count} entr${r.data.count === 1 ? 'y' : 'ies'}`)
      load()
    } catch (e) { showToast(e.response?.data?.detail || 'Error', 'error') }
    finally { setApproving(false) }
  }

  const handleApproveWeek = async (empId) => {
    setApproving(true)
    try {
      const r = await approvalsApi.approveWeek({ week_start: weekStart, employee_id: empId })
      showToast(`Approved ${r.data.count} entr${r.data.count === 1 ? 'y' : 'ies'}`)
      load()
    } catch (e) { showToast(e.response?.data?.detail || 'Error', 'error') }
    finally { setApproving(false) }
  }

  const handleApproveAll = async () => {
    // Collect IDs of ONLY the currently visible submitted/needs_correction entries
    const visibleSubmittedIds = filteredEmployees
      .flatMap(emp => emp.days.flatMap(d => d.entries))
      .filter(e => e.status === 'submitted' || e.status === 'needs_correction')
      .map(e => e.id)
    if (!visibleSubmittedIds.length) return
    if (!confirm(`Approve ${visibleSubmittedIds.length} visible pending entries? (Only shown entries will be approved)`)) return
    setApproving(true)
    try {
      const r = await approvalsApi.bulkApproveIds({ entry_ids: visibleSubmittedIds })
      showToast(`Approved ${r.data.count} entries`)
      load()
    } catch (e) { showToast(e.response?.data?.detail || 'Error', 'error') }
    finally { setApproving(false) }
  }

  // ── Payroll lock ────────────────────────────────────────────────────────────
  const handleLock = async () => {
    const notes = prompt(`Lock payroll for week of ${weekStart}?\nOptional note:`)
    if (notes === null) return
    try {
      await payrollLocksApi.lock({ week_start: weekStart, notes: notes || undefined })
      showToast('Week locked')
      load()
    } catch (e) {
      const detail = e.response?.data?.detail || 'Error locking'
      // 409 = pending entries exist — offer force lock
      if (e.response?.status === 409) {
        const forceLock = confirm(
          detail + '\n\nForce lock anyway?\n(Pending entries will still be editable by admin after locking)'
        )
        if (forceLock) {
          try {
            await payrollLocksApi.lock({ week_start: weekStart, notes: notes || undefined, force: true })
            showToast('Week force-locked (pending entries remain)')
            load()
          } catch (e2) {
            showToast(e2.response?.data?.detail || 'Force lock failed', 'error')
          }
        }
      } else {
        showToast(detail, 'error')
      }
    }
  }

  const handleUnlock = async () => {
    if (!confirm(`Unlock payroll for ${weekStart}?`)) return
    try {
      await payrollLocksApi.unlock({ week_start: weekStart })
      showToast('Week unlocked')
      load()
    } catch (e) { showToast(e.response?.data?.detail || 'Error unlocking', 'error') }
  }

  // ── Sage sync ───────────────────────────────────────────────────────────────
  const handleSageSync = async (emp) => {
    const readyIds = emp.days.flatMap(d => d.entries)
      .filter(e => e.sage_sync_status === 'ready').map(e => e.id)
    if (!readyIds.length) return
    setSageSyncing(true)
    try {
      const r = await sageApi.sync({ entry_ids: readyIds })
      showToast(`Synced ${r.data.synced_count}${r.data.failed_count ? `, ${r.data.failed_count} failed` : ''} entries`)
      load()
    } catch (e) { showToast(e.response?.data?.detail || 'Sage sync error', 'error') }
    finally { setSageSyncing(false) }
  }

  const handleSagePrepareAll = async () => {
    try {
      const r = await sageApi.prepare({ week_start: weekStart })
      showToast(`${r.data.marked_ready} entries marked ready for Sage`)
      load()
    } catch (e) { showToast(e.response?.data?.detail || 'Error', 'error') }
  }

  // ── Edit modal ──────────────────────────────────────────────────────────────
  const handleEdit = async (entryId) => {
    try {
      const r = await timeEntriesApi.get(entryId)
      setEditEntryData(r.data)
      setEditEntryId(entryId)
    } catch { showToast('Could not load entry', 'error') }
  }

  const handleSaveEdit = async (id, updated) => {
    await timeEntriesApi.update(id, updated)
    load()
  }

  // ── Print ───────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const el = document.getElementById('print-area')
    if (el) { el.style.display = 'block'; window.print(); el.style.display = 'none' }
  }

  const clearFilters = () => {
    setSearch(''); setFilterEmp(''); setFilterJob('')
    setFilterStatus(''); setFilterSage(''); setActiveChip('all'); setOnlyWithTime(false)
  }

  return (
    <div>
      <PageHeader title="Weekly Timecards" subtitle="Payroll review, approval, lock, and Sage sync" />

      {/* ── Sticky Filter Bar ── */}
      <FilterBar
        weekStart={weekStart} setWeekStart={setWeekStart}
        search={search} setSearch={setSearch}
        employees={allEmployees} filterEmp={filterEmp} setFilterEmp={setFilterEmp}
        jobs={jobs} filterJob={filterJob} setFilterJob={setFilterJob}
        filterStatus={filterStatus} setFilterStatus={setFilterStatus}
        filterSage={filterSage} setFilterSage={setFilterSage}
        activeChip={activeChip} setActiveChip={setActiveChip}
        onlyWithTime={onlyWithTime} setOnlyWithTime={setOnlyWithTime}
        onClearFilters={clearFilters} hasFilters={hasFilters}
        onApproveAll={handleApproveAll}
        onLock={handleLock} onUnlock={handleUnlock} onPrint={handlePrint}
        onExpandAll={() => setForceCollapse(false)}
        onCollapseAll={() => setForceCollapse(true)}
        lockInfo={lockInfo} isAdmin={isAdmin} canApprove={canApprove}
        approving={approving} loading={loading}
        submittedCount={submittedCount}
        shownCount={filteredEmployees.length}
        totalCount={totalCount}
        withTimeCount={withTimeCount}
      />

      {/* ── Lock banner ── */}
      {lockInfo.locked && (
        <div className="mb-3 flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 no-print">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">Payroll Locked</p>
            <p className="text-xs text-amber-600 truncate">
              By {lockInfo.lock?.locked_by}
              {lockInfo.lock?.locked_at ? ` · ${format(new Date(lockInfo.lock.locked_at), 'MMM d h:mm a')}` : ''}
              {lockInfo.lock?.notes ? ` · "${lockInfo.lock.notes}"` : ''}
            </p>
          </div>
          {isAdmin && <span className="text-[10px] text-amber-700 shrink-0">Admin edits still allowed</span>}
        </div>
      )}

      {/* ── Summary stat row ── */}
      {!loading && summary && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          {[
            { label: 'Total',       val: (summary.total_hours || 0) + 'h',     col: 'text-slate-100' },
            { label: 'Approved',    val: (summary.approved_hours || 0) + 'h',  col: 'text-emerald-400' },
            { label: 'Pending',     val: (summary.submitted_hours || 0) + 'h', col: 'text-amber-400' },
            { label: 'Sage Ready',  val: readyForSageCount + ' entries',       col: 'text-brand-400' },
            { label: 'Synced',      val: syncedCount + ' entries',             col: 'text-brand-300' },
            { label: 'Approved →',  val: approvedCount + ' entries',           col: 'text-emerald-500' },
          ].map(s => (
            <div key={s.label} className="card !py-2 !px-3">
              <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">{s.label}</p>
              <p className={`text-sm font-bold ${s.col}`}>{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Job summary + Sage prep ── */}
      {!loading && summary?.hours_by_job?.length > 0 && (
        <div className="card mb-4 !py-2 no-print">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Hours by Job This Week</p>
            {isAdmin && readyForSageCount === 0 && approvedCount > 0 && (
              <button onClick={handleSagePrepareAll}
                className="text-[10px] text-brand-500 hover:text-brand-400 flex items-center gap-1 underline underline-offset-2">
                <RefreshCw className="w-3 h-3" /> Prepare for Sage
              </button>
            )}
            {isAdmin && readyForSageCount > 0 && (
              <span className="text-[10px] text-brand-500">{readyForSageCount} ready — use ⚡ buttons below</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {summary.hours_by_job.map(j => (
              <span key={j.job_number} className="flex items-center gap-1.5 bg-slate-800/60 rounded px-2.5 py-1 text-[10px]">
                <span className="font-mono text-brand-500 font-semibold">{j.job_number}</span>
                <span className="text-slate-600 max-w-[80px] truncate">{j.job_name}</span>
                <span className="font-bold text-slate-300">{j.hours}h</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Employee cards ── */}
      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : filteredEmployees.length === 0 ? (
        <EmptyState icon={Users} title="No employees match"
          description={hasFilters
            ? "Try adjusting the filters or clearing them."
            : "No time entries found for this week."} />
      ) : (
        <div className="space-y-2">
          {filteredEmployees.map(emp => (
            <EmployeeCard key={emp.employee_id} emp={emp}
              defaultCollapsed={defaultCollapsed}
              canApprove={canApprove}
              isLocked={lockInfo.locked && !isAdmin}
              isAdmin={isAdmin}
              onAction={handleAction} onEdit={handleEdit}
              onApproveDay={handleApproveDay} onApproveWeek={handleApproveWeek}
              onSageSync={handleSageSync}
              approving={approving} sageSyncing={sageSyncing}
              forceCollapse={forceCollapse}
            />
          ))}
        </div>
      )}

      {/* ── Print area (hidden) ── */}
      {data && <PrintArea employees={filteredEmployees} weekLabel={weekLabel} />}

      {/* ── Edit modal ── */}
      {editEntryId && editEntryData && (
        <TimeEntryEditModal
          entry={editEntryData} jobs={jobs} costCodes={costCodes}
          onSave={handleSaveEdit}
          onClose={() => { setEditEntryId(null); setEditEntryData(null) }}
          isLocked={lockInfo.locked} userRole={user?.role} />
      )}

      {/* ── Toast ── */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
