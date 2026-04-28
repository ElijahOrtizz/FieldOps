import { useEffect, useState } from 'react'
import { approvalsApi } from '../utils/api'
import { PageHeader, StatusBadge, EmptyState, LoadingSpinner, Modal } from '../components/common'
import { CheckCircle2, XCircle, MessageSquare, CheckSquare, Zap } from 'lucide-react'

function ApprovalModal({ entry, onClose, onAction }) {
  const [action, setAction] = useState('approved')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    await onAction(entry.id, { action, notes })
    setLoading(false)
    onClose()
  }

  return (
    <Modal open={!!entry} onClose={onClose} title="Review Time Entry" size="md">
      {entry && (
        <div className="space-y-4">
          {/* Entry details */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Employee</span>
              <span className="font-medium">{entry.employee_name} ({entry.employee_number})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date</span>
              <span>{entry.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Job</span>
              <span>{entry.job_number} — {entry.job_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cost Code</span>
              <span>{entry.cost_code} — {entry.cost_code_description}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Hours</span>
              <span className="font-bold text-brand-400">{entry.total_hours}h ({entry.pay_type})</span>
            </div>
            {entry.start_time && (
              <div className="flex justify-between">
                <span className="text-slate-500">Time</span>
                <span>{entry.start_time} – {entry.end_time}</span>
              </div>
            )}
            {entry.notes && (
              <div className="flex justify-between">
                <span className="text-slate-500">Notes</span>
                <span className="text-right max-w-48 text-slate-300">{entry.notes}</span>
              </div>
            )}
          </div>

          {/* Action selection */}
          <div>
            <label className="label">Action</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'approved', label: 'Approve', cls: 'border-emerald-600/40 text-emerald-400', active: 'bg-emerald-600/20 border-emerald-600' },
                { value: 'rejected', label: 'Reject', cls: 'border-red-600/30 text-red-400', active: 'bg-red-600/20 border-red-600' },
                { value: 'changes_requested', label: 'Request Changes', cls: 'border-amber-600/30 text-amber-400', active: 'bg-amber-600/20 border-amber-600' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setAction(opt.value)}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                    action === opt.value ? opt.active : `${opt.cls} bg-transparent hover:bg-slate-800`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="label">Notes (optional)</label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="Add a note for the worker..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={submit} disabled={loading} className="btn-primary">
              Submit Review
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function ApprovalQueue() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [bulkSelected, setBulkSelected] = useState([])

  const load = () => {
    setLoading(true)
    approvalsApi.queue().then(res => {
      setEntries(res.data)
      setBulkSelected([])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleAction = async (entryId, data) => {
    await approvalsApi.process(entryId, data)
    load()
  }

  const handleBulkApprove = async () => {
    if (!confirm(`Approve ${bulkSelected.length} entries?`)) return
    await approvalsApi.bulkApprove(bulkSelected)
    load()
  }

  const toggleBulk = (id) => {
    setBulkSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleAll = () => {
    setBulkSelected(prev => prev.length === entries.length ? [] : entries.map(e => e.id))
  }

  return (
    <div>
      <PageHeader
        title="Approval Queue"
        subtitle={`${entries.length} entries pending review`}
        action={
          bulkSelected.length > 0 && (
            <button onClick={handleBulkApprove} className="btn-success">
              <Zap className="w-4 h-4" />
              Approve {bulkSelected.length} Selected
            </button>
          )
        }
      />

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : entries.length === 0 ? (
        <div className="card">
          <EmptyState icon={CheckSquare} title="Queue is clear" description="All time entries have been reviewed." />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="th w-8">
                  <input type="checkbox" className="accent-brand-500"
                    checked={bulkSelected.length === entries.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="th">Employee</th>
                <th className="th">Date</th>
                <th className="th">Job</th>
                <th className="th">Cost Code</th>
                <th className="th">Hours</th>
                <th className="th">Notes</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="table-row">
                  <td className="td">
                    <input type="checkbox" className="accent-brand-500"
                      checked={bulkSelected.includes(entry.id)}
                      onChange={() => toggleBulk(entry.id)}
                    />
                  </td>
                  <td className="td">
                    <p className="font-medium text-slate-200">{entry.employee_name}</p>
                    <p className="text-xs text-slate-500">{entry.employee_number}</p>
                  </td>
                  <td className="td font-mono text-xs text-slate-400">{entry.date}</td>
                  <td className="td">
                    <span className="font-medium">{entry.job_number}</span>
                    <span className="text-xs text-slate-500 block truncate max-w-36">{entry.job_name}</span>
                  </td>
                  <td className="td text-xs">
                    <span className="font-mono text-brand-400">{entry.cost_code}</span>
                    <span className="text-slate-500 block">{entry.cost_code_description}</span>
                  </td>
                  <td className="td">
                    <span className="font-bold text-slate-100">{entry.total_hours}h</span>
                    <span className="text-xs text-slate-500 block">{entry.pay_type}</span>
                  </td>
                  <td className="td max-w-36">
                    <span className="text-xs text-slate-400 truncate block">{entry.notes || '—'}</span>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleAction(entry.id, { action: 'approved' })}
                        title="Approve"
                        className="p-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/25 text-emerald-400 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAction(entry.id, { action: 'rejected' })}
                        title="Reject"
                        className="p-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/25 text-red-400 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSelected(entry)}
                        title="Review with notes"
                        className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ApprovalModal entry={selected} onClose={() => setSelected(null)} onAction={handleAction} />
    </div>
  )
}
