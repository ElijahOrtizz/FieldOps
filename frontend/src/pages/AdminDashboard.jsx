import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { reportsApi } from '../utils/api'
import { StatCard, PageHeader, LoadingSpinner } from '../components/common'
import { Users, Briefcase, Clock, CheckSquare, Download, BarChart3, Tag, Package, History, Activity, Settings } from 'lucide-react'

const QUICK_LINKS = [
  { to: '/supervisor/approvals', label: 'Approval Queue', icon: CheckSquare, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  { to: '/admin/time-entries', label: 'Time Entries', icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { to: '/admin/jobs', label: 'Jobs', icon: Briefcase, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { to: '/admin/employees', label: 'Employees', icon: Users, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { to: '/admin/cost-codes', label: 'Cost Codes', icon: Tag, color: 'text-slate-400', bg: 'bg-slate-500/10' },
  { to: '/material-requests', label: 'Material Requests', icon: Package, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { to: '/admin/export', label: 'Export to Sage', icon: Download, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { to: '/admin/export-history', label: 'Export History', icon: History, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  { to: '/reports', label: 'Reports', icon: BarChart3, color: 'text-pink-400', bg: 'bg-pink-500/10' },
  { to: '/admin/audit-log', label: 'Audit Log', icon: Activity, color: 'text-teal-400', bg: 'bg-teal-500/10' },
  { to: '/admin/settings', label: 'Settings', icon: Settings, color: 'text-slate-400', bg: 'bg-slate-500/10' },
]

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [jobCosts, setJobCosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      reportsApi.dashboard(),
      reportsApi.jobCost(),
    ]).then(([d, jc]) => {
      setStats(d.data)
      setJobCosts(jc.data.slice(0, 5))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>

  return (
    <div>
      <PageHeader title="Admin Dashboard" subtitle="FieldOps v2 — full operations overview" />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Pending Approvals" value={stats?.pending_approvals ?? 0} icon={CheckSquare} color="amber" />
        <StatCard label="Hours This Week" value={stats?.hours_this_week ?? 0} icon={Clock} color="brand" />
        <StatCard label="Active Jobs" value={stats?.active_jobs ?? 0} icon={Briefcase} color="green" />
        <StatCard label="Active Employees" value={stats?.active_employees ?? 0} icon={Users} color="purple" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Entries" value={stats?.total_entries ?? 0} icon={BarChart3} color="brand" />
        <StatCard label="Approved This Week" value={stats?.approved_this_week ?? 0} icon={CheckSquare} color="green" />
        <StatCard label="Pending Materials" value={stats?.pending_materials ?? 0} icon={Package} color="amber" />
        <StatCard label="Version" value="v2.0" icon={Settings} color="purple" />
      </div>

      {/* Quick Links */}
      <div className="card mb-5">
        <h2 className="font-semibold text-slate-200 mb-4">Quick Access</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {QUICK_LINKS.map(({ to, label, icon: Icon, color, bg }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-slate-800 transition-colors text-center"
            >
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <span className="text-[11px] text-slate-400 leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Job Cost Summary */}
      {jobCosts.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-200">Top Jobs by Approved Hours</h2>
            <Link to="/reports" className="text-xs text-brand-400 hover:text-brand-300">Full Reports →</Link>
          </div>
          <div className="space-y-2">
            {Object.values(jobCosts.reduce((acc, r) => {
              if (!acc[r.job_id]) acc[r.job_id] = { job_number: r.job_number, job_name: r.job_name, hours: 0 }
              acc[r.job_id].hours += r.total_hours
              return acc
            }, {})).map((job, i) => (
              <div key={i} className="flex items-center gap-4 p-2.5 bg-slate-800/40 rounded-lg">
                <span className="font-mono text-xs text-brand-400 w-24 shrink-0">{job.job_number}</span>
                <span className="text-sm text-slate-300 flex-1 truncate">{job.job_name}</span>
                <span className="text-sm font-bold text-slate-100 shrink-0">{job.hours.toFixed(1)}h</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
