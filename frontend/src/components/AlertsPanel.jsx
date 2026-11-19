import { useEffect, useState } from 'react'
import { alertsApi, errMsg } from '../utils/api'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

// Rule-based alerts for the last 7 days: missing time, long days, jobs near or over their hours budget.
// Loads on its own so a failure here never blanks the rest of the dashboard.
export default function AlertsPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    alertsApi.get()
      .then(res => setData(res.data))
      .catch(e => setError(errMsg(e, 'Could not load alerts')))
  }, [])

  if (error) {
    return <div className="card mb-6 text-sm text-gray-500 dark:text-slate-500">{error}</div>
  }
  if (!data) return null

  const total = data.counts.missing_time + data.counts.long_days + data.counts.job_budgets

  return (
    <div className="card mb-6">
      <div className="flex items-center gap-2 mb-3">
        {total === 0
          ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
          : <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
        <h2 className="font-semibold text-gray-800 dark:text-slate-200">Alerts</h2>
        <span className="text-xs text-gray-500 dark:text-slate-500">{data.start} to {data.end}</span>
      </div>

      {total === 0 && (
        <p className="text-sm text-gray-500 dark:text-slate-500">Nothing needs attention.</p>
      )}

      {data.missing_time.length > 0 && (
        <Section title={`Missing time (${data.missing_time.length})`}>
          {data.missing_time.map(m => (
            <Row key={`${m.employee_id}-${m.date}`}
              left={m.employee_name}
              sub={`${m.date} · scheduled${m.job_name ? ` on ${m.job_name}` : ''}, no hours logged`}
              right={m.planned_hours ? `${m.planned_hours}h planned` : ''} />
          ))}
        </Section>
      )}

      {data.long_days.length > 0 && (
        <Section title={`Long days over 12 hours (${data.long_days.length})`}>
          {data.long_days.map(l => (
            <Row key={`${l.employee_id}-${l.date}`}
              left={l.employee_name} sub={l.date} right={`${l.total_hours}h`} />
          ))}
        </Section>
      )}

      {data.job_budgets.length > 0 && (
        <Section title={`Job hours budget (${data.job_budgets.length})`}>
          {data.job_budgets.map(j => (
            <Row key={j.job_id}
              left={`${j.job_number} ${j.job_name}`}
              sub={`${j.logged_hours}h of ${j.budget_hours}h budgeted`}
              right={`${j.percent}%`}
              tone={j.level === 'over' ? 'over' : 'warn'} />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-500 mb-1.5">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ left, sub, right, tone }) {
  const rightColor = tone === 'over'
    ? 'text-red-600 dark:text-red-400'
    : 'text-amber-600 dark:text-amber-400'
  return (
    <div className="flex items-center justify-between p-2.5 bg-gray-100 dark:bg-slate-800/50 rounded-lg">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{left}</p>
        <p className="text-xs text-gray-500 dark:text-slate-500">{sub}</p>
      </div>
      {right && <span className={`text-sm font-semibold ml-3 shrink-0 ${rightColor}`}>{right}</span>}
    </div>
  )
}
