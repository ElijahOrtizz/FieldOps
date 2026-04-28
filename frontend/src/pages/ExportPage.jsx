import { useEffect, useState } from 'react'
import { exportApi, jobsApi } from '../utils/api'
import { PageHeader, LoadingSpinner } from '../components/common'
import { Download, AlertTriangle, CheckCircle2, FileSpreadsheet, Eye } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const STATUS_CLS = {
  approved: 'text-emerald-400',
  exported: 'text-purple-400',
  submitted: 'text-amber-400',
  rejected: 'text-red-400',
}

function fmtDate(str) {
  try { return format(parseISO(str), 'MMM d, yyyy') } catch { return str || '—' }
}

export default function ExportPage() {
  const [jobs, setJobs] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [jobId, setJobId] = useState('')
  const [markExported, setMarkExported] = useState(true)
  const [includeExported, setIncludeExported] = useState(false)

  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    jobsApi.list().then(r => setJobs(r.data))
    loadPreview()
  }, [])

  const buildParams = () => {
    const p = { include_exported: includeExported }
    if (dateFrom) p.date_from = dateFrom
    if (dateTo) p.date_to = dateTo
    if (jobId) p.job_id = jobId
    return p
  }

  const loadPreview = async () => {
    setPreviewLoading(true)
    setError('')
    try {
      const r = await exportApi.preview(buildParams())
      setPreview(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load preview')
      setPreview(null)
    } finally { setPreviewLoading(false) }
  }

  // Reload preview when filters change
  useEffect(() => { loadPreview() }, [dateFrom, dateTo, jobId, includeExported])

  const handleExport = async () => {
    if (!preview || preview.record_count === 0) {
      setError('No approved entries to export.')
      return
    }
    if (!confirm(
      `This will export ${preview.record_count} entries (${preview.total_hours}h)` +
      (markExported ? ' and mark them as exported.' : '.') +
      '\n\nContinue?'
    )) return

    setExporting(true)
    setError('')
    try {
      const params = { ...buildParams(), mark_exported: markExported }
      const r = await exportApi.sageCsv(params)
      const url = URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a')
      const now = format(new Date(), 'yyyy-MM-dd')
      a.href = url
      a.download = `fieldops_sage_export_${now}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setExported(true)
      setTimeout(() => setExported(false), 5000)
      if (markExported) loadPreview()  // refresh to show updated statuses
    } catch (e) {
      if (e.response?.status === 404) {
        setError('No approved entries found for the selected filters.')
      } else {
        setError(e.response?.data?.detail || 'Export failed')
      }
    } finally { setExporting(false) }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Export to Sage" subtitle="Preview and download approved time entries as Sage-ready CSV" />

      {/* ── Filters ── */}
      <div className="card mb-5">
        <h2 className="font-semibold text-slate-200 mb-4">Export Filters</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="form-group">
            <label className="label">Date From</label>
            <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Date To</label>
            <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="form-group lg:col-span-2">
            <label className="label">Job (optional)</label>
            <select className="input" value={jobId} onChange={e => setJobId(e.target.value)}>
              <option value="">All Jobs</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-center border-t border-slate-800 pt-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
            <input type="checkbox" className="w-4 h-4 rounded" checked={markExported}
              onChange={e => setMarkExported(e.target.checked)} />
            Mark entries as exported after download
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-400">
            <input type="checkbox" className="w-4 h-4 rounded" checked={includeExported}
              onChange={e => setIncludeExported(e.target.checked)} />
            Include already-exported entries
          </label>
          {includeExported && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              Re-exporting already-exported entries
            </div>
          )}
        </div>
      </div>

      {/* ── Export Preview ── */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-200 flex items-center gap-2">
            <Eye className="w-4 h-4 text-brand-400" />Export Preview
          </h2>
          {preview && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400">
                <span className="font-bold text-slate-200">{preview.record_count}</span> entries ·{' '}
                <span className="font-bold text-slate-200">{preview.total_hours}h</span> total
              </span>
            </div>
          )}
        </div>

        {previewLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner size="md" /></div>
        ) : !preview || preview.record_count === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle className="w-8 h-8 text-amber-500/50 mx-auto mb-2" />
            <p className="text-slate-400 font-medium">No entries to export</p>
            <p className="text-slate-600 text-sm mt-1">
              {includeExported
                ? 'No approved or exported entries match the filters.'
                : 'No approved (unexported) entries found. Check filters or enable "include already exported".'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="th text-left">Employee</th>
                  <th className="th text-left">Date</th>
                  <th className="th text-left">Job</th>
                  <th className="th text-left">Cost Code</th>
                  <th className="th text-right">Hours</th>
                  <th className="th text-left">Pay Type</th>
                  <th className="th text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.entries.map(e => (
                  <tr key={e.id} className="table-row">
                    <td className="td text-slate-300">{e.employee_name}</td>
                    <td className="td text-slate-400 font-mono">{fmtDate(e.date)}</td>
                    <td className="td">
                      <span className="font-mono text-brand-400">{e.job_number}</span>
                      <span className="text-slate-500 ml-1.5 truncate max-w-[100px] inline-block align-bottom">{e.job_name}</span>
                    </td>
                    <td className="td font-mono text-slate-400">{e.cost_code}</td>
                    <td className="td text-right font-bold text-slate-200">{e.hours}h</td>
                    <td className="td text-slate-400">{e.pay_type}</td>
                    <td className="td">
                      <span className={`font-semibold capitalize ${STATUS_CLS[e.status] || 'text-slate-400'}`}>{e.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700">
                  <td colSpan={4} className="td text-slate-400 font-medium">Total</td>
                  <td className="td text-right font-bold text-slate-100">{preview.total_hours}h</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Error / Success ── */}
      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
      {exported && (
        <div className="mb-4 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Export downloaded successfully.{markExported ? ' Entries marked as exported.' : ''}
        </div>
      )}

      {/* ── Export Button ── */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleExport}
          disabled={exporting || previewLoading || !preview || preview.record_count === 0}
          className="btn-primary flex items-center gap-2 disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting…' : `Download Sage CSV${preview ? ` (${preview.record_count} entries)` : ''}`}
        </button>
        {markExported && preview && preview.record_count > 0 && (
          <p className="text-xs text-slate-500">
            Will mark {preview.record_count} entries as exported.
          </p>
        )}
      </div>

      {/* ── Sage Format Note ── */}
      <div className="mt-6 card !py-3 opacity-60">
        <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">CSV Columns</p>
        <p className="text-xs text-slate-600 font-mono">
          Employee_ID · Employee_Name · Job_Number · Job_Name · Cost_Code · Cost_Code_Desc ·
          Date · Day_Of_Week · Start_Time · End_Time · Hours · Pay_Type · Notes · Approved_By · Approval_Date · Export_Date
        </p>
      </div>
    </div>
  )
}
