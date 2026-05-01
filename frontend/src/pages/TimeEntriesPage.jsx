import { useEffect, useState } from 'react'
import { timeEntriesApi, employeesApi } from '../utils/api'
import { PageHeader, StatusBadge, EmptyState, LoadingSpinner } from '../components/common'
import { FileText } from 'lucide-react'

export default function TimeEntriesPage() {
  const [entries, setEntries] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [filterEmployee, setFilterEmployee] = useState('all')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      timeEntriesApi.list(),
      employeesApi.list(false),
    ]).then(([entriesRes, empRes]) => {
      setEntries(entriesRes.data)
      setEmployees(empRes.data)
    }).finally(() => setLoading(false))
  }, [])

  const byEmployee = filterEmployee === 'all'
    ? entries
    : entries.filter(e => String(e.employee_id) === filterEmployee)

  const filtered = filter === 'all' ? byEmployee : byEmployee.filter(e => e.status === filter)
  const totalHours = filtered.reduce((s, e) => s + e.total_hours, 0)

  const counts = ['submitted', 'approved', 'rejected', 'exported'].reduce((acc, s) => {
    acc[s] = byEmployee.filter(e => e.status === s).length
    return acc
  }, {})

  return (
    <div>
      <PageHeader title="All Time Entries" subtitle="View and manage all submitted time entries" />

      {/* Employee filter */}
      <div className="mb-4">
        <select
          value={filterEmployee}
          onChange={e => { setFilterEmployee(e.target.value); setFilter('all') }}
          className="input max-w-xs"
        >
          <option value="all">All Crew Members</option>
          {employees.map(emp => (
            <option key={emp.id} value={String(emp.id)}>
              {emp.name} ({emp.employee_number})
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'all' ? 'bg-brand-600 text-white' : 'bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}>
          All ({byEmployee.length})
        </button>
        {Object.entries(counts).map(([status, count]) => (
          <button key={status} onClick={() => setFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${filter === status ? 'bg-brand-600 text-white' : 'bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}>
            {status} ({count})
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div> : (
        <>
          {filtered.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-slate-500 mb-3">
              {filtered.length} entries · {totalHours.toFixed(1)} total hours
            </div>
          )}
          <div className="card overflow-x-auto">
            {filtered.length === 0 ? <EmptyState icon={FileText} title="No entries" /> : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-800">
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
                      <td className="td font-mono text-xs text-gray-600 dark:text-slate-400">{entry.date}</td>
                      <td className="td">
                        <p className="font-medium text-gray-800 dark:text-slate-200">{entry.employee_name}</p>
                        <p className="font-mono text-xs text-gray-500 dark:text-slate-500">{entry.employee_number}</p>
                      </td>
                      <td className="td">
                        <span className="font-medium text-gray-800 dark:text-slate-200">{entry.job_number}</span>
                        <span className="text-xs text-gray-500 dark:text-slate-500 block truncate max-w-32">{entry.job_name}</span>
                      </td>
                      <td className="td text-xs">
                        <span className="font-mono text-brand-600 dark:text-brand-400">{entry.cost_code}</span>
                        <span className="text-gray-500 dark:text-slate-500 block">{entry.cost_code_description}</span>
                      </td>
                      <td className="td font-semibold text-gray-900 dark:text-slate-100">{entry.total_hours}h</td>
                      <td className="td text-xs text-gray-600 dark:text-slate-400">{entry.pay_type}</td>
                      <td className="td"><StatusBadge status={entry.status} /></td>
                      <td className="td text-sm text-gray-600 dark:text-slate-400">{entry.approval?.supervisor_name || '—'}</td>
                      <td className="td max-w-36">
                        <span className="text-xs text-gray-500 dark:text-slate-500 truncate block">{entry.notes || '—'}</span>
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
