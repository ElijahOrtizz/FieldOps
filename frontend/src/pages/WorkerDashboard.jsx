import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { reportsApi, timeEntriesApi, scheduleApi, workerApi, jobsApi } from '../utils/api'
import { StatusBadge, PageHeader, LoadingSpinner } from '../components/common'
import WeekStatusStrip from '../components/worker/WeekStatusStrip'
import { Clock, Plus, CheckCircle2, CalendarRange, MapPin, LogIn, LogOut, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

// ── Correction Request Modal ──────────────────────────────────────────────
function CorrectionModal({ entry, jobs, onClose }) {
  const [reason, setReason] = useState('')
  const [reqStart, setReqStart] = useState('')
  const [reqEnd, setReqEnd] = useState('')
  const [reqJobId, setReqJobId] = useState('')
  const [reqNotes, setReqNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!reason.trim()) { setErr('Reason is required'); return }
    setSaving(true); setErr('')
    try {
      await workerApi.requestCorrection({
        time_entry_id: entry.id,
        reason,
        requested_start_time: reqStart || undefined,
        requested_end_time: reqEnd || undefined,
        requested_job_id: reqJobId ? Number(reqJobId) : undefined,
        requested_notes: reqNotes || undefined,
      })
      setDone(true)
      setTimeout(onClose, 1800)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Failed to submit')
    } finally { setSaving(false) }
  }

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-white border border-emerald-500/30 dark:bg-slate-900 rounded-xl w-full max-w-sm p-6 text-center">
        <p className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm">✓ Correction request submitted</p>
        <p className="text-gray-500 dark:text-slate-500 text-xs mt-1">Your supervisor will review it.</p>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-white border border-gray-200 dark:bg-slate-900 dark:border-slate-700 rounded-xl w-full max-w-sm p-5 shadow-2xl">
        <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-1">Request Correction</h3>
        <p className="text-xs text-gray-500 dark:text-slate-500 mb-4">
          Entry #{entry.id} · {entry.date} · {entry.job_number} · {entry.total_hours}h
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Reason *</label>
            <textarea className="input min-h-[60px]" value={reason}
              onChange={e => setReason(e.target.value)} placeholder="Describe what needs correcting…" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Correct Start</label>
              <input type="time" className="input" value={reqStart} onChange={e => setReqStart(e.target.value)} /></div>
            <div><label className="label">Correct End</label>
              <input type="time" className="input" value={reqEnd} onChange={e => setReqEnd(e.target.value)} /></div>
          </div>
          <div>
            <label className="label">Correct Job (optional)</label>
            <select className="input" value={reqJobId} onChange={e => setReqJobId(e.target.value)}>
              <option value="">— keep current job —</option>
              {jobs.filter(j => j.status === 'active').map(j => (
                <option key={j.id} value={j.id}>{j.job_number} — {j.job_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Additional Notes (optional)</label>
            <input className="input" value={reqNotes} onChange={e => setReqNotes(e.target.value)} placeholder="e.g. started at 6:30 not 7:00" />
          </div>
          {err && <p className="text-xs text-red-500 dark:text-red-400">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={submit} disabled={saving} className="btn-primary text-sm disabled:opacity-40">
              {saving ? 'Submitting…' : 'Submit Request'}
            </button>
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WorkerDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [recentEntries, setRecentEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [todayAssignments, setTodayAssignments] = useState([])
  const [clockSession, setClockSession] = useState(null)
  const [clockLoading, setClockLoading] = useState(false)
  const [clockToast, setClockToast] = useState('')
  const [correctionEntry, setCorrectionEntry] = useState(null)
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    Promise.all([
      reportsApi.dashboard(),
      timeEntriesApi.list(),
    ]).then(([statsRes, entriesRes]) => {
      setStats(statsRes.data)
      setRecentEntries(entriesRes.data.slice(0, 5))
    }).finally(() => setLoading(false))
    workerApi.today().then(r => {
      setTodayAssignments(r.data.assignments || [])
      setClockSession(r.data.clock_session || null)
    }).catch(() => {})
    jobsApi.list().then(r => setJobs(r.data)).catch(() => {})
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner size="lg" />
    </div>
  )

  const today = format(new Date(), 'EEEE, MMMM d')

  const handleClockIn = async (jobId, assignmentId) => {
    setClockLoading(true)
    try {
      const r = await workerApi.clockIn({ job_id: jobId, schedule_assignment_id: assignmentId || undefined })
      setClockSession(r.data)
      setClockToast('Clocked in!')
      setTimeout(() => setClockToast(''), 3000)
    } catch (e) {
      setClockToast(e.response?.data?.detail || 'Clock in failed')
      setTimeout(() => setClockToast(''), 4000)
    } finally { setClockLoading(false) }
  }

  const handleClockOut = async () => {
    setClockLoading(true)
    try {
      await workerApi.clockOut({})
      setClockSession(null)
      setClockToast('Clocked out! Time entry submitted.')
      setTimeout(() => setClockToast(''), 3000)
    } catch (e) {
      setClockToast(e.response?.data?.detail || 'Clock out failed')
      setTimeout(() => setClockToast(''), 4000)
    } finally { setClockLoading(false) }
  }

  return (
    <div>
      <PageHeader
        title={`Hello, ${user?.name?.split(' ')[0]} 👷`}
        subtitle={today}
        action={
          <Link to="/worker/new-entry" className="btn-primary min-h-[44px] flex items-center gap-2">
            <Plus className="w-5 h-5" /> Log Hours
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card !p-3 flex flex-col gap-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Approved</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats?.approved_hours ?? 0}</p>
          <p className="text-[11px] text-gray-500 dark:text-slate-500">hrs this week</p>
        </div>
        <div className="card !p-3 flex flex-col gap-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Pending</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats?.pending_hours ?? 0}</p>
          <p className="text-[11px] text-gray-500 dark:text-slate-500">hrs pending</p>
        </div>
        <div className="card !p-3 flex flex-col gap-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Rejected</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats?.rejected_hours ?? 0}</p>
          <p className="text-[11px] text-gray-500 dark:text-slate-500">hrs to fix</p>
        </div>
      </div>

      {/* Week at a Glance — hero, includes OT footer */}
      <WeekStatusStrip days={stats?.week_strip} otBreakdown={stats?.weekly_ot_breakdown} />

      {/* Today's Assignment */}
      {todayAssignments.length > 0 && (
        <div className="card mb-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarRange className="w-4 h-4 text-brand-500 dark:text-brand-400" />
            <h2 className="font-semibold text-gray-800 dark:text-slate-200 text-sm">Today's Assignment</h2>
          </div>
          <div className="space-y-2">
            {todayAssignments.map(a => (
              <div key={a.id} className="bg-gray-100 dark:bg-slate-800/60 rounded-xl px-4 py-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-slate-100 text-sm truncate">{a.job_name}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    <span className="text-xs text-gray-500 dark:text-slate-500 font-mono">{a.job_number}</span>
                    {a.job_address && (
                      <span className="text-xs text-gray-500 dark:text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{a.job_address}
                      </span>
                    )}
                    {a.supervisor_name && (
                      <span className="text-xs text-gray-500 dark:text-slate-500">Supervisor: {a.supervisor_name}</span>
                    )}
                  </div>
                  {a.notes && <p className="text-xs text-gray-400 dark:text-slate-600 italic mt-1">{a.notes}</p>}
                </div>
                <div className="text-right shrink-0">
                  {a.planned_start_time && a.planned_end_time ? (
                    <p className="text-sm font-bold text-gray-800 dark:text-slate-200">{a.planned_start_time} – {a.planned_end_time}</p>
                  ) : null}
                  <p className="text-xs text-brand-600 dark:text-brand-400 font-semibold">{a.planned_hours}h planned</p>
                  {a.role && <p className="text-[10px] text-gray-400 dark:text-slate-600 mt-0.5">{a.role}</p>}
                </div>
              </div>
            ))}
          </div>
          {/* Clock In buttons under today's assignments */}
          {!clockSession && todayAssignments.map(a => (
            <button key={a.id} onClick={() => handleClockIn(a.job_id, a.id)}
              disabled={clockLoading}
              className="mt-2 w-full btn-success text-xs py-2 flex items-center justify-center gap-2 disabled:opacity-40">
              <LogIn className="w-3.5 h-3.5" /> Clock In — {a.job_name}
            </button>
          ))}
        </div>
      )}

      {/* Active clock session */}
      {clockSession && (
        <div className="card mb-5 border border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">Clocked In</p>
              </div>
              <p className="text-xs text-gray-600 dark:text-slate-400">{clockSession.job_name}</p>
              {clockSession.clock_in_time && (
                <p className="text-[10px] text-gray-400 dark:text-slate-600 mt-0.5">
                  Since {format(new Date(clockSession.clock_in_time), 'h:mm a')}
                </p>
              )}
            </div>
            <button onClick={handleClockOut} disabled={clockLoading}
              className="btn-danger text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-40">
              <LogOut className="w-3.5 h-3.5" /> Clock Out
            </button>
          </div>
        </div>
      )}

      {clockToast && (
        <div className={`fixed bottom-6 right-6 z-50 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl ${clockToast.includes('failed') || clockToast.toLowerCase().includes('error') ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {clockToast}
        </div>
      )}

      {/* Quick actions */}
      <div className="mb-6">
        <Link to="/worker/my-entries"
          className="card hover:border-gray-300 dark:hover:border-slate-700 transition-colors flex items-center gap-4 group cursor-pointer">
          <div className="w-10 h-10 bg-gray-200 dark:bg-slate-800 rounded-xl flex items-center justify-center">
            <Clock className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-gray-800 dark:text-slate-200">View My Entries</p>
            <p className="text-xs text-gray-500 dark:text-slate-500">Check status of submitted time</p>
          </div>
        </Link>
      </div>

      {/* Recent entries */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800 dark:text-slate-200">Recent Entries</h2>
          <Link to="/worker/my-entries" className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">View all →</Link>
        </div>
        {recentEntries.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-500 text-sm">
            No time entries yet. <Link to="/worker/new-entry" className="text-brand-600 dark:text-brand-400">Log your first entry →</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-800">
                  <th className="th">Date</th>
                  <th className="th">Job</th>
                  <th className="th">Cost Code</th>
                  <th className="th">Hours</th>
                  <th className="th">Status</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map(entry => (
                  <tr key={entry.id} className="table-row">
                    <td className="td font-mono text-xs">{entry.date}</td>
                    <td className="td">
                      <span className="font-medium text-gray-800 dark:text-slate-200">{entry.job_number}</span>
                      <span className="text-gray-500 dark:text-slate-500 text-xs block">{entry.job_name}</span>
                    </td>
                    <td className="td text-xs">{entry.cost_code} — {entry.cost_code_description}</td>
                    <td className="td font-semibold">{entry.total_hours}h</td>
                    <td className="td"><StatusBadge status={entry.status} /></td>
                    <td className="td">
                      {['submitted', 'rejected', 'needs_correction'].includes(entry.status) && (
                        <button
                          onClick={() => setCorrectionEntry(entry)}
                          className="text-[10px] text-gray-400 dark:text-slate-500 hover:text-amber-500 dark:hover:text-amber-400 transition-colors whitespace-nowrap">
                          Request Correction
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {correctionEntry && (
        <CorrectionModal entry={correctionEntry} jobs={jobs} onClose={() => setCorrectionEntry(null)} />
      )}
    </div>
  )
}
