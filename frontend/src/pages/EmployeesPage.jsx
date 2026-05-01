import { useEffect, useState } from 'react'
import { employeesApi } from '../utils/api'
import { PageHeader, EmptyState, LoadingSpinner, Modal } from '../components/common'
import { Users, Plus, Edit2, UserX, Search } from 'lucide-react'

const TRADES = ['Laborer', 'Carpenter', 'Foreman', 'Electrician', 'Plumber', 'Ironworker', 'Equipment Operator', 'Mason', 'Drywaller', 'Painter']

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t) }, [onDone])
  return (
    <div className={`fixed bottom-6 right-6 z-50 ${type === 'error' ? 'bg-red-600' : 'bg-emerald-600'} text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl`}>
      {msg}
    </div>
  )
}

function EmployeeForm({ employee, employees, onSave, onClose }) {
  const [form, setForm] = useState({
    employee_number: employee?.employee_number || '',
    first_name: employee?.first_name || '',
    last_name: employee?.last_name || '',
    phone: employee?.phone || '',
    trade: employee?.trade || '',
    pay_type: employee?.pay_type || 'Regular',
    hourly_rate: employee?.hourly_rate || '',
    supervisor_id: employee?.supervisor_id || '',
    sage_employee_id: employee?.sage_employee_id || '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = { ...form, supervisor_id: form.supervisor_id || null, hourly_rate: form.hourly_rate || null }
      if (employee) await employeesApi.update(employee.id, data)
      else await employeesApi.create(data)
      onSave()
    } finally { setLoading(false) }
  }

  const supervisors = employees.filter(e => e.user_role === 'supervisor' || e.user_role === 'admin')

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Employee # *</label>
          <input className="input" value={form.employee_number} onChange={e => setForm({...form, employee_number: e.target.value})} required />
        </div>
        <div className="form-group">
          <label className="label">Trade</label>
          <select className="input" value={form.trade} onChange={e => setForm({...form, trade: e.target.value})}>
            <option value="">Select...</option>
            {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">First Name *</label>
          <input className="input" value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} required />
        </div>
        <div className="form-group">
          <label className="label">Last Name *</label>
          <input className="input" value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
        </div>
        <div className="form-group">
          <label className="label">Pay Type</label>
          <select className="input" value={form.pay_type} onChange={e => setForm({...form, pay_type: e.target.value})}>
            <option>Regular</option><option>OT</option><option>DT</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Hourly Rate ($)</label>
          <input type="number" className="input" step="0.01" value={form.hourly_rate} onChange={e => setForm({...form, hourly_rate: e.target.value})} />
        </div>
        <div className="form-group">
          <label className="label">Supervisor</label>
          <select className="input" value={form.supervisor_id} onChange={e => setForm({...form, supervisor_id: e.target.value})}>
            <option value="">None</option>
            {supervisors.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="label">Sage Employee ID <span className="text-slate-600 normal-case font-normal">(for future Sage sync)</span></label>
        <input className="input font-mono" placeholder="SAGE-E001" value={form.sage_employee_id} onChange={e => setForm({...form, sage_employee_id: e.target.value})} />
      </div>
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {employee ? 'Save Changes' : 'Add Employee'}
        </button>
      </div>
    </form>
  )
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'create' | employee obj
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [toast, setToast] = useState(null)

  const filtered = employees.filter(emp => {
    const matchesSearch = !search ||
      emp.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      emp.employee_number?.toLowerCase().includes(search.toLowerCase())
    const matchesRole = !roleFilter || emp.user_role === roleFilter
    return matchesSearch && matchesRole
  })

  const load = () => {
    setLoading(true)
    employeesApi.list(false).then(res => setEmployees(res.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDeactivate = async (id) => {
    if (!confirm('Deactivate this employee?')) return
    await employeesApi.delete(id)
    load()
  }

  const roleColors = { admin: 'text-purple-400', supervisor: 'text-brand-400', worker: 'text-slate-400' }

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={`${employees.filter(e => e.is_active).length} active employees`}
        action={
          <button onClick={() => setModal('create')} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        }
      />

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-9"
            placeholder="Search by name or employee #..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-40" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="supervisor">Supervisor</option>
          <option value="worker">Worker</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : (
        <div className="card overflow-x-auto">
          {employees.length === 0 ? (
            <EmptyState icon={Users} title="No employees" action={
              <button onClick={() => setModal('create')} className="btn-primary"><Plus className="w-4 h-4" /> Add Employee</button>
            } />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="th">Employee</th>
                  <th className="th">Trade</th>
                  <th className="th">Supervisor</th>
                  <th className="th">App Role</th>
                  <th className="th">Rate</th>
                  <th className="th">Sage ID</th>
                  <th className="th">Status</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(emp => (
                  <tr key={emp.id} className={`table-row ${!emp.is_active ? 'opacity-50' : ''}`}>
                    <td className="td">
                      <p className="font-medium text-slate-200">{emp.full_name}</p>
                      <p className="text-xs font-mono text-slate-500">{emp.employee_number}</p>
                    </td>
                    <td className="td text-sm">{emp.trade || '—'}</td>
                    <td className="td text-sm">{emp.supervisor_name || '—'}</td>
                    <td className="td">
                      <span className={`text-xs font-medium capitalize ${roleColors[emp.user_role] || 'text-slate-500'}`}>
                        {emp.user_role || 'no login'}
                      </span>
                    </td>
                    <td className="td text-sm">{emp.hourly_rate ? `$${emp.hourly_rate}/hr` : '—'}</td>
                    <td className="td">
                      <span className="font-mono text-xs text-slate-500">{emp.sage_employee_id || '—'}</span>
                    </td>
                    <td className="td">
                      <span className={`text-xs font-medium ${emp.is_active ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {emp.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="td">
                      <div className="flex gap-1">
                        <button onClick={() => setModal(emp)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-slate-300">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {emp.is_active && (
                          <button onClick={() => handleDeactivate(emp.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400">
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Employee' : 'Edit Employee'}
        size="lg"
      >
        {modal && (
          <EmployeeForm
            employee={modal === 'create' ? null : modal}
            employees={employees}
            onSave={() => { setModal(null); load(); setToast({ msg: 'Employee saved', type: 'success' }) }}
            onClose={() => setModal(null)}
          />
        )}
      </Modal>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
