import { useEffect, useState } from 'react'
import { jobsApi } from '../utils/api'
import { PageHeader, EmptyState, LoadingSpinner, Modal } from '../components/common'
import { Briefcase, Plus, Edit2, Archive } from 'lucide-react'

const STATUS_COLORS = {
  active: 'text-emerald-400 bg-emerald-500/10',
  completed: 'text-slate-400 bg-slate-500/10',
  on_hold: 'text-amber-400 bg-amber-500/10',
  archived: 'text-red-400 bg-red-500/10',
}

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t) }, [onDone])
  return (
    <div className={`fixed bottom-6 right-6 z-50 ${type === 'error' ? 'bg-red-600' : 'bg-emerald-600'} text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl`}>
      {msg}
    </div>
  )
}

function JobForm({ job, onSave, onClose }) {
  const [form, setForm] = useState({
    job_number: job?.job_number || '',
    job_name: job?.job_name || '',
    client_name: job?.client_name || '',
    address: job?.address || '',
    city: job?.city || '',
    state: job?.state || '',
    status: job?.status || 'active',
    start_date: job?.start_date || '',
    end_date: job?.end_date || '',
    budget_hours: job?.budget_hours || '',
    budget_cost: job?.budget_cost || '',
    sage_job_id: job?.sage_job_id || '',
    notes: job?.notes || '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    const data = {
      ...form,
      budget_hours: form.budget_hours ? parseFloat(form.budget_hours) : null,
      budget_cost: form.budget_cost ? parseFloat(form.budget_cost) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    }
    try {
      if (job) await jobsApi.update(job.id, data)
      else await jobsApi.create(data)
      onSave()
    } catch (e) {
      alert(e.response?.data?.detail || 'Error saving job')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Job Number *</label>
          <input className="input font-mono" value={form.job_number} onChange={e => setForm({...form, job_number: e.target.value})} required disabled={!!job} />
        </div>
        <div className="form-group">
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="label">Job Name *</label>
        <input className="input" value={form.job_name} onChange={e => setForm({...form, job_name: e.target.value})} required />
      </div>
      <div className="form-group">
        <label className="label">Client Name</label>
        <input className="input" value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="form-group col-span-2">
          <label className="label">City</label>
          <input className="input" value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
        </div>
        <div className="form-group">
          <label className="label">State</label>
          <input className="input" maxLength={2} value={form.state} onChange={e => setForm({...form, state: e.target.value.toUpperCase()})} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Start Date</label>
          <input type="date" className="input" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} />
        </div>
        <div className="form-group">
          <label className="label">End Date</label>
          <input type="date" className="input" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Budget Hours</label>
          <input type="number" className="input" step="0.5" value={form.budget_hours} onChange={e => setForm({...form, budget_hours: e.target.value})} />
        </div>
        <div className="form-group">
          <label className="label">Budget Cost ($)</label>
          <input type="number" className="input" step="100" value={form.budget_cost} onChange={e => setForm({...form, budget_cost: e.target.value})} />
        </div>
      </div>
      <div className="form-group">
        <label className="label">Sage Job ID <span className="text-gray-400 dark:text-slate-600 normal-case font-normal">(for future Sage sync)</span></label>
        <input className="input font-mono" placeholder="SAGE-J-XXX" value={form.sage_job_id} onChange={e => setForm({...form, sage_job_id: e.target.value})} />
      </div>
      <div className="form-group">
        <label className="label">Notes</label>
        <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
      </div>
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary">{job ? 'Save Changes' : 'Create Job'}</button>
      </div>
    </form>
  )
}

export default function JobsPage() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [filter, setFilter] = useState('active')
  const [toast, setToast] = useState(null)

  const load = () => {
    setLoading(true)
    jobsApi.list(false).then(res => setJobs(res.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter)

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle={`${jobs.filter(j => j.status === 'active').length} active jobs`}
        action={
          <button onClick={() => setModal('create')} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Job
          </button>
        }
      />

      <div className="flex gap-2 mb-5">
        {['active', 'on_hold', 'completed', 'all'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${filter === s ? 'bg-brand-600 text-white' : 'bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}>
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div> : (
        <div className="card overflow-x-auto">
          {filtered.length === 0 ? <EmptyState icon={Briefcase} title="No jobs found" /> : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="th">Job</th>
                  <th className="th">Client</th>
                  <th className="th">Location</th>
                  <th className="th">Status</th>
                  <th className="th">Budget Hrs</th>
                  <th className="th">Used Hrs</th>
                  <th className="th">% Used</th>
                  <th className="th">Sage ID</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(job => (
                  <tr key={job.id} className="table-row">
                    <td className="td">
                      <p className="font-mono font-semibold text-brand-600 dark:text-brand-400">{job.job_number}</p>
                      <p className="text-sm text-gray-800 dark:text-slate-200">{job.job_name}</p>
                    </td>
                    <td className="td text-sm">{job.client_name || '—'}</td>
                    <td className="td text-sm text-gray-600 dark:text-slate-400">{[job.city, job.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="td">
                      <span className={`text-xs font-medium capitalize px-2 py-1 rounded-full ${STATUS_COLORS[job.status]}`}>
                        {job.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="td text-sm">{job.budget_hours ? `${job.budget_hours}h` : '—'}</td>
                    <td className="td text-sm font-medium">{job.approved_hours}h</td>
                    <td className="td">
                      {job.budget_used_pct != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${job.budget_used_pct > 90 ? 'bg-red-500' : job.budget_used_pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(100, job.budget_used_pct)}%` }}
                            />
                          </div>
                          <span className={`text-xs ${job.budget_used_pct > 90 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-slate-400'}`}>
                            {job.budget_used_pct}%
                          </span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="td"><span className="font-mono text-xs text-gray-400 dark:text-slate-600">{job.sage_job_id || '—'}</span></td>
                    <td className="td">
                      <button onClick={() => setModal(job)} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Job' : 'Edit Job'} size="lg">
        {modal && <JobForm job={modal === 'create' ? null : modal} onSave={() => { setModal(null); load(); setToast({ msg: 'Job saved', type: 'success' }) }} onClose={() => setModal(null)} />}
      </Modal>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
