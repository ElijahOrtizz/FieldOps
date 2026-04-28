import { useEffect, useState } from 'react'
import { exportApi } from '../utils/api'
import { PageHeader, LoadingSpinner, EmptyState } from '../components/common'
import { History, FileSpreadsheet } from 'lucide-react'
import { format } from 'date-fns'

export default function ExportHistoryPage() {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    exportApi.history()
      .then(r => setHistory(r.data))
      .finally(() => setLoading(false))
  }, [])

  const totalExported = history.reduce((s, b) => s + (b.record_count || 0), 0)

  return (
    <div className="max-w-3xl">
      <PageHeader title="Export History" subtitle="Record of all Sage CSV exports" />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Exports</p>
          <p className="text-2xl font-bold text-slate-100">{history.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Records Exported</p>
          <p className="text-2xl font-bold text-slate-100">{totalExported}</p>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div> : (
        history.length === 0 ? (
          <EmptyState
            icon={History}
            title="No exports yet"
            description="Export history will appear here when you export time entries to Sage."
          />
        ) : (
          <div className="card !p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="th">File</th>
                  <th className="th">Records</th>
                  <th className="th">Exported By</th>
                  <th className="th">Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map(batch => (
                  <tr key={batch.id} className="table-row">
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-brand-400 shrink-0" />
                        <span className="font-mono text-xs text-brand-300">{batch.file_name || `export_${batch.id}.csv`}</span>
                      </div>
                    </td>
                    <td className="td">
                      <span className="font-semibold text-slate-200">{batch.record_count}</span>
                      <span className="text-slate-500 text-xs ml-1">entries</span>
                    </td>
                    <td className="td text-slate-400 text-sm">{batch.exported_by || '—'}</td>
                    <td className="td text-slate-400 text-sm">
                      {batch.exported_at ? format(new Date(batch.exported_at), 'MMM d, yyyy h:mm a') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
