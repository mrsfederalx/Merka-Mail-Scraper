import { useState, useCallback, useRef, useMemo } from 'react'
import axios from 'axios'
import {
  Linkedin, Search, UserCheck, ExternalLink, Copy, Check, Mail,
  Zap, Users, Globe, AlertCircle, Loader2, Upload, ArrowUpDown,
  ListPlus, Square, Download, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WebSocketContext'
import StatCard from '../layout/StatCard'
import ProgressBar from '../shared/ProgressBar'
import TerminalLog from '../layout/TerminalLog'

const ROLE_OPTIONS = [
  'CEO', 'Owner', 'Founder', 'Director', 'Manager',
  'Genel Mudur', 'Kurucu', 'Mudur', 'CTO', 'CFO',
] as const

// Direct axios instance with 10 min timeout for long operations
const longApi = axios.create({ baseURL: '/api', timeout: 600000 })

/* ── Score Badge ── */
function ScoreBadge({ score }: { score: number }) {
  const bg = score >= 80
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : score >= 50
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${bg}`}>
      {score}
    </span>
  )
}

/* ── Copy Button ── */
function CopyBtn({ text, size = 13 }: { text: string; size?: number }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleCopy() }}
      className={`p-1.5 rounded-lg transition-colors ${
        copied
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200'
      }`}
      title={copied ? 'Kopyalandi!' : 'Kopyala'}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  )
}

interface ApiContact {
  full_name?: string
  first_name?: string
  last_name?: string
  role?: string
  linkedin_url?: string
  source?: string
  search_query?: string
  score?: number
  email_found?: string | null
  email_verified?: boolean
  domain?: string
}

interface BulkResult {
  domain: string
  contacts_found: number
  emails_found: number
  emails_verified: number
  saved_to_db: number
  status: string
  error?: string
}

type ViewMode = 'search' | 'bulk'
type SortField = 'score' | 'full_name' | 'domain' | 'role'
type SortDir = 'asc' | 'desc'

export default function LinkedInDorker() {
  const { user } = useAuth()
  const { logs } = useWebSocket()

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('bulk')

  // Search inputs
  const [domain, setDomain] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [domainsText, setDomainsText] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    new Set(['CEO', 'Owner', 'Founder', 'Director', 'Manager'])
  )

  // Processing state
  const [contacts, setContacts] = useState<ApiContact[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [currentDomain, setCurrentDomain] = useState('')
  const [processedCount, setProcessedCount] = useState(0)
  const [totalDomains, setTotalDomains] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Bulk results summary
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([])
  const [bulkStats, setBulkStats] = useState<{
    total_contacts: number; total_emails: number; total_verified: number
  } | null>(null)

  // Single discover stats
  const [discoverStats, setDiscoverStats] = useState<{
    emails_found: number; emails_verified: number
  } | null>(null)

  // Results table controls
  const [searchFilter, setSearchFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [showBulkSummary, setShowBulkSummary] = useState(true)

  // Abort controller for cancellation
  const abortRef = useRef<AbortController | null>(null)

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  // Parse domain list from textarea
  const parseDomains = (): string[] => {
    return domainsText
      .split(/[\n,;]+/)
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d && d.includes('.'))
  }

  const domainCount = parseDomains().length

  // Handle .txt file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setDomainsText((prev) => (prev ? prev + '\n' : '') + text)
    }
    reader.readAsText(file)
    e.target.value = '' // reset for same file re-upload
  }

  // ── TOPLU KESIF (Bulk Discover) ──
  const handleBulkDiscover = useCallback(async () => {
    const domains = parseDomains()
    if (domains.length === 0) return

    setProcessing(true)
    setHasSearched(true)
    setErrorMsg(null)
    setBulkResults([])
    setBulkStats(null)
    setContacts([])
    setProcessedCount(0)
    setTotalDomains(domains.length)
    setShowBulkSummary(true)

    const allContacts: ApiContact[] = []
    const results: BulkResult[] = []
    let totalEmails = 0
    let totalVerified = 0

    abortRef.current = new AbortController()

    for (let i = 0; i < domains.length; i++) {
      if (abortRef.current.signal.aborted) break

      const d = domains[i]
      setCurrentDomain(d)
      setProcessedCount(i + 1)

      try {
        const body: Record<string, unknown> = { domain: d, max_results: 20 }
        if (selectedRoles.size > 0) body.roles = Array.from(selectedRoles)

        const res = await longApi.post('/linkedin/discover', body, {
          signal: abortRef.current.signal,
        })

        const data = res.data
        if (data.success && data.data) {
          const contactsList = (data.data.contacts || []) as ApiContact[]
          const ef = data.data.emails_found || 0
          const ev = data.data.emails_verified || 0
          const saved = data.data.saved_to_db || 0

          // Tag contacts with domain
          contactsList.forEach((c: ApiContact) => { c.domain = d })
          allContacts.push(...contactsList)

          results.push({
            domain: d,
            contacts_found: contactsList.length,
            emails_found: ef,
            emails_verified: ev,
            saved_to_db: saved,
            status: 'completed',
          })
          totalEmails += ef
          totalVerified += ev
        } else {
          results.push({
            domain: d,
            contacts_found: 0,
            emails_found: 0,
            emails_verified: 0,
            saved_to_db: 0,
            status: 'failed',
            error: data.error || 'Unknown error',
          })
        }
      } catch (err) {
        if (axios.isCancel(err)) break
        results.push({
          domain: d,
          contacts_found: 0,
          emails_found: 0,
          emails_verified: 0,
          saved_to_db: 0,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Request failed',
        })
      }

      // Update results in real-time
      setBulkResults([...results])
      setContacts([...allContacts])
    }

    setBulkStats({
      total_contacts: allContacts.length,
      total_emails: totalEmails,
      total_verified: totalVerified,
    })
    setCurrentDomain('')
    setProcessing(false)
    abortRef.current = null
  }, [domainsText, selectedRoles])

  // ── TEK DOMAIN KESIF ──
  const handleSingleDiscover = useCallback(async () => {
    if (!domain) return

    setProcessing(true)
    setHasSearched(true)
    setErrorMsg(null)
    setDiscoverStats(null)
    setContacts([])
    setCurrentDomain(domain)
    setTotalDomains(1)
    setProcessedCount(0)

    try {
      const body: Record<string, unknown> = { domain, max_results: 20 }
      if (companyName) body.company_name = companyName
      if (selectedRoles.size > 0) body.roles = Array.from(selectedRoles)

      const res = await longApi.post('/linkedin/discover', body)
      const data = res.data

      setProcessedCount(1)

      if (data.success && data.data) {
        const contactsList = (data.data.contacts || []) as ApiContact[]
        contactsList.forEach((c: ApiContact) => { c.domain = domain })
        setContacts(contactsList)
        setDiscoverStats({
          emails_found: data.data.emails_found || 0,
          emails_verified: data.data.emails_verified || 0,
        })
      } else {
        setContacts([])
        setErrorMsg(data.error || 'Kesif basarisiz')
      }
    } catch (err) {
      setContacts([])
      setErrorMsg(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setCurrentDomain('')
      setProcessing(false)
    }
  }, [domain, companyName, selectedRoles])

  // ── IPTAL ──
  const handleCancel = () => {
    abortRef.current?.abort()
    setProcessing(false)
    setCurrentDomain('')
  }

  // ── Copy all found emails ──
  const handleCopyAllEmails = useCallback(async () => {
    const emails = contacts.map((c) => c.email_found).filter(Boolean) as string[]
    if (emails.length === 0) return
    try {
      await navigator.clipboard.writeText(emails.join('\n'))
    } catch { /* noop */ }
  }, [contacts])

  // ── XLSX Export ──
  const handleExport = useCallback(async () => {
    try {
      const response = await longApi.get('/export/xlsx', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `linkedin_contacts_${user?.name || 'export'}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }, [user])

  // ── Sort handler ──
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'score' ? 'desc' : 'asc')
    }
  }

  // ── Filtered + sorted contacts ──
  const filteredContacts = useMemo(() => {
    let list = [...contacts]

    // Search filter
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase()
      list = list.filter(
        (c) =>
          (c.full_name || '').toLowerCase().includes(q) ||
          (c.role || '').toLowerCase().includes(q) ||
          (c.domain || '').toLowerCase().includes(q) ||
          (c.email_found || '').toLowerCase().includes(q)
      )
    }

    // Sort
    list.sort((a, b) => {
      let av: string | number, bv: string | number
      switch (sortField) {
        case 'score': av = a.score || 0; bv = b.score || 0; break
        case 'full_name': av = (a.full_name || '').toLowerCase(); bv = (b.full_name || '').toLowerCase(); break
        case 'domain': av = (a.domain || '').toLowerCase(); bv = (b.domain || '').toLowerCase(); break
        case 'role': av = (a.role || '').toLowerCase(); bv = (b.role || '').toLowerCase(); break
        default: av = a.score || 0; bv = b.score || 0
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [contacts, searchFilter, sortField, sortDir])

  // Filter LinkedIn-module logs only
  const linkedinLogs = logs.filter(
    (l) => l.module === 'linkedin_dorker' || l.module === 'email_discoverer' || l.module === 'linkedin_api'
  )

  // Stats
  const totalContactsCount = bulkStats?.total_contacts ?? contacts.length
  const totalEmailsCount = bulkStats?.total_emails ?? discoverStats?.emails_found ?? 0
  const totalVerifiedCount = bulkStats?.total_verified ?? discoverStats?.emails_verified ?? 0

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      size={10}
      className={`inline ml-0.5 ${sortField === field ? 'text-cyan-400' : 'text-gray-600'}`}
    />
  )

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">LinkedIn Karar Verici Bulucu</h2>
          <p className="text-sm text-gray-500 mt-1">
            Google dorking + email kesfi &mdash;{' '}
            <span className="text-cyan-400">{user?.name || user?.email}</span>
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-gray-800 rounded-lg p-0.5 border border-gray-700">
          <button
            onClick={() => setViewMode('bulk')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'bulk'
                ? 'bg-blue-500/20 text-blue-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <ListPlus size={12} className="inline mr-1" />
            Toplu Kesif
          </button>
          <button
            onClick={() => setViewMode('search')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'search'
                ? 'bg-blue-500/20 text-blue-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Search size={12} className="inline mr-1" />
            Tek Domain
          </button>
        </div>
      </div>

      {/* ── Two-Column Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT PANEL (1/3) ── */}
        <div className="space-y-4">
          {/* Domain Input */}
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-500/10">
                  <Linkedin size={16} className="text-blue-400" />
                </div>
                <h3 className="text-sm font-medium text-gray-300">
                  {viewMode === 'bulk' ? 'Domain Listesi' : 'Tek Domain'}
                </h3>
              </div>
              {viewMode === 'bulk' && (
                <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                                   bg-gray-800 hover:bg-gray-700 cursor-pointer
                                   text-xs text-gray-400 hover:text-gray-200 transition-colors">
                  <Upload size={12} />
                  .txt
                  <input
                    type="file"
                    accept=".txt,.csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              )}
            </div>

            {viewMode === 'bulk' ? (
              <>
                <textarea
                  value={domainsText}
                  onChange={(e) => setDomainsText(e.target.value)}
                  placeholder={'example.com\nabc.com.tr\nxyz.net\n...'}
                  className="w-full h-48 bg-black/40 rounded-lg p-3 text-sm font-mono
                             text-gray-300 placeholder-gray-600
                             border border-gray-800 focus:border-cyan-500/50
                             outline-none resize-none"
                  disabled={processing}
                />
                <p className="text-xs text-gray-500 mt-2">
                  {domainCount > 0 ? (
                    <span className="text-cyan-400">{domainCount} domain</span>
                  ) : (
                    'Her satira bir domain yazin'
                  )}
                </p>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Domain</label>
                  <div className="relative">
                    <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="example.com"
                      className="w-full pl-8 pr-3 py-2.5 bg-black/40 border border-gray-800
                                 rounded-lg text-sm text-gray-200 outline-none
                                 focus:border-cyan-500/50 placeholder-gray-600"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSingleDiscover() }}
                      disabled={processing}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Sirket Adi (opsiyonel)</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Otomatik cikarilir..."
                    className="w-full px-3 py-2.5 bg-black/40 border border-gray-800
                               rounded-lg text-sm text-gray-200 outline-none
                               focus:border-cyan-500/50 placeholder-gray-600"
                    disabled={processing}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Role Filters */}
          <div className="glass rounded-xl p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Rol Filtreleri</h3>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_OPTIONS.map((role) => {
                const isSelected = selectedRoles.has(role)
                return (
                  <button
                    key={role}
                    onClick={() => toggleRole(role)}
                    disabled={processing}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs
                               font-medium transition-all border
                               ${isSelected
                                 ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                                 : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                               }`}
                  >
                    {isSelected && <UserCheck size={10} />}
                    {role}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {processing ? (
              <button
                onClick={handleCancel}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                           bg-red-500/10 border border-red-500/30
                           text-red-400 text-sm font-medium hover:bg-red-500/20 transition-all"
              >
                <Square size={14} />
                Durdur
              </button>
            ) : viewMode === 'bulk' ? (
              <button
                onClick={handleBulkDiscover}
                disabled={domainCount === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                           bg-gradient-to-r from-emerald-600 to-cyan-500
                           text-white text-sm font-medium
                           hover:from-emerald-500 hover:to-cyan-400
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all shadow-lg shadow-emerald-500/20"
              >
                <Zap size={14} />
                Kesfi Baslat ({domainCount})
              </button>
            ) : (
              <button
                onClick={handleSingleDiscover}
                disabled={!domain}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                           bg-gradient-to-r from-emerald-600 to-cyan-500
                           text-white text-sm font-medium
                           hover:from-emerald-500 hover:to-cyan-400
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all shadow-lg shadow-emerald-500/20"
              >
                <Zap size={14} />
                Karar Verici Bul
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL (2/3) ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              title="Kisi Bulundu"
              value={totalContactsCount}
              icon={Users}
              color="blue"
            />
            <StatCard
              title="Email Bulundu"
              value={totalEmailsCount}
              icon={Mail}
              color="emerald"
            />
            <StatCard
              title="Dogrulanmis"
              value={totalVerifiedCount}
              icon={UserCheck}
              color="cyan"
            />
          </div>

          {/* Progress Bar (during processing) */}
          {processing && totalDomains > 0 && (
            <div className="glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="text-cyan-400 animate-spin" />
                  <span className="text-xs text-gray-400">
                    Isleniyor: <span className="text-cyan-300 font-mono">{currentDomain}</span>
                  </span>
                </div>
              </div>
              <ProgressBar value={processedCount} max={totalDomains} color="emerald" />
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="glass rounded-xl p-3 border border-red-500/30 bg-red-500/5">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span className="text-xs text-red-300">{errorMsg}</span>
              </div>
            </div>
          )}

          {/* Terminal Log */}
          <TerminalLog
            logs={linkedinLogs}
            title="LinkedIn Dorker"
            maxHeight="280px"
          />
        </div>
      </div>

      {/* ── Bulk Results Summary ── */}
      {bulkResults.length > 0 && (
        <div className="glass rounded-xl p-4">
          <button
            onClick={() => setShowBulkSummary((p) => !p)}
            className="flex items-center justify-between w-full mb-2"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-500/10">
                <Globe size={14} className="text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-gray-200">Domain Ozeti</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                {bulkResults.length} domain
              </span>
            </div>
            {showBulkSummary ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
          </button>

          {showBulkSummary && (
            <div className="overflow-y-auto mt-2" style={{ maxHeight: '200px' }}>
              <table className="w-full text-left table-fixed">
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                </colgroup>
                <thead className="sticky top-0 bg-gray-900/95 z-10">
                  <tr className="border-b border-gray-800">
                    <th className="text-xs text-gray-500 font-medium pb-2">Domain</th>
                    <th className="text-xs text-gray-500 font-medium pb-2 text-center">Kisi</th>
                    <th className="text-xs text-gray-500 font-medium pb-2 text-center">Email</th>
                    <th className="text-xs text-gray-500 font-medium pb-2 text-center">Dogrulanmis</th>
                    <th className="text-xs text-gray-500 font-medium pb-2 text-center">DB</th>
                    <th className="text-xs text-gray-500 font-medium pb-2 text-center">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkResults.map((r, i) => (
                    <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                      <td className="py-1.5 pr-2">
                        <span className="text-xs font-mono text-gray-300 truncate block">{r.domain}</span>
                      </td>
                      <td className="py-1.5 text-center text-xs text-gray-400">{r.contacts_found}</td>
                      <td className="py-1.5 text-center text-xs text-gray-400">{r.emails_found}</td>
                      <td className="py-1.5 text-center text-xs text-emerald-400">{r.emails_verified}</td>
                      <td className="py-1.5 text-center text-xs text-cyan-400">{r.saved_to_db}</td>
                      <td className="py-1.5 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          r.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}>
                          {r.status === 'completed' ? 'OK' : 'HATA'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Contacts Results Table (full width) ── */}
      <div className="glass rounded-xl p-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <UserCheck size={16} className="text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-200">Bulunan Kisiler</h3>
            {contacts.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                {filteredContacts.length}{searchFilter ? ` / ${contacts.length}` : ''} kisi
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            {contacts.length > 0 && (
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Ara..."
                  className="pl-7 pr-3 py-1.5 bg-gray-800 border border-gray-700
                             rounded-lg text-xs text-gray-200 outline-none
                             focus:border-cyan-500/50 placeholder-gray-600 w-40"
                />
              </div>
            )}
            {/* Export XLSX */}
            {contacts.length > 0 && (
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                           bg-gray-800 border border-gray-700 text-gray-400
                           hover:bg-gray-700 hover:text-gray-200 transition-colors"
                title="XLSX Export"
              >
                <Download size={12} />
                Export
              </button>
            )}
            {/* Copy all emails */}
            {contacts.length > 0 && (
              <button
                onClick={handleCopyAllEmails}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                           bg-gray-800 border border-gray-700 text-gray-400
                           hover:bg-gray-700 hover:text-gray-200 transition-colors"
              >
                <Copy size={12} />
                Emailler
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {!hasSearched ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <Linkedin size={36} className="text-gray-700 mb-3" />
            <p className="text-sm text-gray-500">
              Domain listesi girin ve &quot;Kesfi Baslat&quot; butonuna tiklayin.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Sonuclar otomatik olarak Database&apos;e kaydedilir.
            </p>
          </div>
        ) : filteredContacts.length === 0 && !processing ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <AlertCircle size={36} className="text-gray-700 mb-3" />
            <p className="text-sm text-gray-500">
              {searchFilter ? 'Filtreye uygun sonuc bulunamadi.' : 'Henuz sonuc bulunamadi.'}
            </p>
          </div>
        ) : (
          <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
            <table className="w-full text-left table-fixed">
              <colgroup>
                <col style={{ width: '14%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead className="sticky top-0 bg-gray-900/95 z-10">
                <tr className="border-b border-gray-800">
                  <th
                    className="text-xs text-gray-500 font-medium pb-3 pr-2 cursor-pointer hover:text-gray-300 select-none"
                    onClick={() => handleSort('domain')}
                  >
                    Domain <SortIcon field="domain" />
                  </th>
                  <th
                    className="text-xs text-gray-500 font-medium pb-3 pr-2 cursor-pointer hover:text-gray-300 select-none"
                    onClick={() => handleSort('full_name')}
                  >
                    Isim <SortIcon field="full_name" />
                  </th>
                  <th
                    className="text-xs text-gray-500 font-medium pb-3 pr-2 cursor-pointer hover:text-gray-300 select-none"
                    onClick={() => handleSort('role')}
                  >
                    Rol <SortIcon field="role" />
                  </th>
                  <th className="text-xs text-gray-500 font-medium pb-3 pr-2">Email</th>
                  <th
                    className="text-xs text-gray-500 font-medium pb-3 pr-2 text-center cursor-pointer hover:text-gray-300 select-none"
                    onClick={() => handleSort('score')}
                  >
                    Skor <SortIcon field="score" />
                  </th>
                  <th className="text-xs text-gray-500 font-medium pb-3 pr-2 text-center">Durum</th>
                  <th className="text-xs text-gray-500 font-medium pb-3 text-right">Islem</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((c, i) => {
                  const fullName = c.full_name || ''
                  const role = c.role || ''
                  const linkedinUrl = c.linkedin_url || ''
                  const emailFound = c.email_found || ''
                  const emailVerified = c.email_verified || false
                  const score = c.score || 0
                  const cDomain = c.domain || ''

                  return (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 pr-2">
                        <span className="text-[11px] font-mono text-gray-500 truncate block">{cDomain}</span>
                      </td>
                      <td className="py-2 pr-2">
                        <span className="text-sm text-gray-200 truncate block">{fullName}</span>
                      </td>
                      <td className="py-2 pr-2">
                        {role ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 truncate block max-w-full">
                            {role}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600">&mdash;</span>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        {emailFound ? (
                          <span className="text-xs text-gray-300 font-mono truncate block">{emailFound}</span>
                        ) : (
                          <span className="text-xs text-gray-600">&mdash;</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-center">
                        <ScoreBadge score={score} />
                      </td>
                      <td className="py-2 pr-2 text-center">
                        {emailVerified ? (
                          <span className="text-emerald-400 text-xs font-medium">Dogrulandi</span>
                        ) : emailFound ? (
                          <span className="text-amber-400 text-xs">Dogrulanmadi</span>
                        ) : (
                          <span className="text-gray-700 text-xs">&mdash;</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {emailFound && <CopyBtn text={emailFound} size={12} />}
                          {linkedinUrl && (
                            <a
                              href={linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                              title="LinkedIn"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
