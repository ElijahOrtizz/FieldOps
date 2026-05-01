import { useEffect, useState, useCallback } from 'react'
import { scheduleApi, employeesApi, jobsApi } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { PageHeader, LoadingSpinner, EmptyState, Modal } from '../components/common'
import {
  CalendarRange, ChevronLeft, ChevronRight, UserPlus, Pencil, Trash2,
  ArrowLeftRight, AlertCircle, Users, Clock, MapPin, Printer,
  Search, X, RotateCcw, CheckSquare2, ClipboardList
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

// ─── helpers ──────────────────────────────────────────────────────────────────
function toMonday(d) {
  const dt = new Date(d)
  const day = dt.getDay()
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day))
  return dt.toISOString().slice(0, 10)
}
function todayMonday() { return toMonday(new Date().toISOString().slice(0, 10)) }
function addDays(s, n) { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
function fmtDate(str) { try { return format(parseISO(str), 'MMM d') } catch { return str } }

const ISSUE_LABELS = {
  missing_timecard: { label: 'Missing Timecard', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  unscheduled_work: { label: 'Unscheduled Work', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  wrong_job:        { label: 'Wrong Job',         color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  over_planned:     { label: 'Over Planned',      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  under_planned:    { label: 'Under Planned',     color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
  overtime_risk:    { label: 'OT Risk',           color: 'text-red-400 bg-red-500/10 border-red-500/20' },
}

const STATUS_CFG = {
  scheduled: { cls: 'bg-brand-500/15 text-brand-400 border-brand-500/20', label: 'Scheduled' },
  changed:   { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20', label: 'Changed'   },
  completed: { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', label: 'Done' },
  missed:    { cls: 'bg-red-500/15 text-red-400 border-red-500/20',       label: 'Missed'    },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.scheduled
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${cfg.cls}`}>{cfg.label}</span>
}

// ─── toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t) }, [onDone])
  return (
    <div className={`fixed bottom-6 right-6 z-[60] ${type === 'error' ? 'bg-red-600' : 'bg-emerald-600'} text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-2xl max-w-xs`}>
      {msg}
    </div>
  )
}

// ─── assign modal ─────────────────────────────────────────────────────────────
function AssignModal({ date, employees, jobs, onSave, onClose, editAssignment }) {
  const isEdit = !!editAssignment
  const [form, setForm] = useState({
    employee_ids: editAssignment ? [editAssignment.employee_id] : [],
    job_id: editAssignment?.job_id || '',
    date: editAssignment?.date || date || '',
    planned_start_time: editAssignment?.planned_start_time || '07:00',
    planned_end_time: editAssignment?.planned_end_time || '15:30',
    planned_hours: editAssignment?.planned_hours || 8,
    supervisor_id: editAssignment?.supervisor_id || '',
    role: editAssignment?.role || '',
    notes: editAssignment?.notes || '',
    status: editAssignment?.status || 'scheduled',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [empSearch, setEmpSearch] = useState('')

  // Auto-calc hours
  useEffect(() => {
    if (form.planned_start_time && form.planned_end_time) {
      try {
        const [sh, sm] = form.planned_start_time.split(':').map(Number)
        const [eh, em] = form.planned_end_time.split(':').map(Number)
        const mins = (eh * 60 + em) - (sh * 60 + sm)
        if (mins > 0) setForm(f => ({ ...f, planned_hours: +(mins / 60).toFixed(2) }))
      } catch {}
    }
  }, [form.planned_start_time, form.planned_end_time])

  const supervisors = employees.filter(e => e.is_active)

  const toggleEmp = (id) => {
    if (isEdit) return  // single employee in edit mode
    setForm(f => ({
      ...f,
      employee_ids: f.employee_ids.includes(id)
        ? f.employee_ids.filter(x => x !== id)
        : [...f.employee_ids, id]
    }))
  }

  const filteredEmps = employees.filter(e => e.is_active && (
    !empSearch ||
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(empSearch.toLowerCase()) ||
    e.trade?.toLowerCase().includes(empSearch.toLowerCase()) ||
    e.employee_number?.toLowerCase().includes(empSearch.toLowerCase())
  ))

  const handleSave = async () => {
    setError('')
    if (!form.job_id) { setError('Job is required'); return }
    if (!form.date) { setError('Date is required'); return }
    if (!isEdit && form.employee_ids.length === 0) { setError('Select at least one employee'); return }
    if (!form.planned_start_time || !form.planned_end_time) { setError('Start and end time required'); return }
    if (Number(form.planned_hours) <= 0) { setError('Planned hours must be positive'); return }

    setLoading(true)
    try {
      if (isEdit) {
        await onSave('edit', editAssignment.id, {
          job_id: Number(form.job_id),
          date: form.date,
          planned_start_time: form.planned_start_time,
          planned_end_time: form.planned_end_time,
          planned_hours: Number(form.planned_hours),
          supervisor_id: form.supervisor_id ? Number(form.supervisor_id) : null,
          role: form.role || null,
          notes: form.notes || null,
          status: form.status,
        })
      } else if (form.employee_ids.length === 1) {
        await onSave('single', null, {
          employee_id: form.employee_ids[0],
          job_id: Number(form.job_id),
          date: form.date,
          planned_start_time: form.planned_start_time,
          planned_end_time: form.planned_end_time,
          planned_hours: Number(form.planned_hours),
          supervisor_id: form.supervisor_id ? Number(form.supervisor_id) : null,
          role: form.role || null,
          notes: form.notes || null,
        })
      } else {
        await onSave('bulk', null, {
          employee_ids: form.employee_ids,
          job_id: Number(form.job_id),
          date: form.date,
          planned_start_time: form.planned_start_time,
          planned_end_time: form.planned_end_time,
          planned_hours: Number(form.planned_hours),
          supervisor_id: form.supervisor_id ? Number(form.supervisor_id) : null,
          role: form.role || null,
          notes: form.notes || null,
        })
      }
      onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Error saving')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="font-semibold text-slate-100">{isEdit ? 'Edit Assignment' : 'Assign Crew'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Date + Job */}
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">Date *</label>
              <input type="date" className="input" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Job *</label>
              <select className="input" value={form.job_id}
                onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}>
                <option value="">Select job…</option>
                {jobs.filter(j => j.status === 'active').map(j => (
                  <option key={j.id} value={j.id}>{j.job_number} — {j.job_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Times + Hours */}
          <div className="grid grid-cols-3 gap-3">
            <div className="form-group">
              <label className="label">Start *</label>
              <input type="time" className="input" value={form.planned_start_time}
                onChange={e => setForm(f => ({ ...f, planned_start_time: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">End *</label>
              <input type="time" className="input" value={form.planned_end_time}
                onChange={e => setForm(f => ({ ...f, planned_end_time: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Hours</label>
              <input type="number" className="input" step="0.25" min="0.25" value={form.planned_hours}
                onChange={e => setForm(f => ({ ...f, planned_hours: e.target.value }))} />
            </div>
          </div>

          {/* Supervisor + Role */}
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">Supervisor</label>
              <select className="input" value={form.supervisor_id}
                onChange={e => setForm(f => ({ ...f, supervisor_id: e.target.value }))}>
                <option value="">None</option>
                {supervisors.map(e => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Role / Trade</label>
              <input className="input" value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                placeholder="e.g. Carpenter" />
            </div>
          </div>

          {/* Employee selection (only for new assignments) */}
          {!isEdit && (
            <div className="form-group">
              <label className="label">Employees * {form.employee_ids.length > 0 && <span className="text-brand-400 ml-1">({form.employee_ids.length} selected)</span>}</label>
              <div className="relative mb-2">
                <Search className="w-3 h-3 text-slate-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input className="input !pl-7 text-xs" placeholder="Search name, trade…"
                  value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-800 rounded-lg p-2 bg-slate-900/50">
                {filteredEmps.length === 0 && <p className="text-xs text-slate-600 text-center py-2">No employees match</p>}
                {filteredEmps.map(e => {
                  const selected = form.employee_ids.includes(e.id)
                  return (
                    <button key={e.id} onClick={() => toggleEmp(e.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${selected ? 'bg-brand-600/20 border border-brand-500/30' : 'hover:bg-slate-800'}`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected ? 'bg-brand-600 border-brand-500' : 'border-slate-600'}`}>
                        {selected && <span className="text-[10px] text-white font-bold">✓</span>}
                      </div>
                      <span className="text-xs text-slate-300 flex-1">{e.first_name} {e.last_name}</span>
                      <span className="text-[10px] text-slate-600">{e.trade || ''}</span>
                    </button>
                  )
                })}
              </div>
              {form.employee_ids.length > 1 && (
                <p className="text-[10px] text-brand-400 mt-1">Will bulk-assign all {form.employee_ids.length} employees to this job/day</p>
              )}
            </div>
          )}

          {/* Status (edit only) */}
          {isEdit && (
            <div className="form-group">
              <label className="label">Status</label>
              <select className="input" value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="scheduled">Scheduled</option>
                <option value="changed">Changed</option>
                <option value="completed">Completed</option>
                <option value="missed">Missed</option>
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="form-group">
            <label className="label">Notes</label>
            <textarea className="input min-h-[56px]" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional instructions…" />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-800 flex gap-3 shrink-0">
          <button onClick={handleSave} disabled={loading} className="btn-primary">
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : form.employee_ids.length > 1 ? `Assign ${form.employee_ids.length} Employees` : 'Assign'}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── print CSS ────────────────────────────────────────────────────────────────
const PRINT_CSS = `@media print {
  body * { visibility: hidden; }
  #sched-print, #sched-print * { visibility: visible; }
  #sched-print { position: fixed; top: 0; left: 0; width: 100%; background: white; color: black; padding: 20px; font-family: sans-serif; }
  .no-print { display: none !important; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; }
  th { background: #f0f0f0; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  h2 { font-size: 12px; margin: 12px 0 4px; }
  .sig-line { margin-top: 24px; border-top: 1px solid #ccc; padding-top: 4px; font-size: 10px; color: #666; }
}`
if (!document.getElementById('sched-print-css')) {
  const s = document.createElement('style'); s.id = 'sched-print-css'
  s.textContent = PRINT_CSS; document.head.appendChild(s)
}

function PrintArea({ days, weekLabel, printDay }) {
  const toPrint = printDay ? days.filter(d => d.date === printDay) : days
  return (
    <div id="sched-print" style={{ display: 'none' }}>
      <h1>FieldOps — Crew Schedule &nbsp;·&nbsp; {weekLabel}</h1>
      <p style={{ fontSize: 10, color: '#777', marginBottom: 12 }}>Printed: {format(new Date(), 'MMM d, yyyy h:mm a')}</p>
      {toPrint.map(day => (
        <div key={day.date}>
          <h2>{day.day_name} — {fmtDate(day.date)} &nbsp;·&nbsp; {day.total_planned_hours}h planned</h2>
          {day.jobs.length === 0 ? (
            <p style={{ fontSize: 10, color: '#999', fontStyle: 'italic' }}>No assignments</p>
          ) : day.jobs.map(job => (
            <div key={job.job_id} style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>
                {job.job_number} — {job.job_name} {job.job_address ? `(${job.job_address})` : ''}
              </p>
              <table>
                <thead>
                  <tr><th>Employee</th><th>Role</th><th>Start</th><th>End</th><th>Hours</th><th>Notes</th><th>Check-in ✓</th></tr>
                </thead>
                <tbody>
                  {job.assignments.map(a => (
                    <tr key={a.id}>
                      <td>{a.employee_name}</td>
                      <td>{a.role || ''}</td>
                      <td>{a.planned_start_time || ''}</td>
                      <td>{a.planned_end_time || ''}</td>
                      <td>{a.planned_hours || ''}</td>
                      <td>{a.notes || ''}</td>
                      <td style={{ minWidth: 60 }}></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {job.assignments[0]?.supervisor_name && (
                <p style={{ fontSize: 10, marginTop: 4, color: '#555' }}>Supervisor: {job.assignments[0].supervisor_name}</p>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 60, marginTop: 16 }}>
            <div className="sig-line" style={{ flex: 1, borderTop: '1px solid #ccc', paddingTop: 4, fontSize: 10, color: '#666' }}>
              Supervisor Signature ___________________________ &nbsp; Date ___________
            </div>
          </div>
          <div style={{ pageBreakAfter: 'always' }} />
        </div>
      ))}
    </div>
  )
}

// ─── variance tab ─────────────────────────────────────────────────────────────
function VarianceTab({ weekStart, employees, jobs }) {
  const [variance, setVariance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterEmp, setFilterEmp] = useState('')
  const [filterJob, setFilterJob] = useState('')
  const [filterSupervisor, setFilterSupervisor] = useState('')
  const [filterTrade, setFilterTrade] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const params = { week_start: weekStart }
    if (filterEmp) params.employee_id = filterEmp
    if (filterJob) params.job_id = filterJob
    scheduleApi.variance(params)
      .then(r => setVariance(r.data))
      .catch(() => setVariance(null))
      .finally(() => setLoading(false))
  }, [weekStart, filterEmp, filterJob])

  useEffect(() => { load() }, [load])

  const issueCount = variance?.issue_count ?? 0

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <select className="input !w-auto text-sm" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">All Employees</option>
          {employees.filter(e => e.is_active).map(e => (
            <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
          ))}
        </select>
        <select className="input !w-auto text-sm" value={filterJob} onChange={e => setFilterJob(e.target.value)}>
          <option value="">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number}</option>)}
        </select>
        {issueCount > 0 && (
          <span className="text-xs text-amber-400 flex items-center gap-1.5 ml-auto">
            <AlertCircle className="w-3.5 h-3.5" /> {issueCount} issue{issueCount !== 1 ? 's' : ''} found
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : !variance || issueCount === 0 ? (
        <EmptyState icon={CheckSquare2} title="No variance issues"
          description="All scheduled employees have matching timecards for this week." />
      ) : (
        <div className="space-y-3">
          {variance.issues.map((issue, i) => (
            <div key={i} className="card !p-0 overflow-hidden">
              <div className="px-4 py-3 bg-slate-800/40 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-slate-100 text-sm">{issue.employee_name}</span>
                    <span className="text-[10px] text-slate-500">#{issue.employee_number}</span>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-xs text-slate-400">{issue.day_name} {fmtDate(issue.date)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {issue.issue_types.map(type => {
                      const cfg = ISSUE_LABELS[type] || { label: type, color: 'text-slate-400 bg-slate-800 border-slate-700' }
                      return (
                        <span key={type} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-[9px] text-slate-600 uppercase">Sched.</p>
                      <p className="text-sm font-bold text-slate-300">{issue.scheduled_hours}h</p>
                    </div>
                    <ArrowLeftRight className="w-3 h-3 text-slate-700" />
                    <div className="text-center">
                      <p className="text-[9px] text-slate-600 uppercase">Actual</p>
                      <p className={`text-sm font-bold ${issue.actual_hours > issue.scheduled_hours ? 'text-amber-400' : issue.actual_hours === 0 ? 'text-red-400' : 'text-slate-300'}`}>
                        {issue.actual_hours}h
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-slate-600 uppercase">Δ</p>
                      <p className={`text-sm font-bold ${issue.variance_hours > 0 ? 'text-amber-400' : issue.variance_hours < 0 ? 'text-slate-500' : 'text-slate-400'}`}>
                        {issue.variance_hours > 0 ? '+' : ''}{issue.variance_hours}h
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Scheduled vs Actual job detail */}
              <div className="px-4 py-2.5 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-[9px] text-slate-600 uppercase font-bold mb-1">Scheduled</p>
                  {issue.scheduled_jobs.length === 0
                    ? <p className="text-slate-700 italic">Not scheduled</p>
                    : issue.scheduled_jobs.map((j, k) => (
                      <p key={k} className="text-slate-400">
                        <span className="font-mono text-brand-500">{j.job_number}</span> {j.job_name}
                        <span className="text-slate-600 ml-1">({j.hours}h)</span>
                      </p>
                    ))}
                </div>
                <div>
                  <p className="text-[9px] text-slate-600 uppercase font-bold mb-1">Actual Timecard</p>
                  {issue.actual_jobs.length === 0
                    ? <p className="text-red-400 italic">No timecard</p>
                    : issue.actual_jobs.map((j, k) => (
                      <p key={k} className="text-slate-400">
                        <span className="font-mono text-brand-500">{j.job_number}</span> {j.job_name}
                        <span className="text-slate-600 ml-1">({j.hours}h · {j.status})</span>
                      </p>
                    ))}
                </div>
              </div>
              {(issue.weekly_scheduled_hours >= 34 || issue.weekly_actual_hours >= 34) && (
                <div className="px-4 py-2 bg-red-500/5 border-t border-red-500/10 text-xs text-red-400">
                  ⚠ Weekly: {issue.weekly_scheduled_hours}h scheduled / {issue.weekly_actual_hours}h actual — approaching OT threshold
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── day column ───────────────────────────────────────────────────────────────
function DayColumn({ day, onAssign, onEdit, onRemove, canManage, onPrintDay }) {
  return (
    <div className="min-w-[180px] flex-1">
      {/* Day header */}
      <div className="px-2 py-2 bg-slate-800/60 rounded-t-lg border-b border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-300">{day.day_name.slice(0, 3)}</p>
          <p className="text-[10px] text-slate-600">{fmtDate(day.date)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {day.total_planned_hours > 0 &&
            <span className="text-[10px] font-bold text-slate-400">{day.total_planned_hours}h</span>}
          {canManage && (
            <button onClick={() => onAssign(day.date)}
              className="p-1 text-slate-600 hover:text-brand-400 transition-colors" title="Add assignment">
              <UserPlus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Job cards */}
      <div className="space-y-2 pt-2 min-h-[100px]">
        {day.jobs.length === 0 && (
          <p className="text-[9px] text-slate-800 text-center py-4 italic">No assignments</p>
        )}
        {day.jobs.map(job => (
          <div key={job.job_id} className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-800">
            <div className="px-2 py-1.5 bg-slate-800/80">
              <p className="font-mono text-[10px] text-brand-400 font-semibold leading-none">{job.job_number}</p>
              <p className="text-[10px] text-slate-400 truncate">{job.job_name}</p>
              {job.job_address && (
                <p className="text-[9px] text-slate-700 flex items-center gap-0.5 mt-0.5">
                  <MapPin className="w-2.5 h-2.5" />{job.job_address}
                </p>
              )}
              <p className="text-[9px] font-bold text-slate-500 mt-0.5">{job.total_planned_hours}h · {job.assignments.length} crew</p>
            </div>
            {/* Assigned employees */}
            <div className="divide-y divide-slate-800/60">
              {job.assignments.map(a => (
                <div key={a.id} className="px-2 py-1 flex items-center gap-1.5 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-300 truncate font-medium">{a.employee_name}</p>
                    <div className="flex items-center gap-1.5">
                      {a.role && <span className="text-[9px] text-slate-600">{a.role}</span>}
                      {a.planned_start_time && (
                        <span className="text-[9px] text-slate-700">{a.planned_start_time}–{a.planned_end_time}</span>
                      )}
                      <span className="text-[9px] font-bold text-slate-500">{a.planned_hours}h</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 no-print">
                    <StatusBadge status={a.status} />
                    {canManage && (
                      <>
                        <button onClick={() => onEdit(a)} className="p-0.5 text-slate-600 hover:text-brand-400"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => onRemove(a.id)} className="p-0.5 text-slate-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function CrewSchedulePage() {
  const { user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'supervisor'

  const [weekStart, setWeekStart] = useState(todayMonday)
  const [tab, setTab] = useState('schedule')  // 'schedule' | 'variance'
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState([])
  const [jobs, setJobs] = useState([])
  const [toast, setToast] = useState(null)
  const [assignDay, setAssignDay] = useState(null)
  const [editAssignment, setEditAssignment] = useState(null)
  const [printDay, setPrintDay] = useState(null)

  // Filters
  const [search, setSearch] = useState('')
  const [filterJob, setFilterJob] = useState('')
  const [filterSupervisor, setFilterSupervisor] = useState('')
  const [filterTrade, setFilterTrade] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    employeesApi.list(false).then(r => setEmployees(r.data)).catch(() => {})
    jobsApi.list(false).then(r => setJobs(r.data)).catch(() => {})
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const params = { week_start: weekStart }
    if (filterJob) params.job_id = filterJob
    scheduleApi.weekly(params)
      .then(r => setSchedule(r.data))
      .catch(() => setSchedule(null))
      .finally(() => setLoading(false))
  }, [weekStart, filterJob])

  useEffect(() => { load() }, [load])

  const showToast = (msg, type = 'success') => setToast({ msg, type })

  const prevWeek = () => setWeekStart(ws => addDays(ws, -7))
  const nextWeek = () => setWeekStart(ws => addDays(ws, 7))
  const isCurrentWeek = weekStart === todayMonday()
  const weekLabel = schedule ? `${fmtDate(schedule.week_start)} – ${fmtDate(schedule.week_end)}` : weekStart

  const handleSave = async (mode, id, data) => {
    if (mode === 'edit') {
      await scheduleApi.update(id, data)
      showToast('Assignment updated')
    } else if (mode === 'bulk') {
      const r = await scheduleApi.bulkAssign(data)
      showToast(`Assigned ${r.data.count} employees`)
    } else {
      await scheduleApi.assign(data)
      showToast('Assignment created')
    }
    load()
  }

  const handleRemove = async (id) => {
    if (!confirm('Remove this assignment?')) return
    try {
      await scheduleApi.remove(id)
      showToast('Assignment removed')
      load()
    } catch (e) { showToast(e.response?.data?.detail || 'Error', 'error') }
  }

  const handlePrint = (dayDate) => {
    setPrintDay(dayDate || null)
    setTimeout(() => {
      const el = document.getElementById('sched-print')
      if (el) { el.style.display = 'block'; window.print(); el.style.display = 'none' }
      setPrintDay(null)
    }, 100)
  }

  // Client-side search filter on employee names within assignments
  const filteredDays = (schedule?.days || []).map(day => ({
    ...day,
    jobs: day.jobs.map(job => ({
      ...job,
      assignments: job.assignments.filter(a => {
        if (search) {
          const q = search.toLowerCase()
          if (!a.employee_name.toLowerCase().includes(q) &&
              !(a.role || '').toLowerCase().includes(q) &&
              !(a.employee_number || '').toLowerCase().includes(q)) return false
        }
        if (filterStatus && a.status !== filterStatus) return false
        if (filterSupervisor && String(a.supervisor_id) !== String(filterSupervisor)) return false
        if (filterTrade) {
          const t = filterTrade.toLowerCase()
          if (!(a.role || '').toLowerCase().includes(t) && !(a.trade || '').toLowerCase().includes(t)) return false
        }
        return true
      })
    })).filter(job => !search || job.assignments.length > 0),
  }))

  const totalPlanned = schedule?.total_planned_hours || 0

  return (
    <div>
      <PageHeader title="Crew Schedule" subtitle="Plan weekly crew assignments and compare against timecards" />

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-30 bg-slate-950/97 backdrop-blur-md border-b border-slate-800 -mx-6 px-6 py-2.5 mb-4 no-print shadow-lg shadow-black/20">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Week nav */}
          <div className="flex items-center gap-0.5 bg-slate-800/80 rounded-lg px-0.5 py-0.5 shrink-0">
            <button onClick={prevWeek} className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1.5 px-2.5">
              <CalendarRange className="w-3 h-3 text-brand-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-200 min-w-[110px] text-center">{weekLabel}</span>
            </div>
            <button onClick={nextWeek} className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {!isCurrentWeek && (
            <button onClick={() => setWeekStart(todayMonday())}
              className="text-[10px] text-brand-500 hover:text-brand-400 underline underline-offset-2">Today</button>
          )}

          {/* Tabs */}
          <div className="flex bg-slate-800/60 rounded-lg p-0.5 gap-0.5 shrink-0">
            <button onClick={() => setTab('schedule')}
              className={`text-xs px-3 py-1 rounded-md transition-colors ${tab === 'schedule' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}>
              <span className="flex items-center gap-1.5"><ClipboardList className="w-3 h-3" />Schedule</span>
            </button>
            <button onClick={() => setTab('variance')}
              className={`text-xs px-3 py-1 rounded-md transition-colors ${tab === 'variance' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}>
              <span className="flex items-center gap-1.5"><ArrowLeftRight className="w-3 h-3" />Variance</span>
            </button>
          </div>

          {/* Search */}
          {tab === 'schedule' && (
            <div className="relative flex-1 min-w-[130px] max-w-[180px]">
              <Search className="w-3 h-3 text-slate-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input className="input !py-1.5 !pl-7 !pr-6 text-xs h-[30px]" placeholder="Search employee…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300"><X className="w-3 h-3" /></button>}
            </div>
          )}

          {tab === 'schedule' && (
            <select className="input !py-1 text-xs !w-auto max-w-[150px] h-[30px]"
              value={filterJob} onChange={e => setFilterJob(e.target.value)}>
              <option value="">All Jobs</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_name}</option>)}
            </select>
          )}

          {tab === 'schedule' && (
            <select className="input !py-1 text-xs !w-auto max-w-[130px] h-[30px]"
              value={filterSupervisor} onChange={e => setFilterSupervisor(e.target.value)}>
              <option value="">All Supervisors</option>
              {[...new Map(
                (schedule?.days || []).flatMap(d => d.jobs.flatMap(j => j.assignments))
                  .filter(a => a.supervisor_id && a.supervisor_name)
                  .map(a => [a.supervisor_id, { id: a.supervisor_id, name: a.supervisor_name }])
              ).values()].map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          {tab === 'schedule' && (
            <select className="input !py-1 text-xs !w-auto max-w-[120px] h-[30px]"
              value={filterTrade} onChange={e => setFilterTrade(e.target.value)}>
              <option value="">All Trades</option>
              {[...new Set(
                (schedule?.days || []).flatMap(d => d.jobs.flatMap(j => j.assignments))
                  .map(a => a.role || a.trade).filter(Boolean)
              )].sort().map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          {tab === 'schedule' && (
            <select className="input !py-1 text-xs !w-auto max-w-[110px] h-[30px]"
              value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="changed">Changed</option>
              <option value="completed">Completed</option>
              <option value="missed">Missed</option>
            </select>
          )}

          {(search || filterJob || filterSupervisor || filterTrade || filterStatus) && tab === 'schedule' && (
            <button onClick={() => { setSearch(''); setFilterJob(''); setFilterSupervisor(''); setFilterTrade(''); setFilterStatus('') }}
              className="text-[10px] text-slate-600 hover:text-slate-400 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Clear
            </button>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-2 ml-auto">
            {totalPlanned > 0 && tab === 'schedule' && (
              <span className="text-[10px] text-slate-500">{totalPlanned}h planned</span>
            )}
            {canManage && tab === 'schedule' && (
              <button onClick={() => setAssignDay(weekStart)}
                className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" /> Assign
              </button>
            )}
            {tab === 'schedule' && !loading && schedule && (
              <button onClick={() => handlePrint(null)}
                className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5" /> Print Week
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {tab === 'schedule' && !loading && schedule && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="card !py-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Total Planned</p>
            <p className="text-base font-bold text-slate-100">{schedule.total_planned_hours}h</p>
          </div>
          <div className="card !py-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Employees Scheduled</p>
            <p className="text-base font-bold text-brand-400">{schedule.employee_totals.length}</p>
          </div>
          <div className="card !py-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Assignments</p>
            <p className="text-base font-bold text-slate-300">{schedule.days.reduce((s, d) => s + d.assignment_count, 0)}</p>
          </div>
        </div>
      )}

      {/* Main content */}
      {tab === 'variance' ? (
        <VarianceTab weekStart={weekStart} employees={employees} jobs={jobs} />
      ) : loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : !schedule ? (
        <EmptyState icon={CalendarRange} title="No schedule data" description="Failed to load schedule." />
      ) : (
        <>
          {/* 7-day horizontal scroll board */}
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3 min-w-max">
              {filteredDays.map(day => (
                <DayColumn key={day.date} day={day}
                  onAssign={setAssignDay} onEdit={setEditAssignment} onRemove={handleRemove}
                  canManage={canManage} onPrintDay={handlePrint} />
              ))}
            </div>
          </div>

          {/* Per-employee weekly totals */}
          {schedule.employee_totals.length > 0 && (
            <div className="card mt-5">
              <h3 className="font-semibold text-slate-200 text-sm mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-400" /> Employee Weekly Totals
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {schedule.employee_totals.map(e => (
                  <div key={e.employee_id} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
                    <div className="w-6 h-6 rounded-full bg-brand-800 flex items-center justify-center text-[10px] font-bold text-brand-300 shrink-0">
                      {e.employee_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-300 truncate">{e.employee_name}</p>
                      <p className="text-[9px] text-slate-600">{e.trade || 'Employee'}</p>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${e.total_planned_hours >= 40 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {e.total_planned_hours}h
                      {e.total_planned_hours >= 40 && <span className="text-amber-500 ml-1">OT</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Print area (hidden) */}
      {schedule && (
        <PrintArea days={schedule.days} weekLabel={weekLabel} printDay={printDay} />
      )}

      {/* Assign modal */}
      {(assignDay !== null || editAssignment) && (
        <AssignModal
          date={assignDay}
          employees={employees}
          jobs={jobs}
          onSave={handleSave}
          onClose={() => { setAssignDay(null); setEditAssignment(null) }}
          editAssignment={editAssignment}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
