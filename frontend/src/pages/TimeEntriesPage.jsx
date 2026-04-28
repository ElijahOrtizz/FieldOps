import { useEffect, useState } from 'react'
import { timeEntriesApi } from '../utils/api'
import { PageHeader, StatusBadge, EmptyState, LoadingSpinner } from '../components/common'
import { FileText } from 'lucide-react'

export default function TimeEntriesPage() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    setLoading(true)
    timeEntriesApi.list().then(res => setEntries(res.data)).finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? entries : entries.filter(e => e.status === filter)
  const totalHours = filtered.reduce((s, e) => s + e.total_hours, 0)

  const counts = ['submitted', 'approved', 'rejected', 'exported'].reduce((acc, s) => {
    acc[s] = entries.filter(e => e.status === s).length
    return acc
  }, {})

  return (
    <div>
      <PageHeader title="All Time Entries" subtitle="View and manage all submitted time entries" />

      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'all' ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
          All ({entries.length})
        </button>
        {Object.entries(counts).map(([status, count]) => (
          <button key={status} onClick={() => setFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${filter === status ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
            {status} ({count})
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div> : (
        <>
          {filtered.length > 0 && (
            <div className="text-xs text-slate-500 mb-3">
              {filtered.length} entries · {totalHours.toFixed(1)} total hours
            </div>
          )}
          <div className="card overflow-x-auto">
            {filtered.length === 0 ? <EmptyState icon={FileText} title="No entries" /> : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="th">Date</th>
                    <th className="th">Employee</th>
                    <th className="th">Job</th>
                    <th className="th">Cost Code</th>
                    <th className="th">Hours</th>
                    <th className="th">Pay</th>
                    <th className="th">Status</th>
                    <th className="th">Approved By</th>
                    <th className="th">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(entry => (
                    <tr key={entry.id} className="table-row">
                      <td className="td font-mono text-xs text-slate-400">{entry.date}</td>
                      <td className="td">
                        <p className="font-medium text-slate-200">{entry.employee_name}</p>
                        <p className="font-mono text-xs text-slate-500">{entry.employee_number}</p>
                      </td>
                      <td className="td">
                        <span className="font-medium">{entry.job_number}</span>
                        <span className="text-xs text-slate-500 block truncate max-w-32">{entry.job_name}</span>
                      </td>
                      <td className="td text-xs">
                        <span className="font-mono text-brand-400">{entry.cost_code}</span>
                        <span className="text-slate-500 block">{entry.cost_code_description}</span>
                      </td>
                      <td className="td font-semibold text-slate-100">{entry.total_hours}h</td>
                      <td className="td text-xs text-slate-400">{entry.pay_type}</td>
                      <td className="td"><StatusBadge status={entry.status} /></td>
                      <td className="td text-sm text-slate-400">{entry.approval?.supervisor_name || '—'}</td>
                      <td className="td max-w-36">
                        <span className="text-xs text-slate-500 truncate block">{entry.notes || '—'}</span>
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
