import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HardHat, Lock, Mail, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const result = await login(email, password)
    if (result.success) {
      navigate('/')
    } else {
      setError(result.error)
    }
  }

  const demoLogin = async (role) => {
    const creds = {
      admin: { email: 'admin@fieldops.com', password: 'admin123' },
      supervisor: { email: 'supervisor@fieldops.com', password: 'super123' },
      worker: { email: 'worker1@fieldops.com', password: 'work123' },
    }
    const c = creds[role]
    setEmail(c.email)
    setPassword(c.password)
    const result = await login(c.email, c.password)
    if (result.success) navigate('/')
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(#3388ff 1px, transparent 1px), linear-gradient(90deg, #3388ff 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-600/25">
            <HardHat className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Stryda</h1>
          <p className="text-slate-500 text-sm mt-1">Field Operations Platform</p>
        </div>

        {/* Form */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-5">Sign in to your account</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="email"
                  className="input pl-9"
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input pl-9 pr-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-2">
              {loading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : 'Sign In'}
            </button>
          </form>

          {/* Demo logins */}
          <div className="mt-5 pt-4 border-t border-gray-200 dark:border-slate-800">
            <p className="text-xs text-gray-500 dark:text-slate-500 mb-2 text-center">Demo accounts</p>
            <div className="grid grid-cols-3 gap-2">
              {['admin', 'supervisor', 'worker'].map(role => (
                <button
                  key={role}
                  onClick={() => demoLogin(role)}
                  className="text-xs py-1.5 px-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 capitalize transition-colors"
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-4">
          Stryda — Sage-ready field time tracking
        </p>
      </div>
    </div>
  )
}
