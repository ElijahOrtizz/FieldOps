import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import {
  LayoutDashboard, Clock, CheckSquare, Users, CalendarDays, CalendarRange, ClipboardCheck,
  Briefcase, Tag, FileText, Download, BarChart3, Menu, X,
  LogOut, HardHat, Package, History, Settings, Activity, Sun, Moon
} from 'lucide-react'

const workerNav = [
  { to: '/worker', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/worker/new-entry', label: 'Log My Time', icon: Clock },
  { to: '/worker/my-entries', label: 'My Entries', icon: FileText },
  { to: '/worker/material-requests', label: 'Material Requests', icon: Package },
  { to: '/crew-schedule', label: "Today's Schedule", icon: CalendarRange },
]

const supervisorNav = [
  { to: '/supervisor', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/supervisor/approvals', label: 'Approval Queue', icon: CheckSquare },
  { to: '/admin/time-entries', label: 'Crew Time', icon: FileText },
  { to: '/material-requests', label: 'Material Requests', icon: Package },
  { to: '/weekly-timecards', label: 'Weekly Timecards', icon: CalendarDays },
  { to: '/crew-schedule', label: 'Crew Schedule', icon: CalendarRange },
  { to: '/daily-review', label: 'Daily Review', icon: ClipboardCheck },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/audit-log', label: 'Activity Log', icon: Activity },
]

const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/supervisor/approvals', label: 'Approval Queue', icon: CheckSquare },
  { to: '/admin/time-entries', label: 'Time Entries', icon: FileText },
  { to: '/admin/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/cost-codes', label: 'Cost Codes', icon: Tag },
  { to: '/material-requests', label: 'Material Requests', icon: Package },
  { to: '/weekly-timecards', label: 'Weekly Timecards', icon: CalendarDays },
  { to: '/crew-schedule', label: 'Crew Schedule', icon: CalendarRange },
  { to: '/daily-review', label: 'Daily Review', icon: ClipboardCheck },
  { to: '/admin/export', label: 'Export to Sage', icon: Download },
  { to: '/admin/export-history', label: 'Export History', icon: History },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/audit-log', label: 'Audit Log', icon: Activity },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

function NavSection({ title, links }) {
  return (
    <div className="mb-4">
      {title && <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 mb-2">{title}</p>}
      <nav className="space-y-0.5">
        {links.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navLinks = user?.role === 'admin' ? adminNav
    : user?.role === 'supervisor' ? supervisorNav
    : workerNav

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 pt-5 pb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <HardHat className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-slate-100 text-base tracking-tight">FieldOps</span>
            <span className="text-[10px] text-slate-500 block -mt-0.5">v2.0 · Field Operations</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 px-2 overflow-y-auto">
        <NavSection links={navLinks} />

        {/* Field entry sub-nav for supervisors/admins */}
        {user?.role !== 'worker' && (
          <NavSection title="Field Entry" links={[
            { to: '/worker/new-entry', label: 'Log My Time', icon: Clock },
            { to: '/worker/my-entries', label: 'My Entries', icon: FileText },
          ]} />
        )}
      </div>

      {/* User info */}
      <div className="border-t border-slate-800 p-3">
        <div className="flex items-center gap-3 px-1 mb-2">
          <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold text-brand-200 shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
            <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors shrink-0"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
        <button onClick={handleLogout} className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-slate-900 border-r border-slate-800 shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 border-r border-slate-800">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 text-slate-400">
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
          <button onClick={() => setMobileOpen(true)} className="text-slate-400">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <HardHat className="w-4 h-4 text-brand-400" />
            <span className="font-bold text-sm">FieldOps</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
