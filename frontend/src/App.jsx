import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import WorkerDashboard from './pages/WorkerDashboard'
import NewTimeEntry from './pages/NewTimeEntry'
import MyTimeEntries from './pages/MyTimeEntries'
import SupervisorDashboard from './pages/SupervisorDashboard'
import ApprovalQueue from './pages/ApprovalQueue'
import AdminDashboard from './pages/AdminDashboard'
import EmployeesPage from './pages/EmployeesPage'
import JobsPage from './pages/JobsPage'
import CostCodesPage from './pages/CostCodesPage'
import TimeEntriesPage from './pages/TimeEntriesPage'
import ExportPage from './pages/ExportPage'
import ReportsPage from './pages/ReportsPage'
// Phase 2
import MaterialRequestsPage from './pages/MaterialRequestsPage'
import AuditLogPage from './pages/AuditLogPage'
import ExportHistoryPage from './pages/ExportHistoryPage'
import SettingsPage from './pages/SettingsPage'
import WeeklyTimecardsPage from './pages/WeeklyTimecardsPage'
import CrewSchedulePage from './pages/CrewSchedulePage'
import DailyReviewPage from './pages/DailyReviewPage'

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function HomeRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  if (user.role === 'supervisor') return <Navigate to="/supervisor" replace />
  return <Navigate to="/worker" replace />
}

export default function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={user ? <HomeRedirect /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<HomeRedirect />} />

        {/* Worker routes */}
        <Route path="worker" element={<ProtectedRoute roles={['worker', 'supervisor', 'admin']}><WorkerDashboard /></ProtectedRoute>} />
        <Route path="worker/new-entry" element={<ProtectedRoute roles={['worker', 'supervisor', 'admin']}><NewTimeEntry /></ProtectedRoute>} />
        <Route path="worker/my-entries" element={<ProtectedRoute roles={['worker', 'supervisor', 'admin']}><MyTimeEntries /></ProtectedRoute>} />
        <Route path="worker/material-requests" element={<ProtectedRoute roles={['worker', 'supervisor', 'admin']}><MaterialRequestsPage /></ProtectedRoute>} />

        {/* Supervisor routes */}
        <Route path="supervisor" element={<ProtectedRoute roles={['supervisor', 'admin']}><SupervisorDashboard /></ProtectedRoute>} />
        <Route path="supervisor/approvals" element={<ProtectedRoute roles={['supervisor', 'admin']}><ApprovalQueue /></ProtectedRoute>} />

        {/* Admin routes */}
        <Route path="admin" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="admin/employees" element={<ProtectedRoute roles={['admin']}><EmployeesPage /></ProtectedRoute>} />
        <Route path="admin/jobs" element={<ProtectedRoute roles={['admin', 'supervisor']}><JobsPage /></ProtectedRoute>} />
        <Route path="admin/cost-codes" element={<ProtectedRoute roles={['admin']}><CostCodesPage /></ProtectedRoute>} />
        <Route path="admin/time-entries" element={<ProtectedRoute roles={['admin', 'supervisor']}><TimeEntriesPage /></ProtectedRoute>} />
        <Route path="admin/export" element={<ProtectedRoute roles={['admin']}><ExportPage /></ProtectedRoute>} />
        <Route path="admin/export-history" element={<ProtectedRoute roles={['admin']}><ExportHistoryPage /></ProtectedRoute>} />
        <Route path="admin/settings" element={<ProtectedRoute roles={['admin']}><SettingsPage /></ProtectedRoute>} />
        <Route path="admin/audit-log" element={<ProtectedRoute roles={['admin', 'supervisor']}><AuditLogPage /></ProtectedRoute>} />

        {/* Shared routes */}
        <Route path="material-requests" element={<ProtectedRoute roles={['admin', 'supervisor']}><MaterialRequestsPage /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute roles={['admin', 'supervisor']}><ReportsPage /></ProtectedRoute>} />
        <Route path="weekly-timecards" element={<ProtectedRoute roles={['admin', 'supervisor']}><WeeklyTimecardsPage /></ProtectedRoute>} />
        <Route path="crew-schedule" element={<ProtectedRoute roles={['admin', 'supervisor', 'worker']}><CrewSchedulePage /></ProtectedRoute>} />
        <Route path="daily-review" element={<ProtectedRoute roles={['admin', 'supervisor']}><DailyReviewPage /></ProtectedRoute>} />
      </Route>
    </Routes>
  )
}
