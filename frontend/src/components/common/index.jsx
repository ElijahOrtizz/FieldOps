import { CheckCircle2, Clock, XCircle, Upload, FileText } from 'lucide-react'

export function StatusBadge({ status }) {
  const map = {
    submitted:  { cls: 'badge-submitted', label: 'Pending', Icon: Clock },
    approved:   { cls: 'badge-approved', label: 'Approved', Icon: CheckCircle2 },
    rejected:   { cls: 'badge-rejected', label: 'Rejected', Icon: XCircle },
    exported:   { cls: 'badge-exported', label: 'Exported', Icon: Upload },
    draft:      { cls: 'badge-draft', label: 'Draft', Icon: FileText },
  }
  const { cls, label, Icon } = map[status] || map.draft
  return (
    <span className={cls}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  )
}

export function LoadingSpinner({ size = 'md' }) {
  const sz = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }[size]
  return (
    <div className={`${sz} border-2 border-brand-600 border-t-transparent rounded-full animate-spin`} />
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon className="w-10 h-10 text-gray-300 dark:text-slate-700 mb-3" />}
      <p className="text-gray-500 dark:text-slate-400 font-medium">{title}</p>
      {description && <p className="text-gray-400 dark:text-slate-600 text-sm mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function StatCard({ label, value, sub, icon: Icon, color = 'brand' }) {
  const colors = {
    brand: 'text-brand-500 dark:text-brand-400',
    green: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    purple: 'text-purple-600 dark:text-purple-400',
  }
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">{label}</p>
        {Icon && <Icon className={`w-4 h-4 ${colors[color]}`} />}
      </div>
      <p className={`text-3xl font-bold ${colors[color]} mt-1`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-slate-500">{sub}</p>}
    </div>
  )
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white border border-gray-200 dark:bg-slate-900 dark:border-slate-800 rounded-2xl shadow-2xl w-full ${widths[size]} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, danger = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-gray-700 dark:text-slate-300 text-sm mb-5">{message}</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className={danger ? 'btn-danger' : 'btn-primary'}
        >
          Confirm
        </button>
      </div>
    </Modal>
  )
}
