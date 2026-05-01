import { useCallback, useEffect, useState } from 'react'
import { reportsApi, jobsApi } from '../utils/api'
import { PageHeader, LoadingSpinner, StatCard } from '../components/common'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import {
  BarChart3, Briefcase, Users, Package, Clock, CheckCircle2,
  AlertTriangle, TrendingUp, Flame, ShieldAlert, Download
} from 'lucide-react'
import { format, parseISO, subWeeks } from 'date-fns'

const JOB_COLORS = ['#3388ff', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']
const STATUS_COLORS_MAP = {
  submitted: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  exported: '#8b5cf6',
}
const MAT_COLORS_MAP = {
  requested: '#f59e0b',
  approved: '#10b981',
  ordered: '#3388ff',
  delivered: '#8b5cf6',
  denied: '#ef4444',
}

function toMonday(d) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = day === 0 ? -6 : 1 - day
  dt.setDate(dt.getDate() + diff)
  return dt.toISOString().slice(0, 10)
}

function todayMonday() { return toMonday(new Date().toISOString().slice(0, 10)) }

function fmtDate(str) {
  try { return format(parseISO(str), 'MMM d') } catch { return str }
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
        <p className="text-slate-200 font-medium">{label}</p>
        <p className="text-brand-400">{payload[0].value} hrs</p>
      </div>
    )
  }
  return null
}

