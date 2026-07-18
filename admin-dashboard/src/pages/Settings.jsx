import { useState } from 'react'
import api from '../services/api'
import { Eye, EyeOff, Save, UserPlus, Key, CheckCircle, AlertCircle, Loader } from 'lucide-react'

// ✅ OUTSIDE component - prevents remount on each keystroke
const InputField = ({ label, type = 'text', value, onChange, placeholder, showToggle, showValue, onToggle }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <div className="relative">
      <input
        type={showToggle ? (showValue ? 'text' : 'password') : type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 pr-10"
        required
      />
      {showToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  </div>
)

const ResultBanner = ({ result }) => {
  if (!result) return null
  return (
    <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
      {result.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      {result.message}
    </div>
  )
}

const Settings = () => {
  const [activeTab, setActiveTab] = useState('password')

  // Password change state
  const [pwForm, setPwForm]     = useState({ email: '', currentPassword: '', newPassword: '', confirmPassword: '' })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew]   = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwResult, setPwResult]   = useState(null)

  // Create agent state
  const [agentForm, setAgentForm]     = useState({ name: '', email: '', password: '', role: 'agent', websiteDomain: '' })
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentResult, setAgentResult]   = useState(null)

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (!pwForm.email) {
      setPwResult({ success: false, message: 'Email Address is required' })
      return
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwResult({ success: false, message: 'New passwords do not match' })
      return
    }
    if (pwForm.newPassword.length < 6) {
      setPwResult({ success: false, message: 'Password must be at least 6 characters' })
      return
    }
    setPwLoading(true)
    setPwResult(null)
    try {
      await api.post('/admin/agents/change-password', {
        email: pwForm.email,
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword
      })
      setPwResult({ success: true, message: 'Password changed successfully!' })
      setPwForm({ email: '', currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      setPwResult({ success: false, message: error.response?.data?.error || 'Failed to change password' })
    } finally {
      setPwLoading(false)
    }
  }

  const handleCreateAgent = async (e) => {
    e.preventDefault()
    setAgentLoading(true)
    setAgentResult(null)
    try {
      await api.post('/admin/agents', agentForm)
      setAgentResult({ success: true, message: `Agent "${agentForm.name}" created successfully!` })
      setAgentForm({ name: '', email: '', password: '', role: 'agent', websiteDomain: '' })
    } catch (error) {
      setAgentResult({ success: false, message: error.response?.data?.error || 'Failed to create agent' })
    } finally {
      setAgentLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage account and team settings</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6">
          {[
            { key: 'password',     label: '🔑 Change Password' },
            { key: 'create-agent', label: '👤 Create Agent'    }
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Change Password ─────────────────────────── */}
      {activeTab === 'password' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-primary-100 p-2.5 rounded-xl">
              <Key className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Change Password</h3>
              <p className="text-sm text-gray-500">Update your account password</p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <InputField
              label="Email Address"
              type="email"
              value={pwForm.email}
              onChange={e => setPwForm(p => ({ ...p, email: e.target.value }))}
              placeholder="admin@support.com"
            />
            <InputField
              label="Current Password"
              value={pwForm.currentPassword}
              onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
              placeholder="Enter current password"
              showToggle
              showValue={showCurrent}
              onToggle={() => setShowCurrent(v => !v)}
            />
            <InputField
              label="New Password"
              value={pwForm.newPassword}
              onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
              placeholder="Min 6 characters"
              showToggle
              showValue={showNew}
              onToggle={() => setShowNew(v => !v)}
            />
            <InputField
              label="Confirm New Password"
              value={pwForm.confirmPassword}
              onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
              placeholder="Confirm new password"
              showToggle
              showValue={showConfirm}
              onToggle={() => setShowConfirm(v => !v)}
            />

            <ResultBanner result={pwResult} />

            <button type="submit" disabled={pwLoading}
              className="w-full py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium">
              {pwLoading
                ? <><Loader className="h-4 w-4 animate-spin" /> Changing...</>
                : <><Save className="h-4 w-4" /> Change Password</>
              }
            </button>
          </form>
        </div>
      )}

      {/* ── Create Agent ────────────────────────────── */}
      {activeTab === 'create-agent' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-green-100 p-2.5 rounded-xl">
              <UserPlus className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Create New Agent</h3>
              <p className="text-sm text-gray-500">Add a new team member to the support panel</p>
            </div>
          </div>

          <form onSubmit={handleCreateAgent} className="space-y-4">
            <InputField
              label="Full Name"
              type="text"
              value={agentForm.name}
              onChange={e => setAgentForm(p => ({ ...p, name: e.target.value }))}
              placeholder="John Doe"
            />
            <InputField
              label="Email Address"
              type="email"
              value={agentForm.email}
              onChange={e => setAgentForm(p => ({ ...p, email: e.target.value }))}
              placeholder="agent@company.com"
            />
            <InputField
              label="Password"
              value={agentForm.password}
              onChange={e => setAgentForm(p => ({ ...p, password: e.target.value }))}
              placeholder="Min 6 characters"
              showToggle
              showValue={false}
              onToggle={() => {}}
            />
            <InputField
              label="Website Domain"
              type="text"
              value={agentForm.websiteDomain}
              onChange={e => setAgentForm(p => ({ ...p, websiteDomain: e.target.value }))}
              placeholder="e.g. clientwebsite.com"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select value={agentForm.role}
                onChange={e => setAgentForm(p => ({ ...p, role: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500">
                <option value="agent">Agent (Support Staff)</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
              <strong>Role permissions:</strong><br />
              Agent: View and respond to chats<br />
              Admin: Full access + manage team<br />
              Super Admin: All permissions + settings
            </div>

            <ResultBanner result={agentResult} />

            <button type="submit" disabled={agentLoading}
              className="w-full py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium">
              {agentLoading
                ? <><Loader className="h-4 w-4 animate-spin" /> Creating...</>
                : <><UserPlus className="h-4 w-4" /> Create Agent</>
              }
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export default Settings