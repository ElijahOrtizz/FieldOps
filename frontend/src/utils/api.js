import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
}

export const employeesApi = {
  list: (activeOnly = true) => api.get(`/employees?active_only=${activeOnly}`),
  get: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  delete: (id) => api.delete(`/employees/${id}`),
}

export const jobsApi = {
  list: (activeOnly = false) => api.get(`/jobs?active_only=${activeOnly}`),
  get: (id) => api.get(`/jobs/${id}`),
  create: (data) => api.post('/jobs', data),
  update: (id, data) => api.put(`/jobs/${id}`, data),
  delete: (id) => api.delete(`/jobs/${id}`),
}

export const costCodesApi = {
  list: () => api.get('/cost-codes'),
  create: (data) => api.post('/cost-codes', data),
  update: (id, data) => api.put(`/cost-codes/${id}`, data),
  delete: (id) => api.delete(`/cost-codes/${id}`),
}

export const timeEntriesApi = {
  list: (params = {}) => api.get('/time-entries', { params }),
  get: (id) => api.get(`/time-entries/${id}`),
  create: (data) => api.post('/time-entries', data),
  update: (id, data) => api.put(`/time-entries/${id}`, data),
  delete: (id) => api.delete(`/time-entries/${id}`),
  getAudit: (id) => api.get(`/time-entries/${id}/audit`),
  approve: (id, data = {}) => api.post(`/time-entries/${id}/approve`, data),
  reject: (id, data = {}) => api.post(`/time-entries/${id}/reject`, data),
  needsCorrection: (id, data = {}) => api.post(`/time-entries/${id}/needs-correction`, data),
  uploadReceipt: (id, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/time-entries/${id}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}

export const approvalsApi = {
  queue: () => api.get('/approvals/queue'),
  process: (entryId, data) => api.post(`/approvals/${entryId}`, data),
  bulkApprove: (ids) => api.post('/approvals/bulk', ids),
  editEntry: (entryId, data) => api.put(`/approvals/${entryId}/edit`, data),
  approveWeek: (data) => api.post('/approvals/approve-week', data),
  bulkApproveIds: (data) => api.post('/approvals/bulk-approve-ids', data),
}

export const exportApi = {
  sageCsv: (params = {}) => api.get('/export/sage-csv', {
    params,
    responseType: 'blob',
  }),
  summary: (params = {}) => api.get('/export/summary', { params }),
  history: () => api.get('/export/history'),
  preview: (params = {}) => api.get('/export/preview', { params }),
}

export const reportsApi = {
  dashboard: () => api.get('/reports/dashboard'),
  jobCost: (jobId) => api.get('/reports/job-cost', { params: jobId ? { job_id: jobId } : {} }),
  byEmployee: (params = {}) => api.get('/reports/by-employee', { params }),
  statusSummary: () => api.get('/reports/status-summary'),
  weeklyCrews: (weekStart) => api.get('/reports/weekly-crew', { params: weekStart ? { week_start: weekStart } : {} }),
  weeklyTimecards: (params = {}) => api.get('/reports/weekly-timecards', { params }),
  jobCostSnapshot: (weekStart) => api.get('/reports/job-cost-snapshot', { params: weekStart ? { week_start: weekStart } : {} }),
}

export const materialRequestsApi = {
  list: (params = {}) => api.get('/material-requests', { params }),
  create: (data) => api.post('/material-requests', data),
  update: (id, data) => api.put(`/material-requests/${id}`, data),
  delete: (id) => api.delete(`/material-requests/${id}`),
}

export const auditLogsApi = {
  list: (params = {}) => api.get('/audit-logs', { params }),
}

export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
}

export const usersApi = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
}

export default api

export const sageApi = {
  prepare: (data) => api.post('/sage/prepare', data),
  sync: (data) => api.post('/sage/sync', data),
  status: (weekStart) => api.get('/sage/status', { params: weekStart ? { week_start: weekStart } : {} }),
}

export const payrollLocksApi = {
  list: () => api.get('/payroll-locks'),
  check: (weekStart) => api.get('/payroll-locks/check', { params: { week_start: weekStart } }),
  lock: (data) => api.post('/payroll-locks/lock', data),
  unlock: (data) => api.post('/payroll-locks/unlock', data),
}

export const scheduleApi = {
  weekly: (params = {}) => api.get('/schedule/weekly', { params }),
  assign: (data) => api.post('/schedule/assign', data),
  bulkAssign: (data) => api.post('/schedule/bulk-assign', data),
  update: (id, data) => api.patch(`/schedule/assignments/${id}`, data),
  remove: (id) => api.delete(`/schedule/assignments/${id}`),
  variance: (params = {}) => api.get('/schedule/variance', { params }),
  today: () => api.get('/schedule/today'),
}

export const workerApi = {
  today: () => api.get('/worker/today'),
  clockIn: (data) => api.post('/worker/clock-in', data),
  clockOut: (data = {}) => api.post('/worker/clock-out', data),
  recentTime: () => api.get('/worker/recent-time'),
  requestCorrection: (data) => api.post('/worker/request-correction', data),
}

export const dailyReviewApi = {
  get: (params = {}) => api.get('/supervisor/daily-review', { params }),
  approveEntry: (id, data = {}) => api.post(`/supervisor/time-entries/${id}/approve`, data),
  rejectEntry: (id, data = {}) => api.post(`/supervisor/time-entries/${id}/reject`, data),
  needsCorrection: (id, data = {}) => api.post(`/supervisor/time-entries/${id}/needs-correction`, data),
  markAbsent: (data) => api.post('/supervisor/mark-absent', data),
  approveCorrection: (id, data = {}) => api.post(`/supervisor/correction-requests/${id}/approve`, data),
  rejectCorrection: (id, data = {}) => api.post(`/supervisor/correction-requests/${id}/reject`, data),
  signoff: (data) => api.post('/supervisor/daily-signoff', data),
}
