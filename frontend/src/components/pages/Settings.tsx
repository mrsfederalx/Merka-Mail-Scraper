import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Key,
  Sliders,
  Shield,
  Save,
  Database,
  CheckCircle,
  AlertCircle,
  Users,
  Loader2,
  Upload,
  Download,
  Plus,
  Trash2,
  Edit2,
  LogIn,
  X,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  RotateCcw,
  Building2,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useApi } from '../../hooks/useApi'

/* ------------------------------------------------------------------ */
/*  Types matching the backend GET /api/settings response shape        */
/* ------------------------------------------------------------------ */

interface SettingsApiKeys {
  gemini_api_key: string
  groq_api_key: string
  ollama_url: string
}

interface SettingsProcessing {
  default_delay_ms: number
  default_concurrency: number
  default_timeout_ms: number
  max_retries: number
  [key: string]: unknown
}

interface SettingsProxy {
  enabled: boolean
  proxy_list: string[]
  rotation_strategy: string
}

interface SettingsPayload {
  version?: string
  active_client?: string
  api_keys: SettingsApiKeys
  processing: SettingsProcessing
  proxy: SettingsProxy
  ai_classification?: Record<string, unknown>
  email_discovery?: Record<string, unknown>
  linkedin_dorking?: Record<string, unknown>
}

/* ------------------------------------------------------------------ */
/*  Key-test status type                                               */
/* ------------------------------------------------------------------ */

interface ApiKeyStatus {
  gemini: 'untested' | 'testing' | 'valid' | 'invalid'
  groq: 'untested' | 'testing' | 'valid' | 'invalid'
  ollama: 'untested' | 'testing' | 'valid' | 'invalid'
}

/* ------------------------------------------------------------------ */
/*  Feedback banner type                                               */
/* ------------------------------------------------------------------ */

type FeedbackType = { kind: 'success' | 'error'; message: string } | null

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  User Management Types                                              */
/* ------------------------------------------------------------------ */

interface UserRecord {
  id: number
  email: string
  name: string
  role: string
  client_id: number | null
  is_active: boolean
  last_login: string | null
  created_at: string
}

interface ClientRecord {
  id: number
  name: string
  slug: string
}

interface CreateUserForm {
  email: string
  password: string
  name: string
  role: string
  client_id: string
}

interface EditUserForm {
  name: string
  role: string
  client_id: string
  is_active: boolean
  new_password: string
}

