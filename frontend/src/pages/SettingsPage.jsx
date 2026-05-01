import { useEffect, useState } from 'react'
import { settingsApi } from '../utils/api'
import { PageHeader, LoadingSpinner } from '../components/common'
import { Settings, Save, CheckCircle2 } from 'lucide-react'

export default function SettingsPage() {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    settingsApi.get()
      .then(r => setForm(r.data))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const r = await settingsApi.update(form)
      setForm(r.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      alert(e.response?.data?.detail || 'Error saving settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
  if (!form) return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Configure FieldOps for your company" />
      <div className="card text-center py-10 text-slate-500">Could not load settings. Check that the backend is running.</div>
    </div>
  )

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Configure FieldOps for your company" />

      <div className="card space-y-5">
        <div className="form-group">
          <label className="label">Company Name</label>
          <input
            className="input"
            value={form.company_name || ''}
            onChange={e => setForm({...form, company_name: e.target.value})}
            placeholder="Your company name"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-group">
            <label className="label">Default Pay Type</label>
            <select className="input" value={form.default_pay_type || 'Regular'} onChange={e => setForm({...form, default_pay_type: e.target.value})}>
              <option value="Regular">Regular</option>
              <option value="OT">Overtime (OT)</option>
              <option value="DT">Double Time (DT)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="label">Overtime Threshold (hrs/day)</label>
            <input
              type="number"
              className="input"
              value={form.overtime_threshold || 8}
              onChange={e => setForm({...form, overtime_threshold: parseFloat(e.target.value)})}
              min="4" max="16" step="0.5"
            />
            <p className="text-xs text-slate-500 mt-1">Hours per day before overtime kicks in</p>
          </div>
        </div>

        <div className="form-group">
          <label className="label">Sage Export Format</label>
          <select className="input" value={form.sage_export_format || 'sage_100'} onChange={e => setForm({...form, sage_export_format: e.target.value})}>
            <option value="sage_100">Sage 100 Contractor</option>
            <option value="sage_300">Sage 300 CRE</option>
            <option value="sage_intacct">Sage Intacct (future)</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">Determines CSV column format on export</p>
        </div>

        <div className="form-group">
          <label className="label">Upload Directory</label>
          <input
            className="input font-mono text-sm"
            value={form.upload_dir || 'uploads'}
            onChange={e => setForm({...form, upload_dir: e.target.value})}
            placeholder="uploads"
          />
          <p className="text-xs text-slate-500 mt-1">Where receipt and photo uploads are stored on the server</p>
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center gap-4">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Settings saved
            </div>
          )}
        </div>
      </div>

      {/* Phase 3 Placeholder */}
      <div className="card mt-5 opacity-50 pointer-events-none">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Phase 3 — Coming Soon</p>
        <div className="space-y-2 text-sm text-slate-600">
          <p>🔗 Direct Sage API connection (pull employees, jobs, cost codes)</p>
          <p>📦 Vendor management and price comparison</p>
          <p>🧾 Purchase order approval workflow</p>
          <p>📊 Inventory tracking per job site</p>
          <p>🤖 AI missing-time detection and job cost warnings</p>
        </div>
      </div>
    </div>
  )
}
