import { useEffect, useState } from 'react'
import { auditLogsApi } from '../utils/api'
import { PageHeader, LoadingSpinner, EmptyState } from '../components/common'
import { Activity, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

const ACTION_COLORS = {
  approved: 'text-emerald-400 bg-emerald-500/10',
  rejected: 'text-red-400 bg-red-500/10',
  exported: 'text-purple-400 bg-purple-500/10',
  edited: 'text-amber-400 bg-amber-500/10',
  created: 'text-blue-400 bg-blue-500/10',
  deleted: 'text-red-400 bg-red-500/10',
  needs_correction: 'text-orange-400 bg-orange-500/10',
  payroll_locked: 'text-amber-400 bg-amber-500/10',
  payroll_unlocked: 'text-slate-400 bg-slate-500/10',
  sage_prepare: 'text-brand-400 bg-brand-500/10',
  sage_sync_success: 'text-emerald-400 bg-emerald-500/10',
  sage_sync_failed: 'text-red-400 bg-red-500/10',
}

function LogRow({ log }) {
  const [open, setOpen] = useState(false)
  const colorClass = ACTION_COLORS[log.action] || 'text-slate-400 bg-slate-500/10'

  let oldVal = null, newVal = null
  try { oldVal = log.old_value ? JSON.parse(log.old_value) : null } catch {}
  try { newVal = log.new_value ? JSON.parse(log.new_value) : null } catch {}

  return (
    <div className="border-b border-slate-800/60 last:border-0">
      <button
        className="w-full flex items-center gap-3 py-3 px-4 hover:bg-slate-800/30 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${colorClass}`}>
          {log.action}
        </span>
        <span className="text-sm text-slate-300 flex-1">
          <span className="font-medium text-slate-200">{log.user_name || 'System'}</span>
          {' '}
          <span className="text-slate-400 capitalize">{log.resource_type?.replace('_', ' ')}</span>
          {log.resource_id ? <span className="text-slate-600"> #{log.resource_id}</span> : null}
          {log.note && <span className="text-slate-500 ml-2 italic truncate">— {log.note}</span>}
        </span>
        <span className="text-xs text-slate-600 shrink-0">
          {log.created_at ? format(new Date(log.created_at), 'MMM d, h:mm a') : ''}
        </span>
        {(oldVal || newVal) ? (
          open ? <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
        ) : <span className="w-3" />}
      </button>

      {open && (oldVal || newVal) && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-2 gap-3">
            {oldVal && (
              <div className="bg-red-500/5 border border-red-500/15 rounded-lg p-3">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2">Before</p>
                <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono">{JSON.stringify(oldVal, null, 2)}</pre>
              </div>
            )}
            {newVal && (
              <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-3">
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2">After</p>
                <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono">{JSON.stringify(newVal, null, 2)}</pre>
              </div>
            )}
          </div>
          {log.details && <p className="text-xs text-slate-500 mt-2">{log.details}</p>}
        </div>
      )}
    </div>
  )
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    auditLogsApi.list({ limit: 200 })
      .then(r => setLogs(r.data))
      .finally(() => setLoading(false))
  }, [])

  const actions = [...new Set(logs.map(l => l.action))].sort()
  const filtered = filter ? logs.filter(l => l.action === filter) : logs

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Full history of approvals, edits, and exports" />

      <div className="flex gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filter ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
        >
          All ({logs.length})
        </button>
        {actions.map(a => (
          <button
            key={a}
            onClick={() => setFilter(a)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === a ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
          >
            {a} ({logs.filter(l => l.action === a).length})
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div> : (
        filtered.length === 0 ? (
          <EmptyState icon={Activity} title="No audit logs" description="Actions will appear here as users interact with the system." />
        ) : (
          <div className="card !p-0 overflow-hidden">
            {filtered.map(log => <LogRow key={log.id} log={log} />)}
          </div>
        )
      )}
    </div>
  )
}