// ─── warning card ─────────────────────────────────────────────────────────────
function WarningCard({ icon: Icon, color, title, children }) {
  const colors = {
    amber: 'border-amber-500/25 bg-amber-500/8',
    red:   'border-red-500/25 bg-red-500/8',
    brand: 'border-brand-500/25 bg-brand-500/8',
    green: 'border-emerald-500/25 bg-emerald-500/8',
  }
  const iconColors = {
    amber: 'text-amber-400', red: 'text-red-400',
    brand: 'text-brand-400', green: 'text-emerald-400',
  }
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color] || colors.amber}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 shrink-0 ${iconColors[color]}`} />
        <p className={`text-sm font-semibold ${iconColors[color]}`}>{title}</p>
      </div>
      {children}
    </div>
  )
}

// ─── Job Cost Snapshot section ─────────────────────────────────────────────
function JobCostSnapshot() {
  const [weekStart, setWeekStart] = useState(todayMonday())
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = (ws) => {
    setLoading(true)
    reportsApi.jobCostSnapshot(ws)
      .then(r => setSnapshot(r.data))
      .catch(() => setSnapshot(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(weekStart) }, [weekStart])

  const prevWeek = () => {
    const d = new Date(weekStart); d.setDate(d.getDate() - 7)
    setWeekStart(d.toISOString().slice(0, 10))
  }
  const nextWeek = () => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7)
    setWeekStart(d.toISOString().slice(0, 10))
  }

  const weekLabel = snapshot ? `${fmtDate(snapshot.week_start)} – ${fmtDate(snapshot.week_end)}` : '…'
  const isCurrentWeek = weekStart === todayMonday()

  return (
    <div className="mb-8">
      {/* Header + week nav */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-slate-100 text-base">Job Cost Snapshot</h2>
          <p className="text-xs text-slate-500 mt-0.5">Weekly payroll health — rule-based warnings</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200">←</button>
          <span className="text-sm font-semibold text-slate-300 min-w-[120px] text-center">{weekLabel}</span>
          <button onClick={nextWeek} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200">→</button>
          {!isCurrentWeek && (
            <button onClick={() => setWeekStart(todayMonday())} className="text-xs text-brand-400 hover:text-brand-300 underline underline-offset-2 ml-1">now</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><LoadingSpinner size="md" /></div>
      ) : !snapshot || snapshot.totals.total_hours === 0 ? (
        <div className="card text-center py-8 text-slate-600 text-sm italic">No time entries for this week.</div>
      ) : (
        <>
          {/* Totals row */}
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {[
              { label: 'Total Hours', value: snapshot.totals.total_hours + 'h', color: 'text-slate-100' },
              { label: 'Approved', value: snapshot.totals.approved_hours + 'h', color: 'text-emerald-400' },
              { label: 'Pending', value: snapshot.totals.submitted_hours + 'h', color: 'text-amber-400' },
              { label: 'Exported', value: snapshot.totals.exported_hours + 'h', color: 'text-purple-400' },
              { label: 'Ready for Sage', value: snapshot.totals.ready_for_export_hours + 'h', color: 'text-brand-400' },
              { label: 'Export Count', value: snapshot.totals.ready_for_export_count + ' entries', color: 'text-brand-400' },
            ].map(s => (
              <div key={s.label} className="card !py-2.5">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Warning cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">

            {/* Overtime risk */}
            <WarningCard
              icon={Flame}
              color={snapshot.overtime_risk.length > 0 ? 'red' : 'green'}
              title={snapshot.overtime_risk.length > 0
                ? `Overtime Risk — ${snapshot.overtime_risk.length} employee${snapshot.overtime_risk.length > 1 ? 's' : ''}`
                : 'No Overtime Risk'}
            >
              {snapshot.overtime_risk.length === 0 ? (
                <p className="text-xs text-emerald-500">All employees under 40h this week.</p>
              ) : (
                <div className="space-y-1.5">
                  {snapshot.overtime_risk.map(e => (
                    <div key={e.employee_id} className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-slate-200">{e.employee_name}</span>
                        <span className="text-[10px] text-slate-500 ml-2">{e.trade}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${e.total_hours >= 40 ? 'text-red-400' : 'text-amber-400'}`}>
                          {e.total_hours}h
                        </span>
                        {e.total_hours >= 40 && (
                          <span className="text-[10px] text-red-500 ml-1.5">OT</span>
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-600 mt-1 italic">Flagged at 85% of 40h threshold</p>
                </div>
              )}
            </WarningCard>

            {/* Unapproved time by job */}
            <WarningCard
              icon={AlertTriangle}
              color={snapshot.unapproved_by_job.length > 0 ? 'amber' : 'green'}
              title={snapshot.unapproved_by_job.length > 0
                ? `Unapproved Time on ${snapshot.unapproved_by_job.length} Job${snapshot.unapproved_by_job.length > 1 ? 's' : ''}`
                : 'All Time Approved'}
            >
              {snapshot.unapproved_by_job.length === 0 ? (
                <p className="text-xs text-emerald-500">No pending or rejected time entries.</p>
              ) : (
                <div className="space-y-1.5">
                  {snapshot.unapproved_by_job.slice(0, 4).map(j => (
                    <div key={j.job_id} className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-brand-400">{j.job_number}</span>
                        <span className="text-[10px] text-slate-500 ml-2 truncate">{j.job_name}</span>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span className="text-sm font-bold text-amber-400">{j.unapproved_hours}h</span>
                        <span className="text-[10px] text-slate-600 ml-1">unapproved</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WarningCard>

            {/* Ready for export */}
            <WarningCard
              icon={Download}
              color={snapshot.totals.ready_for_export_hours > 0 ? 'brand' : 'amber'}
              title="Ready for Sage Export"
            >
              {snapshot.totals.ready_for_export_count === 0 ? (
                <p className="text-xs text-amber-500">No approved/unexported entries this week.</p>
              ) : (
                <div>
                  <p className="text-sm text-slate-200">
                    <span className="font-bold text-brand-400 text-xl">{snapshot.totals.ready_for_export_hours}h</span>
                    <span className="text-slate-400 ml-2 text-xs">across {snapshot.totals.ready_for_export_count} entries</span>
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">Approved, not yet exported — ready to download CSV</p>
                </div>
              )}
            </WarningCard>

            {/* Hours by cost code — top 4 */}
            <WarningCard icon={TrendingUp} color="brand" title="Top Labor Cost Codes This Week">
              {snapshot.hours_by_cost_code.length === 0 ? (
                <p className="text-xs text-slate-600">No entries this week.</p>
              ) : (
                <div className="space-y-1.5">
                  {snapshot.hours_by_cost_code.slice(0, 4).map((c, i) => {
                    const maxH = snapshot.hours_by_cost_code[0]?.total_hours || 1
                    const pct = Math.max(4, (c.total_hours / maxH) * 100)
                    return (
                      <div key={c.cost_code}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-mono text-[11px] text-brand-400">{c.cost_code}</span>
                          <span className="text-xs font-bold text-slate-200">{c.total_hours}h</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: JOB_COLORS[i % JOB_COLORS.length] }} />
                        </div>
                        <p className="text-[10px] text-slate-600 mt-0.5">{c.description}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </WarningCard>
          </div>

          {/* Hours by job table */}
          {snapshot.hours_by_job.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-slate-200 text-sm mb-3">Hours by Job This Week</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="th text-left">Job</th>
                      <th className="th text-right">Total</th>
                      <th className="th text-right text-emerald-400">Approved</th>
                      <th className="th text-right text-amber-400">Pending</th>
                      <th className="th text-right text-purple-400">Exported</th>
                      <th className="th text-left">Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.hours_by_job.map(j => {
                      const budgetPct = j.budget_hours
                        ? Math.round((j.total_hours / j.budget_hours) * 100)
                        : null
                      const overBudget = budgetPct !== null && budgetPct >= 90
                      return (
                        <tr key={j.job_id} className="table-row">
                          <td className="td">
                            <span className="font-mono text-brand-400">{j.job_number}</span>
                            <span className="text-slate-400 ml-2 truncate max-w-[140px] inline-block align-bottom">{j.job_name}</span>
                          </td>
                          <td className="td text-right font-bold text-slate-200">{j.total_hours}h</td>
                          <td className="td text-right text-emerald-400">{j.approved_hours || 0}h</td>
                          <td className="td text-right text-amber-400">{j.submitted_hours || 0}h</td>
                          <td className="td text-right text-purple-400">{j.exported_hours || 0}h</td>
                          <td className="td">
                            {j.budget_hours ? (
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden shrink-0">
                                  <div
                                    className={`h-full rounded-full ${overBudget ? 'bg-red-500' : 'bg-brand-500'}`}
                                    style={{ width: `${Math.min(100, budgetPct)}%` }}
                                  />
                                </div>
                                <span className={`text-[10px] font-semibold ${overBudget ? 'text-red-400' : 'text-slate-500'}`}>
                                  {budgetPct}%
                                  {overBudget && ' ⚠'}
                                </span>
                              </div>
                            ) : <span className="text-slate-700">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [jobCosts, setJobCosts] = useState([])
  const [byEmployee, setByEmployee] = useState([])
  const [statusSummary, setStatusSummary] = useState(null)
  const [jobs, setJobs] = useState([])
  const [selectedJob, setSelectedJob] = useState('')
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback((jobId) => {
    setLoading(true)
    Promise.all([
      reportsApi.jobCost(jobId),
      reportsApi.byEmployee(),
      reportsApi.statusSummary(),
    ]).then(([jc, emp, stat]) => {
      setJobCosts(jc.data)
      setByEmployee(emp.data)
      setStatusSummary(stat.data)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    jobsApi.list().then(r => setJobs(r.data))
    loadAll()
  }, [loadAll])

  const handleJobFilter = (jobId) => {
    setSelectedJob(jobId)
    loadAll(jobId || undefined)
  }

  const byJob = Object.values(jobCosts.reduce((acc, row) => {
    if (!acc[row.job_id]) acc[row.job_id] = { name: row.job_number, hours: 0 }
    acc[row.job_id].hours += row.total_hours
    return acc
  }, {}))

  const byCostCode = Object.values(jobCosts.reduce((acc, row) => {
    if (!acc[row.cost_code]) acc[row.cost_code] = { name: row.cost_code, desc: row.cost_code_description, hours: 0, entries: 0 }
    acc[row.cost_code].hours += row.total_hours
    acc[row.cost_code].entries += row.entry_count
    return acc
  }, {})).sort((a, b) => b.hours - a.hours)

  const totalHours = jobCosts.reduce((s, r) => s + r.total_hours, 0)
  const totalEntries = jobCosts.reduce((s, r) => s + r.entry_count, 0)

  const entryPieData = statusSummary ? Object.entries(statusSummary.time_entries)
    .map(([k, v]) => ({ name: k, value: v, color: STATUS_COLORS_MAP[k] || '#64748b' }))
    .filter(d => d.value > 0) : []

  const matPieData = statusSummary ? Object.entries(statusSummary.material_requests)
    .map(([k, v]) => ({ name: k, value: v, color: MAT_COLORS_MAP[k] || '#64748b' }))
    .filter(d => d.value > 0) : []

  return (
    <div>
      <PageHeader title="Reports" subtitle="Job cost, payroll snapshot, and operational summary" />

      {/* ── Job Cost Snapshot (Phase 2.2) ── */}
      <JobCostSnapshot />

      <div className="border-t border-slate-800 mb-6" />

      {/* ── All-time reports ── */}
      <h2 className="font-semibold text-slate-200 mb-4">All-Time Approved Hours</h2>

      {/* Job filter */}
      <div className="flex gap-3 mb-5 items-center">
        <label className="text-sm text-slate-400 shrink-0">Filter by job:</label>
        <select className="input max-w-xs" value={selectedJob} onChange={e => handleJobFilter(e.target.value)}>
          <option value="">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Approved Hours" value={totalHours.toFixed(1)} icon={Clock} color="brand" />
        <StatCard label="Time Entries" value={totalEntries} icon={BarChart3} color="green" />
        <StatCard label="Jobs" value={byJob.length} icon={Briefcase} color="purple" />
        <StatCard label="Cost Codes" value={byCostCode.length} icon={BarChart3} color="amber" />
      </div>

      {loading ? <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div> : (
        <div className="space-y-5">

          {byJob.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-slate-200 mb-4">Approved Hours by Job (All Time)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byJob} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                    {byJob.map((_, i) => <Cell key={i} fill={JOB_COLORS[i % JOB_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {byEmployee.length > 0 && (
              <div className="card">
                <h2 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-brand-400" /> Hours by Employee
                </h2>
                <div className="space-y-2">
                  {byEmployee.slice(0, 8).map(emp => (
                    <div key={emp.employee_id} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-brand-700 flex items-center justify-center text-[10px] font-bold text-brand-200 shrink-0">
                        {emp.employee_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-xs text-slate-300 truncate">{emp.employee_name}</span>
                          <span className="text-xs font-semibold text-slate-200 ml-2 shrink-0">{emp.total_hours}h</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-brand-500"
                            style={{ width: `${Math.max(4, (emp.total_hours / (byEmployee[0]?.total_hours || 1)) * 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {entryPieData.length > 0 && (
              <div className="card">
                <h2 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-400" /> Entry Status Breakdown
                </h2>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={entryPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} paddingAngle={2}>
                      {entryPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {matPieData.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <Package className="w-4 h-4 text-brand-400" /> Material Requests by Status
              </h2>
              <div className="flex items-center gap-6 flex-wrap mb-4">
                {matPieData.map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-xs text-slate-400 capitalize">{d.name}</span>
                    <span className="text-xs font-bold text-slate-200">{d.value}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {matPieData.map(d => (
                  <div key={d.name} className="rounded-lg p-3 text-center" style={{ background: d.color + '18' }}>
                    <p className="text-xl font-bold" style={{ color: d.color }}>{d.value}</p>
                    <p className="text-[10px] text-slate-500 capitalize mt-0.5">{d.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {byCostCode.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-slate-200 mb-4">Hours by Cost Code (All Time)</h2>
              <div className="space-y-2">
                {byCostCode.map((row, i) => (
                  <div key={row.name} className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: JOB_COLORS[i % JOB_COLORS.length] }} />
                    <div className="w-20 shrink-0">
                      <span className="font-mono text-xs text-brand-400">{row.name}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-slate-400 truncate">{row.desc}</span>
                        <span className="text-xs font-semibold text-slate-200 ml-2 shrink-0">{row.hours.toFixed(1)}h</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: `${Math.max(2, (row.hours / (byCostCode[0]?.hours || 1)) * 100)}%`, background: JOB_COLORS[i % JOB_COLORS.length] }} />
                      </div>
                    </div>
                    <span className="text-xs text-slate-600 w-12 text-right shrink-0">{row.entries}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