export default function Settings() {
  const { user, impersonate } = useAuth()
  const { get, put, post, del, loading } = useApi()

  /* ---------- feedback banner ---------- */
  const [feedback, setFeedback] = useState<FeedbackType>(null)
  const feedbackTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)

  const flash = (kind: 'success' | 'error', message: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback({ kind, message })
    feedbackTimer.current = globalThis.setTimeout(() => setFeedback(null), 4000)
  }

  /* ---------- loading state for initial fetch ---------- */
  const [initialLoading, setInitialLoading] = useState(true)

  /* ---------- API Keys ---------- */
  const [geminiKey, setGeminiKey] = useState('')
  const [groqKey, setGroqKey] = useState('')
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  const [keyStatus, setKeyStatus] = useState<ApiKeyStatus>({
    gemini: 'untested',
    groq: 'untested',
    ollama: 'untested',
  })

  /* ---------- Processing Defaults ---------- */
  const [concurrency, setConcurrency] = useState(3)
  const [delay, setDelay] = useState(3000)
  const [timeout, setTimeoutVal] = useState(30000)
  const [maxRetries, setMaxRetries] = useState(3)

  /* ---------- Proxy ---------- */
  const [proxyEnabled, setProxyEnabled] = useState(false)
  const [proxyList, setProxyList] = useState('')
  const [rotationStrategy, setRotationStrategy] = useState('round_robin')

  /* ---------- Preserve extra sections we don't edit in UI ---------- */
  const extraSections = useRef<Record<string, unknown>>({})

  /* ---------- User Management ---------- */
  const [users, setUsers] = useState<UserRecord[]>([])
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [resetConfirm, setResetConfirm] = useState<number | null>(null)
  const [resetting, setResetting] = useState(false)

  /* ---------- Client Management ---------- */
  const [newClientName, setNewClientName] = useState('')
  const [deletingClientId, setDeletingClientId] = useState<number | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [usersFeedback, setUsersFeedback] = useState<FeedbackType>(null)
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: '', password: '', name: '', role: 'user', client_id: '',
  })
  const [editForm, setEditForm] = useState<EditUserForm>({
    name: '', role: 'user', client_id: '', is_active: true, new_password: '',
  })

  /* ================================================================ */
  /*  Load settings on mount & when user changes                       */
  /* ================================================================ */

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setInitialLoading(true)
      const res = await get<SettingsPayload>('/settings')

      if (cancelled) return

      if (res.success && res.data) {
        const d = res.data

        // API keys
        setGeminiKey(d.api_keys?.gemini_api_key ?? '')
        setGroqKey(d.api_keys?.groq_api_key ?? '')
        setOllamaUrl(d.api_keys?.ollama_url ?? 'http://localhost:11434')

        // Processing
        setConcurrency(d.processing?.default_concurrency ?? 3)
        setDelay(d.processing?.default_delay_ms ?? 3000)
        setTimeoutVal(d.processing?.default_timeout_ms ?? 30000)
        setMaxRetries(d.processing?.max_retries ?? 3)

        // Proxy
        setProxyEnabled(d.proxy?.enabled ?? false)
        setProxyList((d.proxy?.proxy_list ?? []).join('\n'))
        setRotationStrategy(d.proxy?.rotation_strategy ?? 'round_robin')

        // Stash sections the UI doesn't directly edit so we can round-trip them
        extraSections.current = {
          ...(d.ai_classification ? { ai_classification: d.ai_classification } : {}),
          ...(d.email_discovery ? { email_discovery: d.email_discovery } : {}),
          ...(d.linkedin_dorking ? { linkedin_dorking: d.linkedin_dorking } : {}),
        }

        // Reset key test statuses on fresh load
        setKeyStatus({ gemini: 'untested', groq: 'untested', ollama: 'untested' })
      } else {
        flash('error', res.error ?? 'Failed to load settings')
      }

      setInitialLoading(false)
    }

    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.client_id])

  /* ================================================================ */
  /*  Build settings object from current form state                    */
  /* ================================================================ */

  const buildPayload = (): SettingsPayload => ({
    api_keys: {
      gemini_api_key: geminiKey,
      groq_api_key: groqKey,
      ollama_url: ollamaUrl,
    },
    processing: {
      default_delay_ms: delay,
      default_concurrency: concurrency,
      default_timeout_ms: timeout,
      max_retries: maxRetries,
    },
    proxy: {
      enabled: proxyEnabled,
      proxy_list: proxyList
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      rotation_strategy: rotationStrategy,
    },
    // Round-trip the sections we don't expose in this UI
    ...extraSections.current,
  })

  /* ================================================================ */
  /*  Load users + clients (admin only)                               */
  /* ================================================================ */

  const loadUsers = useCallback(async () => {
    if (user?.role !== 'admin') return
    const [usersRes, clientsRes] = await Promise.all([
      get<UserRecord[]>('/auth/users'),
      get<ClientRecord[]>('/clients'),
    ])
    if (usersRes.success && usersRes.data) setUsers(usersRes.data as UserRecord[])
    if (clientsRes.success && clientsRes.data) setClients(clientsRes.data as ClientRecord[])
  }, [get, user?.role])

  useEffect(() => { loadUsers() }, [loadUsers])

  /* ================================================================ */
  /*  User Management Handlers                                         */
  /* ================================================================ */

  const flashUsers = (kind: 'success' | 'error', message: string) => {
    setUsersFeedback({ kind, message })
    setTimeout(() => setUsersFeedback(null), 4000)
  }

  const handleCreateUser = async () => {
    if (!createForm.email || !createForm.password || !createForm.name) {
      flashUsers('error', 'Email, şifre ve isim zorunludur')
      return
    }
    const payload: Record<string, unknown> = {
      email: createForm.email,
      password: createForm.password,
      name: createForm.name,
      role: createForm.role,
    }
    if (createForm.client_id) payload.client_id = parseInt(createForm.client_id)
    const res = await post('/auth/users', payload)
    if (res.success) {
      flashUsers('success', 'Kullanıcı oluşturuldu')
      setShowCreateModal(false)
      setCreateForm({ email: '', password: '', name: '', role: 'user', client_id: '' })
      await loadUsers()
    } else {
      flashUsers('error', res.error ?? 'Oluşturma başarısız')
    }
  }

  const handleEditUser = async () => {
    if (!editingUser) return
    const payload: Record<string, unknown> = {
      name: editForm.name,
      role: editForm.role,
      is_active: editForm.is_active,
    }
    if (editForm.client_id) payload.client_id = parseInt(editForm.client_id)
    else payload.client_id = null
    if (editForm.new_password.trim()) payload.password = editForm.new_password.trim()
    const res = await put(`/auth/users/${editingUser.id}`, payload)
    if (res.success) {
      flashUsers('success', 'Kullanıcı güncellendi')
      setEditingUser(null)
      await loadUsers()
    } else {
      flashUsers('error', res.error ?? 'Güncelleme başarısız')
    }
  }

  const handleDeleteUser = async (userId: number) => {
    const res = await del(`/auth/users/${userId}`)
    if (res.success) {
      flashUsers('success', 'Kullanıcı silindi')
      setDeleteConfirm(null)
      await loadUsers()
    } else {
      flashUsers('error', res.error ?? 'Silme başarısız')
    }
  }

  const handleImpersonate = async (targetUser: UserRecord) => {
    try {
      await impersonate(targetUser.id)
    } catch {
      flashUsers('error', 'Giriş yapılamadı')
    }
  }

  const handleResetData = async (userId: number) => {
    setResetting(true)
    const res = await post(`/auth/users/${userId}/reset-data`)
    setResetting(false)
    setResetConfirm(null)
    if (res.success) {
      const deleted = (res as unknown as Record<string, unknown>).deleted_domains ?? '?'
      flashUsers('success', `Veriler sıfırlandı — ${deleted} domain silindi`)
    } else {
      flashUsers('error', res.error ?? 'Sıfırlama başarısız')
    }
  }

  const openEdit = (u: UserRecord) => {
    setEditingUser(u)
    setEditForm({
      name: u.name,
      role: u.role,
      client_id: u.client_id ? String(u.client_id) : '',
      is_active: u.is_active,
      new_password: '',
    })
  }

  /* ================================================================ */
  /*  Client Management Handlers                                       */
  /* ================================================================ */

  const handleCreateClient = async () => {
    const name = newClientName.trim()
    if (!name) return
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const res = await post('/clients', { name, slug })
    if (res.success) {
      setNewClientName('')
      flashUsers('success', `"${name}" client oluşturuldu`)
      await loadUsers()
    } else {
      flashUsers('error', res.error ?? 'Client oluşturulamadı')
    }
  }

  const handleDeleteClient = async (clientId: number) => {
    const res = await del(`/clients/${clientId}`)
    if (res.success) {
      setDeletingClientId(null)
      flashUsers('success', 'Client silindi')
      await loadUsers()
    } else {
      flashUsers('error', res.error ?? 'Client silinemedi')
    }
  }

  /* ================================================================ */
  /*  Save                                                             */
  /* ================================================================ */

  const handleSave = async () => {
    const payload = buildPayload()
    const res = await put('/settings', payload)

    if (res.success) {
      flash('success', 'Settings saved successfully')
    } else {
      flash('error', res.error ?? 'Failed to save settings')
    }
  }

  /* ================================================================ */
  /*  Test key                                                         */
  /* ================================================================ */

  const handleTestKey = async (provider: keyof ApiKeyStatus) => {
    setKeyStatus((prev) => ({ ...prev, [provider]: 'testing' }))
    try {
      const key = provider === 'gemini' ? geminiKey : provider === 'groq' ? groqKey : ollamaUrl
      const res = await put<{ valid: boolean }>('/settings/test-key', { provider, key })
      if (res.success && (res.data as Record<string, unknown>)?.valid) {
        setKeyStatus((prev) => ({ ...prev, [provider]: 'valid' }))
        flash('success', `${provider} key is valid`)
      } else {
        setKeyStatus((prev) => ({ ...prev, [provider]: 'invalid' }))
        flash('error', res.error ?? `${provider} key is invalid`)
      }
    } catch {
      setKeyStatus((prev) => ({ ...prev, [provider]: 'invalid' }))
      flash('error', `Failed to test ${provider} key`)
    }
  }

  /* ================================================================ */
  /*  Backup / Restore                                                 */
  /* ================================================================ */

  const handleBackup = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch('/api/settings/backup', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { flash('error', 'Export failed'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `settings_backup_${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    } catch {
      flash('error', 'Failed to export backup')
    }
  }

  const handleRestore = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        const res = await put('/settings', data)
        if (res.success) {
          flash('success', 'Settings restored successfully')
          window.location.reload()
        } else {
          flash('error', res.error ?? 'Failed to restore settings')
        }
      } catch {
        flash('error', 'Invalid backup file')
      }
    }
    input.click()
  }

  /* ================================================================ */
  /*  Helpers                                                          */
  /* ================================================================ */

  const getKeyStatusIcon = (status: ApiKeyStatus[keyof ApiKeyStatus]) => {
    switch (status) {
      case 'testing':
        return <Loader2 size={14} className="text-amber-400 animate-spin" />
      case 'valid':
        return <CheckCircle size={14} className="text-emerald-400" />
      case 'invalid':
        return <AlertCircle size={14} className="text-red-400" />
      default:
        return null
    }
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="space-y-6">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            feedback.kind === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle size={14} />
          ) : (
            <AlertCircle size={14} />
          )}
          {feedback.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Settings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Platform configuration &mdash;{' '}
            <span className="text-cyan-400">{user?.name || user?.email}</span>
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={loading || initialLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg
                     bg-gradient-to-r from-emerald-500 to-cyan-500
                     text-white text-sm font-medium
                     hover:from-emerald-400 hover:to-cyan-400
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all shadow-lg shadow-emerald-500/20"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Settings
        </button>
      </div>

      {/* Loading overlay for initial fetch */}
      {initialLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-cyan-400 animate-spin" />
          <span className="ml-3 text-sm text-gray-400">Loading settings...</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Account Info */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Users size={18} className="text-blue-400" />
                </div>
                <h3 className="text-sm font-semibold text-gray-200">Account Info</h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                  <div>
                    <p className="text-sm text-gray-200">Logged In As</p>
                    <p className="text-xs text-cyan-400 font-mono mt-0.5">{user?.name || user?.email}</p>
                  </div>
                  <div className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                    Active
                  </div>
                </div>
              </div>
            </div>

            {/* API Keys */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Key size={18} className="text-amber-400" />
                </div>
                <h3 className="text-sm font-semibold text-gray-200">API Keys</h3>
              </div>

              <div className="space-y-3">
                {/* Gemini */}
                <div>
                  <label className="text-xs text-gray-500">Gemini API Key</label>
                  <div className="flex gap-2 mt-1">
                    <div className="flex-1 relative">
                      <input
                        type="password"
                        value={geminiKey}
                        onChange={(e) => setGeminiKey(e.target.value)}
                        placeholder="AIza..."
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700
                                   rounded-lg text-sm text-gray-200 outline-none
                                   focus:border-cyan-500 placeholder-gray-600 pr-8"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        {getKeyStatusIcon(keyStatus.gemini)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleTestKey('gemini')}
                      disabled={!geminiKey || keyStatus.gemini === 'testing'}
                      className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700
                                 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700
                                 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Test
                    </button>
                  </div>
                </div>

                {/* Groq */}
                <div>
                  <label className="text-xs text-gray-500">Groq API Key</label>
                  <div className="flex gap-2 mt-1">
                    <div className="flex-1 relative">
                      <input
                        type="password"
                        value={groqKey}
                        onChange={(e) => setGroqKey(e.target.value)}
                        placeholder="gsk_..."
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700
                                   rounded-lg text-sm text-gray-200 outline-none
                                   focus:border-cyan-500 placeholder-gray-600 pr-8"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        {getKeyStatusIcon(keyStatus.groq)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleTestKey('groq')}
                      disabled={!groqKey || keyStatus.groq === 'testing'}
                      className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700
                                 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700
                                 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Test
                    </button>
                  </div>
                </div>

                {/* Ollama URL */}
                <div>
                  <label className="text-xs text-gray-500">Ollama URL</label>
                  <div className="flex gap-2 mt-1">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        placeholder="http://localhost:11434"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700
                                   rounded-lg text-sm text-gray-200 outline-none
                                   focus:border-cyan-500 placeholder-gray-600 pr-8"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        {getKeyStatusIcon(keyStatus.ollama)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleTestKey('ollama')}
                      disabled={!ollamaUrl || keyStatus.ollama === 'testing'}
                      className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700
                                 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700
                                 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Test
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Processing Defaults */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Sliders size={18} className="text-cyan-400" />
                </div>
                <h3 className="text-sm font-semibold text-gray-200">Processing Defaults</h3>
              </div>

              <div className="space-y-4">
                {/* Concurrency */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-500">Concurrency</label>
                    <span className="text-xs text-cyan-400 font-mono">{concurrency}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer
                               accent-cyan-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>

                {/* Delay */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-500">Delay (ms)</label>
                    <span className="text-xs text-cyan-400 font-mono">{delay}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10000}
                    step={500}
                    value={delay}
                    onChange={(e) => setDelay(Number(e.target.value))}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer
                               accent-cyan-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                    <span>0ms</span>
                    <span>10,000ms</span>
                  </div>
                </div>

                {/* Timeout */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-500">Timeout (ms)</label>
                    <span className="text-xs text-cyan-400 font-mono">{timeout}</span>
                  </div>
                  <input
                    type="range"
                    min={5000}
                    max={120000}
                    step={5000}
                    value={timeout}
                    onChange={(e) => setTimeoutVal(Number(e.target.value))}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer
                               accent-cyan-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                    <span>5s</span>
                    <span>120s</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Proxy Configuration */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Shield size={18} className="text-purple-400" />
                </div>
                <h3 className="text-sm font-semibold text-gray-200">Proxy Configuration</h3>
              </div>

              <div className="space-y-3">
                {/* Enable Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                  <div>
                    <p className="text-sm text-gray-200">Enable Proxy</p>
                    <p className="text-[10px] text-gray-500">Route requests through proxy servers</p>
                  </div>
                  <button
                    onClick={() => setProxyEnabled(!proxyEnabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      proxyEnabled ? 'bg-emerald-500' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-md
                                 transition-transform ${proxyEnabled ? 'translate-x-5' : ''}`}
                    />
                  </button>
                </div>

                {/* Rotation Strategy */}
                <div>
                  <label className="text-xs text-gray-500">Rotation Strategy</label>
                  <select
                    value={rotationStrategy}
                    onChange={(e) => setRotationStrategy(e.target.value)}
                    disabled={!proxyEnabled}
                    className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700
                               rounded-lg text-sm text-gray-200 outline-none
                               focus:border-cyan-500 disabled:opacity-50"
                  >
                    <option value="round_robin">Round Robin</option>
                    <option value="random">Random</option>
                    <option value="sticky">Sticky Session</option>
                  </select>
                </div>

                {/* Proxy List */}
                <div>
                  <label className="text-xs text-gray-500">Proxy List</label>
                  <textarea
                    value={proxyList}
                    onChange={(e) => setProxyList(e.target.value)}
                    disabled={!proxyEnabled}
                    placeholder="host:port:user:pass&#10;host:port:user:pass&#10;..."
                    className="w-full mt-1 h-24 px-3 py-2 bg-gray-800 border border-gray-700
                               rounded-lg text-xs font-mono text-gray-200 outline-none
                               focus:border-cyan-500 placeholder-gray-600 resize-none
                               disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Backup / Restore - Full Width */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Database size={18} className="text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-gray-200">Backup &amp; Restore</h3>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleBackup}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg
                           bg-gray-800 border border-gray-700
                           text-sm text-gray-300 hover:text-gray-100 hover:bg-gray-700
                           disabled:opacity-50 transition-colors"
              >
                <Download size={14} />
                Export Backup
              </button>
              <button
                onClick={handleRestore}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg
                           bg-gray-800 border border-gray-700
                           text-sm text-gray-300 hover:text-gray-100 hover:bg-gray-700
                           disabled:opacity-50 transition-colors"
              >
                <Upload size={14} />
                Import Backup
              </button>
            </div>

            <p className="text-[10px] text-gray-600 mt-3">
              Backups include all settings, API keys, blacklists, and processing defaults for the current account.
              Database records are not included in backups.
            </p>
          </div>

          {/* ── Client Management (Admin Only) ────────────────────────── */}
          {user?.role === 'admin' && (
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Building2 size={18} className="text-purple-400" />
                </div>
                <h3 className="text-sm font-semibold text-gray-200">Client Yönetimi</h3>
                <span className="text-[10px] text-gray-600 ml-1">— Her client izole veri alanıdır</span>
              </div>

              {/* Create Client */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateClient() }}
                  placeholder="Yeni client adı (örn: OnElecs)"
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-purple-500 placeholder-gray-600"
                />
                <button
                  onClick={handleCreateClient}
                  disabled={!newClientName.trim() || loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg
                             bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-medium
                             hover:from-purple-400 hover:to-pink-400 disabled:opacity-50 transition-all"
                >
                  <Plus size={13} />
                  Oluştur
                </button>
              </div>

              {/* Clients List */}
              <div className="space-y-2">
                {clients.map((c) => {
                  const assignedUsers = users.filter(u => u.client_id === c.id)
                  return (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded bg-purple-500/10 flex-shrink-0">
                          <Building2 size={13} className="text-purple-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-200">{c.name}</p>
                          <p className="text-[10px] text-gray-600 font-mono">{c.slug}</p>
                        </div>
                        {assignedUsers.length > 0 && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {assignedUsers.slice(0, 3).map(u => (
                              <span key={u.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400">
                                {u.name}
                              </span>
                            ))}
                            {assignedUsers.length > 3 && (
                              <span className="text-[10px] text-gray-600">+{assignedUsers.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {deletingClientId === c.id ? (
                          <>
                            <button
                              onClick={() => handleDeleteClient(c.id)}
                              className="px-2 py-1 rounded bg-red-500/20 text-red-400 text-[10px] hover:bg-red-500/30 transition-colors"
                            >
                              Evet
                            </button>
                            <button
                              onClick={() => setDeletingClientId(null)}
                              className="px-2 py-1 rounded bg-gray-700 text-gray-400 text-[10px] hover:bg-gray-600 transition-colors"
                            >
                              İptal
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setDeletingClientId(c.id)}
                            title="Sil"
                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {clients.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-4">Henüz client yok</p>
                )}
              </div>
            </div>
          )}

          {/* ── User Management (Admin Only) ───────────────────────────── */}
          {user?.role === 'admin' && (
            <div className="glass rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-cyan-500/10">
                    <Users size={18} className="text-cyan-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-200">Kullanıcı Yönetimi</h3>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                             bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-medium
                             hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/20"
                >
                  <Plus size={13} />
                  Yeni Kullanıcı
                </button>
              </div>

              {/* Users Feedback */}
              {usersFeedback && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-3 ${
                  usersFeedback.kind === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                }`}>
                  {usersFeedback.kind === 'success' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                  {usersFeedback.message}
                </div>
              )}

              {/* Users Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-[10px] text-gray-500 font-medium pb-2">Kullanıcı</th>
                      <th className="text-[10px] text-gray-500 font-medium pb-2">Rol</th>
                      <th className="text-[10px] text-gray-500 font-medium pb-2">Client</th>
                      <th className="text-[10px] text-gray-500 font-medium pb-2 text-center">Durum</th>
                      <th className="text-[10px] text-gray-500 font-medium pb-2 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                        <td className="py-2.5 pr-3">
                          <p className="text-sm text-gray-200">{u.name}</p>
                          <p className="text-[10px] text-gray-500 font-mono">{u.email}</p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            u.role === 'admin'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-blue-500/10 text-blue-400'
                          }`}>
                            {u.role === 'admin' ? 'Admin' : 'Kullanıcı'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="text-xs text-gray-400">
                            {clients.find(c => c.id === u.client_id)?.name ?? '—'}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          {u.is_active
                            ? <UserCheck size={13} className="inline text-emerald-400" />
                            : <UserX size={13} className="inline text-red-400" />}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {/* Login As */}
                            {u.id !== user?.id && (
                              <button
                                onClick={() => handleImpersonate(u)}
                                title="Bu kullanıcı olarak giriş yap"
                                className="p-1.5 rounded-lg bg-gray-800 hover:bg-amber-500/10 text-gray-400 hover:text-amber-400 transition-colors"
                              >
                                <LogIn size={13} />
                              </button>
                            )}
                            {/* Edit */}
                            <button
                              onClick={() => openEdit(u)}
                              title="Düzenle"
                              className="p-1.5 rounded-lg bg-gray-800 hover:bg-cyan-500/10 text-gray-400 hover:text-cyan-400 transition-colors"
                            >
                              <Edit2 size={13} />
                            </button>
                            {/* Reset Data */}
                            {resetConfirm === u.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleResetData(u.id)}
                                  disabled={resetting}
                                  className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 text-[10px] hover:bg-amber-500/30 disabled:opacity-50 transition-colors"
                                >
                                  {resetting ? '...' : 'Evet'}
                                </button>
                                <button
                                  onClick={() => setResetConfirm(null)}
                                  className="px-2 py-1 rounded bg-gray-700 text-gray-400 text-[10px] hover:bg-gray-600 transition-colors"
                                >
                                  İptal
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setResetConfirm(u.id); setDeleteConfirm(null) }}
                                title="Verileri sıfırla"
                                className="p-1.5 rounded-lg bg-gray-800 hover:bg-amber-500/10 text-gray-400 hover:text-amber-400 transition-colors"
                              >
                                <RotateCcw size={13} />
                              </button>
                            )}
                            {/* Delete */}
                            {u.id !== user?.id && (
                              deleteConfirm === u.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="px-2 py-1 rounded bg-red-500/20 text-red-400 text-[10px] hover:bg-red-500/30 transition-colors"
                                  >
                                    Evet
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="px-2 py-1 rounded bg-gray-700 text-gray-400 text-[10px] hover:bg-gray-600 transition-colors"
                                  >
                                    İptal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setDeleteConfirm(u.id); setResetConfirm(null) }}
                                  title="Sil"
                                  className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-xs text-gray-600">
                          Kullanıcı bulunamadı
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Create User Modal ─────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-md mx-4 glass rounded-xl p-6 border border-gray-700/50 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-100">Yeni Kullanıcı</h3>
              <button onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Ad Soyad</label>
                <input type="text" value={createForm.name}
                  onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ahmet Yılmaz"
                  className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500 placeholder-gray-600" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Email</label>
                <input type="email" value={createForm.email}
                  onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="kullanici@firma.com"
                  className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500 placeholder-gray-600" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Şifre</label>
                <div className="relative mt-1">
                  <input type={showPassword ? 'text' : 'password'} value={createForm.password}
                    onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 karakter, büyük harf, rakam, özel karakter"
                    className="w-full px-3 py-2 pr-9 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500 placeholder-gray-600" />
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Rol</label>
                  <select value={createForm.role}
                    onChange={(e) => setCreateForm(f => ({ ...f, role: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500">
                    <option value="user">Kullanıcı</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Client (opsiyonel)</label>
                  <select value={createForm.client_id}
                    onChange={(e) => setCreateForm(f => ({ ...f, client_id: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500">
                    <option value="">— Seçin —</option>
                    {clients.map(c => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors">
                İptal
              </button>
              <button onClick={handleCreateUser} disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                           bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium
                           hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 transition-all">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ───────────────────────────────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={() => setEditingUser(null)}>
          <div className="w-full max-w-md mx-4 glass rounded-xl p-6 border border-gray-700/50 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-100">Kullanıcı Düzenle</h3>
              <button onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4 font-mono">{editingUser.email}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Ad Soyad</label>
                <input type="text" value={editForm.name}
                  onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Rol</label>
                  <select value={editForm.role}
                    onChange={(e) => setEditForm(f => ({ ...f, role: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500">
                    <option value="user">Kullanıcı</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Client</label>
                  <select value={editForm.client_id}
                    onChange={(e) => setEditForm(f => ({ ...f, client_id: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500">
                    <option value="">— Yok —</option>
                    {clients.map(c => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Yeni Şifre <span className="text-gray-600">(değiştirmek için doldurun)</span></label>
                <div className="relative mt-1">
                  <input type={showPassword ? 'text' : 'password'} value={editForm.new_password}
                    onChange={(e) => setEditForm(f => ({ ...f, new_password: e.target.value }))}
                    placeholder="Boş bırakılırsa değişmez"
                    className="w-full px-3 py-2 pr-9 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500 placeholder-gray-600" />
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                <div>
                  <p className="text-sm text-gray-200">Hesap Aktif</p>
                  <p className="text-[10px] text-gray-500">Kapalıysa kullanıcı giriş yapamaz</p>
                </div>
                <button
                  onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    editForm.is_active ? 'bg-emerald-500' : 'bg-gray-700'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                    editForm.is_active ? 'translate-x-5' : ''
                  }`} />
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setEditingUser(null)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors">
                İptal
              </button>
              <button onClick={handleEditUser} disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                           bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-medium
                           hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 transition-all">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
