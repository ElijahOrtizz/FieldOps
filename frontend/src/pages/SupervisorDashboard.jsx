import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { reportsApi, approvalsApi } from '../utils/api'
import { PageHeader, StatCard, StatusBadge, LoadingSpinner } from '../components/common'
import { CheckSquare, Users, Clock, TrendingUp, ChevronRight } from 'lucide-react'

export default function SupervisorDashboard() {
  const [stats, setStats] = useState(null)
  const [queue, setQueue] = useState([])
  const [crewReport, setCrewReport] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      reportsApi.dashboard(),
      approvalsApi.queue(),
      reportsApi.weeklyCrews()
    ]).then(([sRes, qRes, crewRes]) => {
      setStats(sRes.data)
      setQueue(qRes.data.slice(0, 6))
      setCrewReport(crewRes.data)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>

  return (
    <div>
      <PageHeader
        title="Supervisor HQ"
        subtitle="Review crew hours and manage approvals"
        action={
          <Link to="/supervisor/approvals" className="btn-primary">
            <CheckSquare className="w-4 h-4" />
            Review Queue
            {stats?.pending_approvals > 0 && (
              <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center -ml-1">
                {stats.pending_approvals}
              </span>
            )}
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending Approvals" value={stats?.pending_approvals ?? 0} icon={CheckSquare} color="amber" />
        <StatCard label="Crew Size" value={stats?.crew_size ?? 0} sub="workers reporting to you" icon={Users} color="brand" />
        <StatCard label="Crew Hours This Week" value={stats?.crew_hours_this_week ?? 0} sub="approved hours" icon={TrendingUp} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pending queue preview */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800 dark:text-slate-200">Pending Approvals</h2>
            <Link to="/supervisor/approvals" className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">View all →</Link>
          </div>
          {queue.length === 0 ? (
            <p className="text-gray-500 dark:text-slate-500 text-sm py-4 text-center">All caught up! No pending approvals.</p>
          ) : (
            <div className="space-y-2">
              {queue.map(entry => (
                <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-100 dark:bg-slate-800/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{entry.employee_name}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500">{entry.date} · {entry.job_number} · {entry.cost_code}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-800 dark:text-slate-200">{entry.total_hours}h</span>
                    <StatusBadge status={entry.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weekly crew summary */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 dark:text-slate-200 mb-4">Weekly Crew Summary</h2>
          {crewReport.length === 0 ? (
            <p className="text-gray-500 dark:text-slate-500 text-sm py-4 text-center">No hours logged this week.</p>
          ) : (
            <div className="space-y-3">
              {crewReport.map(worker => (
                <div key={worker.employee_id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-700/30 flex items-center justify-center text-xs font-bold text-brand-600 dark:text-brand-400">
                    {worker.employee_name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{worker.employee_name}</p>
                      <span className="text-sm font-semibold text-gray-800 dark:text-slate-200 ml-2">{worker.total_hours}h</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-600 rounded-full"
                          style={{ width: `${Math.min(100, (worker.total_hours / 45) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-slate-500">{worker.pending_hours}h pending</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
