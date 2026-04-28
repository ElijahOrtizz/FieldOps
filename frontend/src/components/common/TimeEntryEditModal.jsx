/**
 * TimeEntryEditModal — Phase 2.2
 * Shared modal for viewing/editing a time entry from any page.
 * Props:
 *   entry       — full entry object (from entry_to_dict)
 *   jobs        — list of jobs
 *   costCodes   — list of cost codes
 *   onSave      — async fn(id, data) called after save
 *   onClose     — fn()
 *   readOnly    — bool (worker viewing approved entry)
 *   isLocked    — bool (payroll week locked)
 *   userRole    — 'admin'|'supervisor'|'worker'
 */
import { useState, useEffect } from 'react'
import { timeEntriesApi } from '../../utils/api'
import { X, Clock, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const STATUS_CLS = {
  approved:  'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  submitted: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  rejected:  'bg-red-500/15 text-red-400 border border-red-500/20',
  exported:  'bg-purple-500/15 text-purple-400 border border-purple-500/20',
  draft:     'bg-slate-500/15 text-slate-400 border border-slate-500/20',
  needs_correction: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
}

function fmtDt(dt) {
  if (!dt) return '—'
  try { return format(typeof dt === 'string' ? parseISO(dt) : new Date(dt), 'MMM d, yyyy h:mm a') } catch { return dt }
}

function AuditSection({ entryId }) {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState(null)

  const load = async () => {
    if (logs !== null) return
    const r = await timeEntriesApi.getAudit(entryId)
    setLogs(r.data)
  }

  const toggle = () => {
    setOpen(o => !o)
    load()
  }

  return (
    <div className="border-t border-slate-800 pt-4 mt-4">
      <button onClick={toggle} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Audit History
        {logs && <span className="text-xs text-slate-600">({logs.length} events)</span>}
      </button>

      {open && (
        <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
          {logs === null ? (
            <p className="text-xs text-slate-600">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-slate-600 italic">No audit history for this entry.</p>
          ) : logs.map(log => (
            <div key={log.id} className="bg-slate-800/50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-semibold text-slate-300 capitalize">{log.action}</span>
                <span className="text-[10px] text-slate-600">{fmtDt(log.created_at)}</span>
              </div>
              <p className="text-[11px] text-slate-500">{log.user_name}</p>
              {log.note && <p className="text-[10px] text-slate-600 italic mt-0.5">{log.note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TimeEntryEditModal({
  entry, jobs = [], costCodes = [], onSave, onClose, readOnly = false, isLocked = false, userRole = 'worker'
}) {
  const isAdmin = userRole === 'admin'
  const canEdit = !readOnly && (!isLocked || (isAdmin))
  const isProtected = ['approved', 'exported'].includes(entry.status)
  const [forceEdit, setForceEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    job_id: entry.job_id || '',
    cost_code_id: entry.cost_code_id || '',
    date: entry.date || '',
    start_time: entry.start_time || '',
    end_time: entry.end_time || '',
    total_hours: entry.total_hours || '',
    pay_type: entry.pay_type || 'Regular',
    notes: entry.notes || '',
    status: entry.status || 'submitted',
  })

  // Auto-calc hours when start/end change
  useEffect(() => {
    if (form.start_time && form.end_time) {
      try {
        const [sh, sm] = form.start_time.split(':').map(Number)
        const [eh, em] = form.end_time.split(':').map(Number)
        const diff = (eh * 60 + em) - (sh * 60 + sm)
        if (diff > 0) setForm(f => ({ ...f, total_hours: +(diff / 60).toFixed(2) }))
      } catch {}
    }
  }, [form.start_time, form.end_time])

  const handleSave = async () => {
    setError('')
    if (!form.job_id) { setError('Job is required'); return }
    if (!form.cost_code_id) { setError('Cost code is required'); return }
    if (!form.total_hours || Number(form.total_hours) <= 0) { setError('Hours must be positive'); return }
    if (form.start_time && form.end_time) {
      const [sh, sm] = form.start_time.split(':').map(Number)
      const [eh, em] = form.end_time.split(':').map(Number)
      if (eh * 60 + em <= sh * 60 + sm) { setError('End time must be after start time'); return }
    }

    setSaving(true)
    try {
      await onSave(entry.id, {
        ...form,
        job_id: Number(form.job_id),
        cost_code_id: Number(form.cost_code_id),
        total_hours: Number(form.total_hours),
        force: isAdmin && (isLocked || isProtected) ? true : undefined,
      })
      onClose()
    } catch (e) {
      setError(e.response?.data?.detail || 'Error saving entry')
    } finally {
      setSaving(false)
    }
  }

  const effectivelyReadOnly = readOnly || (isLocked && !isAdmin) || (isProtected && !isAdmin && !forceEdit)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="font-semibold text-slate-100">
              {effectivelyReadOnly ? 'View Time Entry' : 'Edit Time Entry'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">#{entry.id} · {entry.employee_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_CLS[entry.status] || STATUS_CLS.draft}`}>
              {entry.status}
            </span>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Warnings */}
        <div className="px-5 shrink-0">
          {isLocked && (
            <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              This week is payroll-locked.{isAdmin ? ' You can still edit (admin override).' : ' Contact admin to make changes.'}
            </div>
          )}
          {isProtected && !isLocked && !readOnly && !isAdmin && (
            <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Entry is {entry.status}. Only admins can edit.
            </div>
          )}
          {isProtected && isAdmin && !isLocked && (
            <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-400">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Entry is {entry.status}. Editing will force-override.
              </div>
              {!forceEdit && (
                <button
                  onClick={() => setForceEdit(true)}
                  className="underline underline-offset-2 hover:text-amber-300"
                >
                  I understand — allow edit
                </button>
              )}
              {forceEdit && <span className="text-emerald-400">Override active — you may edit.</span>}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">

          {/* Date */}
          <div className="form-group">
            <label className="label">Date</label>
            <input type="date" className="input" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              disabled={effectivelyReadOnly} />
          </div>

          {/* Times */}
          <div className="grid grid-cols-3 gap-3">
            <div className="form-group">
              <label className="label">Start Time</label>
              <input type="time" className="input" value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                disabled={effectivelyReadOnly} />
            </div>
            <div className="form-group">
              <label className="label">End Time</label>
              <input type="time" className="input" value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                disabled={effectivelyReadOnly} />
            </div>
            <div className="form-group">
              <label className="label">Hours</label>
              <input type="number" className="input" step="0.25" min="0.25" value={form.total_hours}
                onChange={e => setForm(f => ({ ...f, total_hours: e.target.value }))}
                disabled={effectivelyReadOnly} />
            </div>
          </div>

          {/* Job */}
          <div className="form-group">
            <label className="label">Job *</label>
            {effectivelyReadOnly ? (
              <p className="input bg-slate-900/50 text-slate-300">{entry.job_number} — {entry.job_name}</p>
            ) : (
              <select className="input" value={form.job_id}
                onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}>
                <option value="">Select job…</option>
                {jobs.filter(j => j.status === 'active').map(j => (
                  <option key={j.id} value={j.id}>{j.job_number} — {j.job_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Cost Code */}
          <div className="form-group">
            <label className="label">Cost Code *</label>
            {effectivelyReadOnly ? (
              <p className="input bg-slate-900/50 text-slate-300">{entry.cost_code} — {entry.cost_code_description}</p>
            ) : (
              <select className="input" value={form.cost_code_id}
                onChange={e => setForm(f => ({ ...f, cost_code_id: e.target.value }))}>
                <option value="">Select cost code…</option>
                {costCodes.filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.id}>{c.code} — {c.description}</option>
                ))}
              </select>
            )}
          </div>

          {/* Pay type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">Pay Type</label>
              <select className="input" value={form.pay_type}
                onChange={e => setForm(f => ({ ...f, pay_type: e.target.value }))}
                disabled={effectivelyReadOnly}>
                <option value="Regular">Regular</option>
                <option value="OT">Overtime (OT)</option>
                <option value="DT">Double Time (DT)</option>
              </select>
            </div>
            {(isAdmin || userRole === 'supervisor') && !effectivelyReadOnly && (
              <div className="form-group">
                <label className="label">Status</label>
                <select className="input" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="needs_correction">Needs Correction</option>
                </select>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="label">Notes</label>
            <textarea className="input min-h-[64px]" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              disabled={effectivelyReadOnly}
              placeholder="Optional notes…" />
          </div>

          {/* Attachments */}
          {entry.receipts?.length > 0 && (
            <div>
              <p className="label mb-1.5">Attachments</p>
              <div className="space-y-1">
                {entry.receipts.map(r => (
                  <a key={r.id} href={`/uploads/${r.filename}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-brand-400 hover:text-brand-300">
                    📎 {r.original_name || r.filename}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Approval info */}
          {entry.approval && (
            <div className="bg-slate-800/40 rounded-lg px-3 py-2 text-xs">
              <p className="text-slate-500 mb-1 uppercase tracking-wider text-[10px] font-bold">Approval</p>
              <p className="text-slate-300 capitalize">{entry.approval.action} by {entry.approval.supervisor_name}</p>
              {entry.approval.notes && <p className="text-slate-500 italic mt-0.5">{entry.approval.notes}</p>}
            </div>
          )}

          {/* Audit */}
          <AuditSection entryId={entry.id} />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 flex items-center gap-3 shrink-0">
          {error && <p className="text-xs text-red-400 flex-1">{error}</p>}
          {!effectivelyReadOnly && (
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
          <button onClick={onClose} className="btn-secondary">
            {effectivelyReadOnly ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
