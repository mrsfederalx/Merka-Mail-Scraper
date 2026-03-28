import { useState, useEffect, useCallback } from 'react'
import { ShieldBan, Plus, Trash2, Mail, Globe, AlertCircle, Loader2 } from 'lucide-react'
import { useApi } from '../../hooks/useApi'

export default function BlacklistManager() {
  const { get, post, del, loading, error } = useApi()

  const [newEmail, setNewEmail] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [emailBlacklist, setEmailBlacklist] = useState<string[]>([])
  const [domainBlacklist, setDomainBlacklist] = useState<string[]>([])
  const [initialLoad, setInitialLoad] = useState(true)

  const fetchEmailBlacklist = useCallback(async () => {
    const res = await get<string[]>('blacklist/emails')
    if (res.success && res.data) {
      setEmailBlacklist(res.data)
    }
  }, [get])

  const fetchDomainBlacklist = useCallback(async () => {
    const res = await get<string[]>('blacklist/domains')
    if (res.success && res.data) {
      setDomainBlacklist(res.data)
    }
  }, [get])

  useEffect(() => {
    const loadAll = async () => {
      await Promise.all([fetchEmailBlacklist(), fetchDomainBlacklist()])
      setInitialLoad(false)
    }
    loadAll()
  }, [fetchEmailBlacklist, fetchDomainBlacklist])

  const handleAddEmail = async () => {
    const pattern = newEmail.trim()
    if (!pattern) return
    const res = await post('blacklist/emails/add', { patterns: [pattern] })
    if (res.success) {
      setNewEmail('')
      await fetchEmailBlacklist()
    }
  }

  const handleAddDomain = async () => {
    const pattern = newDomain.trim()
    if (!pattern) return
    const res = await post('blacklist/domains/add', { patterns: [pattern] })
    if (res.success) {
      setNewDomain('')
      await fetchDomainBlacklist()
    }
  }

  const handleRemoveEmail = async (pattern: string) => {
    const res = await del(`blacklist/emails/${encodeURIComponent(pattern)}`)
    if (res.success) {
      await fetchEmailBlacklist()
    }
  }

  const handleRemoveDomain = async (pattern: string) => {
    const res = await del(`blacklist/domains/${encodeURIComponent(pattern)}`)
    if (res.success) {
      await fetchDomainBlacklist()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Blacklist Manager</h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage email and domain exclusion lists
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="glass rounded-xl p-3 border border-red-500/30 bg-red-500/5">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Email Blacklist */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-red-500/10">
              <Mail size={18} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Email Blacklist</h3>
              <p className="text-[10px] text-gray-500">
                {emailBlacklist.length} entr{emailBlacklist.length === 1 ? 'y' : 'ies'}
              </p>
            </div>
          </div>

          {/* Add Input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com or *@domain.com"
              onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700
                         rounded-lg text-sm text-gray-200 outline-none
                         focus:border-cyan-500 placeholder-gray-600"
            />
            <button
              onClick={handleAddEmail}
              disabled={loading || !newEmail.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg
                         bg-red-500/20 border border-red-500/30 text-red-400
                         hover:bg-red-500/30 hover:text-red-300
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors text-sm"
            >
              <Plus size={14} />
              Add
            </button>
          </div>

          {/* List */}
          {initialLoad && loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Loader2 size={24} className="text-gray-600 animate-spin mb-2" />
              <p className="text-xs text-gray-500">Loading blacklist...</p>
            </div>
          ) : emailBlacklist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ShieldBan size={28} className="text-gray-700 mb-2" />
              <p className="text-xs text-gray-500">No emails blacklisted.</p>
              <p className="text-[10px] text-gray-600 mt-1">
                Add email addresses or patterns to exclude from results.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {emailBlacklist.map((pattern) => (
                <div
                  key={pattern}
                  className="flex items-center justify-between p-2.5 rounded-lg
                             bg-gray-800/50 border border-gray-700/50 group"
                >
                  <p className="text-xs font-mono text-gray-300">{pattern}</p>
                  <button
                    onClick={() => handleRemoveEmail(pattern)}
                    disabled={loading}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100
                               bg-red-500/10 text-red-400 hover:bg-red-500/20
                               disabled:opacity-50 transition-all"
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Domain Blacklist */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Globe size={18} className="text-orange-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Domain Blacklist</h3>
              <p className="text-[10px] text-gray-500">
                {domainBlacklist.length} entr{domainBlacklist.length === 1 ? 'y' : 'ies'}
              </p>
            </div>
          </div>

          {/* Add Input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com or *.example.com"
              onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700
                         rounded-lg text-sm text-gray-200 outline-none
                         focus:border-cyan-500 placeholder-gray-600"
            />
            <button
              onClick={handleAddDomain}
              disabled={loading || !newDomain.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg
                         bg-orange-500/20 border border-orange-500/30 text-orange-400
                         hover:bg-orange-500/30 hover:text-orange-300
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors text-sm"
            >
              <Plus size={14} />
              Add
            </button>
          </div>

          {/* List */}
          {initialLoad && loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Loader2 size={24} className="text-gray-600 animate-spin mb-2" />
              <p className="text-xs text-gray-500">Loading blacklist...</p>
            </div>
          ) : domainBlacklist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ShieldBan size={28} className="text-gray-700 mb-2" />
              <p className="text-xs text-gray-500">No domains blacklisted.</p>
              <p className="text-[10px] text-gray-600 mt-1">
                Add domain patterns to skip during processing.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {domainBlacklist.map((pattern) => (
                <div
                  key={pattern}
                  className="flex items-center justify-between p-2.5 rounded-lg
                             bg-gray-800/50 border border-gray-700/50 group"
                >
                  <p className="text-xs font-mono text-gray-300">{pattern}</p>
                  <button
                    onClick={() => handleRemoveDomain(pattern)}
                    disabled={loading}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100
                               bg-red-500/10 text-red-400 hover:bg-red-500/20
                               disabled:opacity-50 transition-all"
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pattern Info Note */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 mt-0.5">
            <AlertCircle size={16} className="text-amber-400" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-gray-300 mb-1">Pattern Matching</h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              Blacklist entries support wildcard patterns. Use <code className="text-cyan-400 bg-gray-800 px-1 rounded">*@domain.com</code>{' '}
              to block all emails from a domain, or <code className="text-cyan-400 bg-gray-800 px-1 rounded">*.example.com</code>{' '}
              to block a domain and all its subdomains. Exact matches are also supported.
              Blacklisted entries will be automatically excluded from all processing results.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
