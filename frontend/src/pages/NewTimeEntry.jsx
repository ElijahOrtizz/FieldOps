import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { jobsApi, costCodesApi, timeEntriesApi } from '../utils/api'
import { PageHeader } from '../components/common'
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

export default function NewTimeEntry() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [costCodes, setCostCodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '07:00',
    end_time: '15:30',
    total_hours: '8.5',
    job_id: '',
    cost_code_id: '',
    pay_type: 'Regular',
    notes: '',
  })

  useEffect(() => {
    Promise.all([
      jobsApi.list(true),
      costCodesApi.list()
    ]).then(([jobsRes, ccRes]) => {
      setJobs(jobsRes.data)
      setCostCodes(ccRes.data)
    })
  }, [])

  const calcHours = (start, end) => {
    if (!start || !end) return ''
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const total = (eh * 60 + em) - (sh * 60 + sm)
    if (total <= 0) return ''
    return (total / 60).toFixed(1)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    const updated = { ...form, [name]: value }
    if (name === 'start_time' || name === 'end_time') {
      const h = calcHours(
        name === 'start_time' ? value : form.start_time,
        name === 'end_time' ? value : form.end_time
      )
      if (h) updated.total_hours = h
    }
    setForm(updated)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await timeEntriesApi.create({
        ...form,
        job_id: parseInt(form.job_id),
        cost_code_id: parseInt(form.cost_code_id),
        total_hours: parseFloat(form.total_hours),
      })
      setSuccess(true)
      setTimeout(() => navigate('/worker/my-entries'), 1500)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit entry')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <CheckCircle2 className="w-12 h-12 text-emerald-400" />
        <p className="text-lg font-semibold text-emerald-400">Entry submitted!</p>
        <p className="text-gray-500 dark:text-slate-500 text-sm">Redirecting to your entries...</p>
      </div>
    )
  }

  const laborCodes = costCodes.filter(cc => cc.category === 'Labor')
  const otherCodes = costCodes.filter(cc => cc.category !== 'Labor')

  return (
    <div className="max-w-2xl">
      <PageHeader title="Log Time Entry" subtitle="Submit your hours for supervisor approval" />

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm mb-5 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card space-y-5">
          {/* Row 1: Date + Pay Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="label">Date *</label>
              <input type="date" name="date" className="input" value={form.date} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label className="label">Pay Type</label>
              <select name="pay_type" className="input" value={form.pay_type} onChange={handleChange}>
                <option value="Regular">Regular</option>
                <option value="OT">Overtime (OT)</option>
                <option value="DT">Double Time (DT)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Time */}
          <div className="grid grid-cols-3 gap-4">
            <div className="form-group">
              <label className="label">Start Time</label>
              <input type="time" name="start_time" className="input" value={form.start_time} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="label">End Time</label>
              <input type="time" name="end_time" className="input" value={form.end_time} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="label">Total Hours *</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="number"
                  name="total_hours"
                  className="input pl-9"
                  step="0.25"
                  min="0.25"
                  max="24"
                  value={form.total_hours}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
          </div>

          {form.start_time && form.end_time && (() => {
            const [sh, sm] = form.start_time.split(':').map(Number)
            const [eh, em] = form.end_time.split(':').map(Number)
            return (eh * 60 + em) - (sh * 60 + sm) <= 0
          })() && (
            <p className="text-xs text-red-400 flex items-center gap-1 -mt-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              End time must be after start time
            </p>
          )}

          {/* Job */}
          <div className="form-group">
            <label className="label">Job *</label>
            <select name="job_id" className="input" value={form.job_id} onChange={handleChange} required>
              <option value="">Select a job...</option>
              {jobs.map(job => (
                <option key={job.id} value={job.id}>
                  {job.job_number} — {job.job_name}
                </option>
              ))}
            </select>
          </div>

          {/* Cost Code */}
          <div className="form-group">
            <label className="label">Cost Code *</label>
            <select name="cost_code_id" className="input" value={form.cost_code_id} onChange={handleChange} required>
              <option value="">Select a cost code...</option>
              {laborCodes.length > 0 && (
                <optgroup label="Labor">
                  {laborCodes.map(cc => (
                    <option key={cc.id} value={cc.id}>{cc.code} — {cc.description}</option>
                  ))}
                </optgroup>
              )}
              {otherCodes.length > 0 && (
                <optgroup label="Other">
                  {otherCodes.map(cc => (
                    <option key={cc.id} value={cc.id}>{cc.code} — {cc.description}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="label">Notes</label>
            <textarea
              name="notes"
              className="input resize-none"
              rows={3}
              placeholder="Describe the work performed..."
              value={form.notes}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-4">
          <button type="button" onClick={() => navigate('/worker')} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Clock className="w-4 h-4" /> Submit Entry</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}
