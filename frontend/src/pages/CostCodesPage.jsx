import { useEffect, useState } from 'react'
import { costCodesApi } from '../utils/api'
import { PageHeader, EmptyState, LoadingSpinner, Modal } from '../components/common'
import { Tag, Plus, Edit2, ToggleLeft } from 'lucide-react'

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t) }, [onDone])
  return (
    <div className={`fixed bottom-6 right-6 z-50 ${type === 'error' ? 'bg-red-600' : 'bg-emerald-600'} text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl`}>
      {msg}
    </div>
  )
}

function CostCodeForm({ cc, onSave, onClose }) {
  const [form, setForm] = useState({
    code: cc?.code || '',
    description: cc?.description || '',
    category: cc?.category || 'Labor',
    sage_cost_code: cc?.sage_cost_code || '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (cc) await costCodesApi.update(cc.id, form)
      else await costCodesApi.create(form)
      onSave()
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Code *</label>
          <input className="input font-mono" value={form.code} onChange={e => setForm({...form, code: e.target.value})} required disabled={!!cc} />
        </div>
        <div className="form-group">
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
            <option>Labor</option>
            <option>Equipment</option>
            <option>Material</option>
            <option>Subcontract</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="label">Description *</label>
        <input className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} required />
      </div>
      <div className="form-group">
        <label className="label">Sage Cost Code <span className="text-gray-400 dark:text-slate-600 normal-case font-normal">(for future Sage sync)</span></label>
        <input className="input font-mono" placeholder="SAGE-CC-XX-000" value={form.sage_cost_code} onChange={e => setForm({...form, sage_cost_code: e.target.value})} />
      </div>
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary">{cc ? 'Save Changes' : 'Add Code'}</button>
      </div>
    </form>
  )
}

export default function CostCodesPage() {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)

  const load = () => {
    setLoading(true)
    costCodesApi.list().then(res => setCodes(res.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDeactivate = async (id) => {
    if (!confirm('Deactivate this cost code?')) return
    await costCodesApi.delete(id)
    load()
  }

  const categories = ['Labor', 'Equipment', 'Material', 'Subcontract']
  const grouped = categories.reduce((acc, cat) => {
    acc[cat] = codes.filter(cc => cc.category === cat)
    return acc
  }, {})

  return (
    <div>
      <PageHeader
        title="Cost Codes"
        subtitle={`${codes.filter(c => c.is_active).length} active cost codes`}
        action={
          <button onClick={() => setModal('create')} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Code
          </button>
        }
      />

      {loading ? <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div> : (
        <div className="space-y-5">
          {categories.filter(cat => grouped[cat].length > 0).map(cat => (
            <div key={cat} className="card">
              <h3 className="font-semibold text-gray-600 dark:text-slate-300 mb-3 text-sm uppercase tracking-wider">{cat}</h3>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="th">Code</th>
                    <th className="th">Description</th>
                    <th className="th">Sage Code</th>
                    <th className="th">Status</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[cat].map(cc => (
                    <tr key={cc.id} className={`table-row ${!cc.is_active ? 'opacity-40' : ''}`}>
                      <td className="td font-mono font-semibold text-brand-400">{cc.code}</td>
                      <td className="td">{cc.description}</td>
                      <td className="td font-mono text-xs text-gray-500 dark:text-slate-500">{cc.sage_cost_code || '—'}</td>
                      <td className="td">
                        <span className={`text-xs font-medium ${cc.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-600'}`}>
                          {cc.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="td">
                        <div className="flex gap-1">
                          <button onClick={() => setModal(cc)} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {cc.is_active && (
                            <button onClick={() => handleDeactivate(cc.id)} className="p-1.5 rounded-lg hover:bg-amber-500/10 text-gray-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400">
                              <ToggleLeft className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {codes.length === 0 && <div className="card"><EmptyState icon={Tag} title="No cost codes" /></div>}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Cost Code' : 'Edit Cost Code'}>
        {modal && <CostCodeForm cc={modal === 'create' ? null : modal} onSave={() => { setModal(null); load(); setToast({ msg: 'Cost code saved', type: 'success' }) }} onClose={() => setModal(null)} />}
      </Modal>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
