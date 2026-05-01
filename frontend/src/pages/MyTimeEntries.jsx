import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { timeEntriesApi } from '../utils/api'
import { PageHeader, StatusBadge, EmptyState, LoadingSpinner } from '../components/common'
import { Clock, Plus, Trash2 } from 'lucide-react'

export default function MyTimeEntries() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const load = () => {
    setLoading(true)
    timeEntriesApi.list().then(res => {
      setEntries(res.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry?')) return
    await timeEntriesApi.delete(id)
    load()
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.status === filter)

  const totalHours = filtered.reduce((s, e) => s + e.total_hours, 0)

  return (
    <div>
      <PageHeader
        title="My Time Entries"
        subtitle="Track your submitted hours and approval status"
        action={
          <Link to="/worker/new-entry" className="btn-primary">
            <Plus className="w-4 h-4" /> New Entry
          </Link>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {['all', 'submitted', 'approved', 'rejected', 'exported'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              filter === s
                ? 'bg-brand-600 text-white'
                : 'bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
            }`}
          >
            {s} {s !== 'all' && entries.filter(e => e.status === s).length > 0
              && <span className="ml-1 text-xs opacity-70">({entries.filter(e => e.status === s).length})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          {filtered.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-slate-500 mb-3">
              {filtered.length} entries · {totalHours.toFixed(1)} total hours
            </div>
          )}
          <div className="card overflow-x-auto">
            {filtered.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No entries found"
                description={filter === 'all' ? 'Submit your first time entry to get started.' : `No ${filter} entries.`}
                action={filter === 'all' && <Link to="/worker/new-entry" className="btn-primary"><Plus className="w-4 h-4" /> Log Time</Link>}
              />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-800">
                    <th className="th">Date</th>
                    <th className="th">Job</th>
                    <th className="th">Cost Code</th>
                    <th className="th">Hours</th>
                    <th className="th">Pay</th>
                    <th className="th">Status</th>
                    <th className="th">Notes</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(entry => (
                    <tr key={entry.id} className="table-row">
                      <td className="td font-mono text-xs text-gray-600 dark:text-slate-400">{entry.date}</td>
                      <td className="td">
                        <span className="font-medium text-gray-800 dark:text-slate-200">{entry.job_number}</span>
                        <span className="text-gray-500 dark:text-slate-500 text-xs block truncate max-w-32">{entry.job_name}</span>
                      </td>
                      <td className="td text-xs">
                        <span className="font-mono text-brand-600 dark:text-brand-400">{entry.cost_code}</span>
                        <span className="text-gray-500 dark:text-slate-500 block">{entry.cost_code_description}</span>
                      </td>
                      <td className="td font-semibold text-gray-900 dark:text-slate-100">{entry.total_hours}h</td>
                      <td className="td text-xs text-gray-600 dark:text-slate-400">{entry.pay_type}</td>
                      <td className="td"><StatusBadge status={entry.status} /></td>
                      <td className="td max-w-40">
                        <span className="text-xs text-gray-500 dark:text-slate-500 truncate block">{entry.notes || '—'}</span>
                        {entry.approval?.notes && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 block mt-0.5">
                            Supervisor: {entry.approval.notes}
                          </span>
                        )}
                      </td>
                      <td className="td">
                        {['submitted', 'rejected'].includes(entry.status) && (
                          <button onClick={() => handleDelete(entry.id)}
                            className="text-gray-400 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
