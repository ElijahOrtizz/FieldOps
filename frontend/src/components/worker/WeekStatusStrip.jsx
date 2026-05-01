import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'

// Matches CrewSchedulePage StatusBadge pattern + existing stats card color tokens
const STATUS_PILL = {
  approved: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
  pending:  'bg-amber-500/15  text-amber-600  dark:text-amber-400  border border-amber-500/20',
  rejected: 'bg-red-500/15    text-red-600    dark:text-red-400    border border-red-500/20',
}

const STATUS_LABEL = {
  approved: 'Approved',
  pending:  'Pending',
  rejected: 'Rejected',
}

function fmtDay(iso) {
  try { return format(parseISO(iso), 'MMM d') } catch { return '' }
}

export default function WeekStatusStrip({ days, otBreakdown }) {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const todayRef  = useRef(null)

  // Scroll today's cell into view on mobile
  useEffect(() => {
    const container = scrollRef.current
    const cell      = todayRef.current
    if (!container || !cell) return
    const scrollLeft = cell.offsetLeft - container.offsetWidth / 2 + cell.offsetWidth / 2
    container.scrollLeft = Math.max(0, scrollLeft)
  }, [days])

  if (!days?.length) return null

  const weekRange = days.length >= 2
    ? `${fmtDay(days[0].date)} – ${fmtDay(days[days.length - 1].date)}`
    : ''

  const ot      = otBreakdown
  const hasOT   = ot && (ot.ot_hours > 0 || ot.dt_hours > 0)

  return (
    <div className="card mb-6">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">This Week</p>
        {weekRange && (
          <p className="text-xs text-gray-400 dark:text-slate-500">{weekRange}</p>
        )}
      </div>

      {/* ── Day grid ────────────────────────────────────────────── */}
      {/* On mobile: horizontal flex scroll, cells 52px wide, today auto-centered */}
      {/* On sm+: 7-col grid, cells fill evenly */}
      <div ref={scrollRef} className="overflow-x-auto -mx-5 px-5 pb-1">
        <div className="flex gap-1.5 min-w-max sm:grid sm:grid-cols-7 sm:gap-2 sm:min-w-0">
          {days.map(day => {
            const pillCls   = STATUS_PILL[day.status]
            const pillLabel = STATUS_LABEL[day.status]

            return (
              <button
                key={day.date}
                ref={day.is_today ? todayRef : null}
                onClick={() => navigate(`/worker/new-entry?date=${day.date}`)}
                title={
                  day.total_hours > 0
                    ? `${day.total_hours}h logged — click to add hours`
                    : 'Click to log hours'
                }
                className={[
                  'flex flex-col items-center py-3 px-1.5 rounded-xl',
                  'w-[52px] sm:w-auto min-h-[80px]',
                  'transition-all cursor-pointer select-none',
                  'border-t-2',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                  day.is_today
                    ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/30'
                    : 'border-transparent bg-gray-50 dark:bg-slate-800/40 hover:bg-gray-100 dark:hover:bg-slate-800 hover:shadow-sm',
                ].join(' ')}
              >
                {/* Day abbreviation */}
                <span className={[
                  'text-[10px] font-bold uppercase tracking-wide leading-none mb-1',
                  day.is_today
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-gray-400 dark:text-slate-500',
                ].join(' ')}>
                  {day.day_abbr}
                </span>

                {/* Date number */}
                <span className={[
                  'text-base font-bold leading-none mb-2.5',
                  day.is_today
                    ? 'text-brand-700 dark:text-brand-300'
                    : 'text-gray-700 dark:text-slate-300',
                ].join(' ')}>
                  {day.day_num}
                </span>

                {/* Status indicator */}
                {pillLabel ? (
                  <span className={`text-[9px] font-semibold px-1 py-0.5 rounded-full leading-none ${pillCls}`}>
                    {pillLabel}
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-slate-700" />
                )}

                {/* Hours */}
                <span className={[
                  'text-[10px] font-medium leading-none mt-1.5',
                  day.total_hours > 0
                    ? 'text-gray-500 dark:text-slate-400'
                    : 'text-transparent',
                ].join(' ')}>
                  {day.total_hours > 0 ? `${day.total_hours}h` : '—'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── OT footer summary ───────────────────────────────────── */}
      {ot && (
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 text-[11px] text-gray-500 dark:text-slate-500 leading-relaxed">
          {hasOT ? (
            <span>
              Regular{' '}
              <span className="font-semibold text-gray-700 dark:text-slate-300">{ot.regular_hours}h</span>
              <span className="mx-1.5 opacity-40">·</span>
              Overtime{' '}
              <span className="font-semibold text-amber-600 dark:text-amber-400">{ot.ot_hours}h</span>
              {ot.dt_hours > 0 && (
                <>
                  <span className="mx-1.5 opacity-40">·</span>
                  Double-time{' '}
                  <span className="font-semibold text-red-600 dark:text-red-400">{ot.dt_hours}h</span>
                </>
              )}
              <span className="mx-1.5 opacity-40">·</span>
              Total{' '}
              <span className="font-semibold text-gray-700 dark:text-slate-300">{ot.total_hours}h</span>
            </span>
          ) : (
            <span>
              <span className="font-semibold text-gray-700 dark:text-slate-300">{ot.regular_hours}h</span>
              {' '}regular this week — no overtime
            </span>
          )}
          {ot.hours_until_ot != null && ot.hours_until_ot > 0 && ot.hours_until_ot <= 8 && (
            <p className="mt-1 text-gray-400 dark:text-slate-600">
              {ot.hours_until_ot}h until overtime kicks in
            </p>
          )}
        </div>
      )}
    </div>
  )
}
