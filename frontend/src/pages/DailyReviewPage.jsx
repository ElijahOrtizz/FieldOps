import { useEffect, useState, useCallback } from 'react'
import { dailyReviewApi, jobsApi } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { PageHeader, LoadingSpinner, EmptyState } from '../components/common'
import {
  ClipboardCheck, CheckCircle2, Ban, MessageSquare, AlertTriangle,
  Clock, Users, Search, ChevronDown, ChevronUp, BadgeCheck
} from 'lucide-react'
import { format } from 'date-fns'

const STATUS_CLS = {
  submitted: 'text-amber-600 dark:text-amber-400',
  approved: 'text-emerald-600 dark:text-emerald-400',
  rejected: 'text-red-600 dark:text-red-400',
  needs_correction: 'text-orange-600 dark:text-orange-400',
  exported: 'text-purple-600 dark:text-purple-400',
}

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t) }, [onDone])
  return (
    <div className={`fixed bottom-6 right-6 z-50 ${type === 'error' ? 'bg-red-600' : 'bg-emerald-600'} text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl`}>
      {msg}
    </div>
  )
}

function NoteModal({ title, onConfirm, onClose, variant = 'default' }) {
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-white border border-gray-200 dark:bg-slate-900 dark:border-slate-700 rounded-xl w-full max-w-sm p-5">
        <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-3">{title}</h3>
        <textarea className="input min-h-[64px] mb-4" value={note}
          onChange={e => setNote(e.target.value)} placeholder="Optional note…" autoFocus />
        <div className="flex gap-3">
          <button onClick={() => onConfirm(note)} className={variant === 'danger' ? 'btn-danger' : 'btn-primary'}>Confirm</button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function DailyReviewPage() {
  const { user } = useAuth()
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().slice(0, 10))
  const [jobs, setJobs] = useState([])
  const [filterJob, setFilterJob] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [noteModal, setNoteModal] = useState(null)
  const [showVariance, setShowVariance] = useState(true)
  const [actionInProgress, setActionInProgress] = useState(null)

  useEffect(() => { jobsApi.list().then(r => setJobs(r.data)).catch(() => {}) }, [])

  const load = useCallback(() => {
    setLoading(true)
    const params = { review_date: reviewDate }
    if (filterJob) params.job_id = filterJob
    dailyReviewApi.get(params)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [reviewDate, filterJob])

  useEffect(() => { load() }, [load])

  const showToast = (msg, type = 'success') => setToast({ msg, type })

  const action = async (fn, successMsg) => {
    try { await fn(); showToast(successMsg); load() }
    catch (e) { showToast(e.response?.data?.detail || 'Error', 'error') }
  }

  const entryAction = async (id, fn, successMsg) => {
    setActionInProgress(id)
    await action(fn, successMsg)
    setActionInProgress(null)
  }

  const handleSignoff = async (note, reopen = false) => {
    await action(
      () => dailyReviewApi.signoff({ date: reviewDate, job_id: filterJob || undefined, notes: note, reopen }),
      reopen ? 'Day reopened' : 'Day signed off ✓'
    )
  }

  const filteredEntries = (data?.time_entries || []).filter(e => {
    if (filterStatus && e.status !== filterStatus) return false
    if (!search) return true
    return e.employee_name.toLowerCase().includes(search.toLowerCase())
  })

  const signoff = data?.signoff
  const missingIds = new Set(data?.variance?.missing_timecard_employee_ids || [])
  const unscheduledIds = new Set(data?.variance?.unscheduled_employee_ids || [])

  return (
    <div>
      <PageHeader title="Daily Review" subtitle="Today's crew, time entries, corrections, and sign-off" />

      {/* Filter bar */}
      <div className="sticky top-0 z-30 bg-gray-50/97 dark:bg-slate-950/97 backdrop-blur-md border-b border-gray-200 dark:border-slate-800 -mx-6 px-6 py-2.5 mb-4 shadow-lg shadow-black/10 dark:shadow-black/20">
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" className="input !py-1 text-xs !w-auto h-[30px]"
            value={reviewDate} onChange={e => setReviewDate(e.target.value)} />

          <select className="input !py-1 text-xs !w-auto max-w-[160px] h-[30px]"
            value={filterJob} onChange={e => setFilterJob(e.target.value)}>
            <option value="">All Jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_name}</option>)}
          </select>

          <div className="relative flex-1 min-w-[130px] max-w-[180px]">
            <Search className="w-3 h-3 text-gray-400 dark:text-slate-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input className="input !py-1.5 !pl-7 text-xs h-[30px]" placeholder="Employee…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <select className="input !py-1 text-xs !w-auto h-[30px]"
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="submitted">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="needs_correction">Needs Correction</option>
          </select>

          <div className="ml-auto flex items-center gap-2">
            {signoff?.status === 'signed_off' ? (
              <div className="flex items-center gap-2">
                <BadgeCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Signed Off</span>
                <button onClick={() => setNoteModal({ action: 'reopen' })}
                  className="text-[10px] text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 underline">Reopen</button>
              </div>
            ) : (
              <button onClick={() => setNoteModal({ action: 'signoff' })}
                className="btn-success text-xs py-1.5 px-3 flex items-center gap-1.5">
                <BadgeCheck className="w-3.5 h-3.5" /> Sign Off Day
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : !data ? (
        <EmptyState icon={ClipboardCheck} title="No data" description="Could not load daily review." />
      ) : (
        <div className="space-y-4">

          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Scheduled', val: data.assignments.length, color: 'text-brand-600 dark:text-brand-400' },
              { label: 'Time Entries', val: data.time_entries.length, color: 'text-gray-900 dark:text-slate-100' },
              { label: 'Active Clocks', val: data.active_clock_sessions.length, color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Pending Corrections', val: data.pending_corrections.length, color: 'text-amber-600 dark:text-amber-400' },
            ].map(s => (
              <div key={s.label} className="card !py-2">
                <p className="text-[9px] text-gray-400 dark:text-slate-600 uppercase tracking-wider mb-0.5">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>

          {/* Variance flags */}
          {(missingIds.size > 0 || unscheduledIds.size > 0) && (
            <div className="card">
              <button onClick={() => setShowVariance(v => !v)}
                className="flex items-center gap-2 w-full text-left">
                <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                <span className="font-semibold text-sm text-amber-600 dark:text-amber-300">
                  {missingIds.size + unscheduledIds.size} variance issues
                </span>
                {showVariance ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 dark:text-slate-600 ml-auto" />
                              : <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-slate-600 ml-auto" />}
              </button>
              {showVariance && (
                <div className="mt-3 space-y-2">
                  {[...missingIds].map(eid => {
                    const a = data.assignments.find(x => x.employee_id === eid)
                    return (
                      <div key={eid} className="flex items-center justify-between bg-red-500/8 rounded-lg px-3 py-2 border border-red-500/15">
                        <div>
                          <span className="text-xs font-semibold text-red-600 dark:text-red-400">Missing Timecard</span>
                          <p className="text-[10px] text-gray-500 dark:text-slate-500">{a?.employee_name || `Employee #${eid}`} — scheduled {a?.planned_hours}h on {a?.job_number}</p>
                        </div>
                        {a && <button onClick={() => action(() => dailyReviewApi.markAbsent({ employee_id: eid, assignment_id: a.id }), 'Marked absent')}
                          className="text-[10px] text-gray-500 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 ml-4">Mark Absent</button>}
                      </div>
                    )
                  })}
                  {[...unscheduledIds].map(eid => {
                    const e = data.time_entries.find(x => x.employee_id === eid)
                    return (
                      <div key={eid} className="flex items-center justify-between bg-amber-500/8 rounded-lg px-3 py-2 border border-amber-500/15">
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Unscheduled Work</span>
                        <p className="text-[10px] text-gray-500 dark:text-slate-500">{e?.employee_name || `Employee #${eid}`}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Active clock sessions */}
          {data.active_clock_sessions.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-sm text-emerald-600 dark:text-emerald-300 flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                Active Clock Sessions ({data.active_clock_sessions.length})
              </h3>
              <div className="space-y-2">
                {data.active_clock_sessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-sm bg-gray-100 dark:bg-slate-800/40 rounded-lg px-3 py-2">
                    <span className="text-gray-700 dark:text-slate-300">{s.employee_name}</span>
                    <div className="text-right">
                      <span className="font-mono text-[10px] text-brand-600 dark:text-brand-400">{s.job_number}</span>
                      <p className="text-[10px] text-gray-400 dark:text-slate-600">{s.clock_in_time ? format(new Date(s.clock_in_time), 'h:mm a') : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Time entries */}
          <div className="card">
            <h3 className="font-semibold text-sm text-gray-800 dark:text-slate-200 flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-brand-500 dark:text-brand-400" /> Time Entries ({filteredEntries.length})
            </h3>
            {filteredEntries.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-600 italic">No time entries for today.</p>
            ) : (
              <div className="space-y-2">
                {filteredEntries.map(e => (
                  <div key={e.id} className="flex items-center justify-between gap-3 bg-gray-100 dark:bg-slate-800/40 rounded-lg px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-800 dark:text-slate-200 font-medium truncate">{e.employee_name}</p>
                        <span className={`text-[10px] font-semibold capitalize ${STATUS_CLS[e.status] || 'text-gray-500 dark:text-slate-400'}`}>{e.status}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-slate-500">{e.job_number} · {e.start_time}–{e.end_time}</p>
                    </div>
                    <span className="font-bold text-gray-800 dark:text-slate-200 shrink-0">{e.hours}h</span>
                    {e.status === 'submitted' && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => entryAction(e.id, () => dailyReviewApi.approveEntry(e.id), 'Approved')}
                          disabled={actionInProgress === e.id}
                          className="p-1 text-gray-400 dark:text-slate-600 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-40" title="Approve">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setNoteModal({ action: 'reject', entryId: e.id })}
                          className="p-1 text-gray-400 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400" title="Reject">
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setNoteModal({ action: 'correction', entryId: e.id })}
                          className="p-1 text-gray-400 dark:text-slate-600 hover:text-amber-600 dark:hover:text-amber-400" title="Needs Correction">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending corrections */}
          {data.pending_corrections.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-sm text-amber-600 dark:text-amber-300 flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4" /> Correction Requests ({data.pending_corrections.length})
              </h3>
              <div className="space-y-2">
                {data.pending_corrections.map(cr => (
                  <div key={cr.id} className="bg-gray-100 dark:bg-slate-800/40 rounded-lg px-3 py-2.5 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-slate-200">{cr.employee_name || `Entry #${cr.time_entry_id}`}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5 italic">{cr.reason}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => entryAction(cr.id, () => dailyReviewApi.approveCorrection(cr.id, { apply_changes: true }), 'Correction approved')}
                        disabled={actionInProgress === cr.id}
                        className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded disabled:opacity-40">Apply</button>
                      <button onClick={() => entryAction(cr.id, () => dailyReviewApi.rejectCorrection(cr.id), 'Correction rejected')}
                        disabled={actionInProgress === cr.id}
                        className="text-[10px] text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border border-red-500/20 px-2 py-0.5 rounded disabled:opacity-40">Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Note modal */}
      {noteModal && (
        <NoteModal
          title={noteModal.action === 'signoff' ? 'Sign Off Day'
               : noteModal.action === 'reopen' ? 'Reopen Day'
               : noteModal.action === 'reject' ? 'Reject Entry'
               : 'Needs Correction'}
          variant={noteModal.action === 'reject' ? 'danger' : 'default'}
          onConfirm={async (note) => {
            if (noteModal.action === 'signoff') await handleSignoff(note)
            else if (noteModal.action === 'reopen') await handleSignoff(note, true)
            else if (noteModal.action === 'reject') await action(() => dailyReviewApi.rejectEntry(noteModal.entryId, { notes: note }), 'Entry rejected')
            else if (noteModal.action === 'correction') await action(() => dailyReviewApi.needsCorrection(noteModal.entryId, { notes: note }), 'Flagged for correction')
            setNoteModal(null)
          }}
          onClose={() => setNoteModal(null)}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
