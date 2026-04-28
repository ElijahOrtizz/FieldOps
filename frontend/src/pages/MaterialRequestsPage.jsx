import { useEffect, useState } from 'react'
import { materialRequestsApi, jobsApi, costCodesApi } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { PageHeader, EmptyState, LoadingSpinner, Modal, StatusBadge } from '../components/common'
import { Package, Plus, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import { format } from 'date-fns'

const PRIORITY_COLORS = {
  low: 'text-slate-400 bg-slate-500/10',
  normal: 'text-blue-400 bg-blue-500/10',
  high: 'text-amber-400 bg-amber-500/10',
  urgent: 'text-red-400 bg-red-500/10',
}

const STATUS_COLORS = {
  requested: 'text-amber-400 bg-amber-500/10 border border-amber-500/20',
  approved: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20',
  ordered: 'text-blue-400 bg-blue-500/10 border border-blue-500/20',
  delivered: 'text-purple-400 bg-purple-500/10 border border-purple-500/20',
  denied: 'text-red-400 bg-red-500/10 border border-red-500/20',
}

function MRModal({ mr, jobs, costCodes, onSave, onClose, userRole }) {
  const [form, setForm] = useState({
    job_id: mr?.job_id || '',
    cost_code_id: mr?.cost_code_id || '',
    material_name: mr?.material_name || '',
    quantity: mr?.quantity || 1,
    unit: mr?.unit || '',
    needed_by_date: mr?.needed_by_date || '',
    priority: mr?.priority || 'normal',
    notes: mr?.notes || '',
  })
  const [loading, setLoading] = useState(false)
  const isEdit = !!mr

  const handleSubmit = async () => {
    if (!form.material_name || !form.job_id) return
    setLoading(true)
    try {
      await onSave({ ...form, job_id: Number(form.job_id), cost_code_id: form.cost_code_id ? Number(form.cost_code_id) : null, quantity: Number(form.quantity) })
      onClose()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error saving')
    } finally { setLoading(false) }
  }

  return (
    <Modal title={isEdit ? 'Edit Material Request' : 'New Material Request'} onClose={onClose}>
      <div className="space-y-4">
        <div className="form-group">
          <label className="label">Material Name *</label>
          <input className="input" value={form.material_name} onChange={e => setForm({...form, material_name: e.target.value})} placeholder="e.g. 2x4x8 Framing Lumber" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="form-group">
            <label className="label">Quantity *</label>
            <input type="number" className="input" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} min="0.1" step="0.1" />
          </div>
          <div className="form-group">
            <label className="label">Unit</label>
            <input className="input" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} placeholder="e.g. each, bags, ft" />
          </div>
        </div>
        <div className="form-group">
          <label className="label">Job *</label>
          <select className="input" value={form.job_id} onChange={e => setForm({...form, job_id: e.target.value})}>
            <option value="">Select job...</option>
            {jobs.filter(j => j.status === 'active').map(j => (
              <option key={j.id} value={j.id}>{j.job_number} — {j.job_name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="form-group">
            <label className="label">Needed By</label>
            <input type="date" className="input" value={form.needed_by_date} onChange={e => setForm({...form, needed_by_date: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="label">Priority</label>
            <select className="input" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="label">Notes</label>
          <textarea className="input min-h-[72px]" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Specifications, supplier preferences..." />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={handleSubmit} disabled={loading || !form.material_name || !form.job_id} className="btn-primary">
            {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Submit Request'}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}

function StatusModal({ mr, onSave, onClose }) {
  const [status, setStatus] = useState(mr.status)
  const [denialReason, setDenialReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    try {
      await onSave(mr.id, { status, denial_reason: denialReason || undefined })
      onClose()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error')
    } finally { setLoading(false) }
  }

  return (
    <Modal title={`Update Status — ${mr.material_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="form-group">
          <label className="label">New Status</label>
          <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="requested">Requested</option>
            <option value="approved">Approved</option>
            <option value="ordered">Ordered</option>
            <option value="delivered">Delivered</option>
            <option value="denied">Denied</option>
          </select>
        </div>
        {status === 'denied' && (
          <div className="form-group">
            <label className="label">Denial Reason</label>
            <textarea className="input" value={denialReason} onChange={e => setDenialReason(e.target.value)} placeholder="Explain why this request is being denied..." />
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={loading} className="btn-primary">Update Status</button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}

export default function MaterialRequestsPage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [jobs, setJobs] = useState([])
  const [costCodes, setCostCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editMR, setEditMR] = useState(null)
  const [statusMR, setStatusMR] = useState(null)

  const load = () => {
    setLoading(true)
    materialRequestsApi.list().then(r => setRequests(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    jobsApi.list().then(r => setJobs(r.data))
    costCodesApi.list().then(r => setCostCodes(r.data))
  }, [])

  const handleCreate = async (data) => {
    await materialRequestsApi.create(data)
    load()
  }

  const handleUpdate = async (id, data) => {
    await materialRequestsApi.update(id, data)
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this request?')) return
    await materialRequestsApi.delete(id)
    load()
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)

  const canManage = user?.role === 'admin' || user?.role === 'supervisor'

  const statuses = ['all', 'requested', 'approved', 'ordered', 'delivered', 'denied']

  return (
    <div>
      <PageHeader
        title="Material Requests"
        subtitle="Request and track materials needed on job sites"
        action={<button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" />New Request</button>}
      />

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {statuses.map(s => {
          const count = s === 'all' ? requests.length : requests.filter(r => r.status === s).length
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === s ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
            >
              {s} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
            </button>
          )
        })}
      </div>

      {loading ? <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div> : (
        filtered.length === 0 ? (
          <EmptyState icon={Package} title="No material requests" description={filter === 'all' ? 'Submit your first material request to get started.' : `No ${filter} requests.`} />
        ) : (
          <div className="space-y-3">
            {filtered.map(mr => (
              <div key={mr.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-100">{mr.material_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PRIORITY_COLORS[mr.priority]}`}>{mr.priority}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[mr.status]}`}>{mr.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                      <span><span className="text-slate-500">Qty:</span> <span className="text-slate-300 font-medium">{mr.quantity} {mr.unit}</span></span>
                      <span><span className="text-slate-500">Job:</span> <span className="text-slate-300">{mr.job_number} — {mr.job_name}</span></span>
                      <span><span className="text-slate-500">By:</span> <span className="text-slate-300">{mr.requested_by}</span></span>
                      {mr.needed_by_date && <span><span className="text-slate-500">Needed:</span> <span className="text-slate-300">{mr.needed_by_date}</span></span>}
                    </div>
                    {mr.notes && <p className="text-xs text-slate-500 mt-1.5 italic">{mr.notes}</p>}
                    {mr.status === 'denied' && mr.denial_reason && (
                      <p className="text-xs text-red-400 mt-1.5">Denied: {mr.denial_reason}</p>
                    )}
                    {mr.approved_by && (
                      <p className="text-xs text-slate-500 mt-1">Actioned by {mr.approved_by}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canManage && (
                      <button onClick={() => setStatusMR(mr)} className="btn-secondary py-1 px-2 text-xs">
                        Update Status
                      </button>
                    )}
                    {(mr.status === 'requested' && (user?.role === 'worker' || canManage)) && (
                      <button onClick={() => setEditMR(mr)} className="text-slate-500 hover:text-slate-300 p-1">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {mr.status === 'requested' && (
                      <button onClick={() => handleDelete(mr.id)} className="text-slate-600 hover:text-red-400 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {showCreate && (
        <MRModal jobs={jobs} costCodes={costCodes} onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editMR && (
        <MRModal mr={editMR} jobs={jobs} costCodes={costCodes} onSave={(d) => handleUpdate(editMR.id, d)} onClose={() => setEditMR(null)} />
      )}
      {statusMR && (
        <StatusModal mr={statusMR} onSave={handleUpdate} onClose={() => setStatusMR(null)} />
      )}
    </div>
  )
}
