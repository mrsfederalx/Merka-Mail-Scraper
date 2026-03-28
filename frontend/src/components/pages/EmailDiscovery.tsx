import { useState } from 'react'
import { Mail, Search, CheckCircle, AlertCircle, Server, AtSign, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useApi } from '../../hooks/useApi'

interface MxRecord {
  host: string
  priority: number
  provider: string
}

interface MxCheckData {
  domain: string
  has_mx: boolean
  mx_records: MxRecord[]
  provider: string
}

interface PatternEntry {
  email: string
  pattern_name: string
}

interface GeneratePatternsData {
  patterns: PatternEntry[]
}

interface VerifyData {
  email: string
  is_valid: boolean
  method: string
  is_catch_all: boolean
}

interface PatternResult {
  email: string
  pattern: string
  smtpValid: boolean | null
  checking: boolean
  method: string | null
  isCatchAll: boolean | null
}

export default function EmailDiscovery() {
  const { user } = useAuth()
  const { post, loading } = useApi()

  const [domain, setDomain] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mxRecords, setMxRecords] = useState<MxRecord[]>([])
  const [mxChecked, setMxChecked] = useState(false)
  const [mxProvider, setMxProvider] = useState<string | null>(null)
  const [mxHasMx, setMxHasMx] = useState<boolean | null>(null)
  const [mxLoading, setMxLoading] = useState(false)
  const [mxError, setMxError] = useState<string | null>(null)
  const [patterns, setPatterns] = useState<PatternResult[]>([])
  const [patternLoading, setPatternLoading] = useState(false)
  const [patternError, setPatternError] = useState<string | null>(null)

  const handleMxCheck = async () => {
    if (!domain) return
    setMxLoading(true)
    setMxError(null)
    setMxChecked(false)
    setMxRecords([])
    setMxProvider(null)
    setMxHasMx(null)

    try {
      const res = await post<MxCheckData>('/email-discovery/mx-check', { domain })
      if (res.success && res.data) {
        setMxRecords(res.data.mx_records)
        setMxProvider(res.data.provider)
        setMxHasMx(res.data.has_mx)
      } else {
        setMxError(res.error || 'MX check failed')
      }
    } catch {
      setMxError('Network error during MX check')
    } finally {
      setMxLoading(false)
      setMxChecked(true)
    }
  }

  const handleGeneratePatterns = async () => {
    if (!firstName || !lastName || !domain) return
    setPatternLoading(true)
    setPatternError(null)
    setPatterns([])

    try {
      const res = await post<GeneratePatternsData>('/email-discovery/generate-patterns', {
        domain,
        first_name: firstName,
        last_name: lastName,
      })
      if (res.success && res.data) {
        setPatterns(
          res.data.patterns.map((p) => ({
            email: p.email,
            pattern: p.pattern_name,
            smtpValid: null,
            checking: false,
            method: null,
            isCatchAll: null,
          }))
        )
      } else {
        setPatternError(res.error || 'Pattern generation failed')
      }
    } catch {
      setPatternError('Network error during pattern generation')
    } finally {
      setPatternLoading(false)
    }
  }

  const handleVerifyEmail = async (email: string) => {
    setPatterns((prev) =>
      prev.map((p) =>
        p.email === email ? { ...p, checking: true } : p
      )
    )

    try {
      const res = await post<VerifyData>('/email-discovery/verify', { email })
      if (res.success && res.data) {
        setPatterns((prev) =>
          prev.map((p) =>
            p.email === email
              ? {
                  ...p,
                  smtpValid: res.data!.is_valid,
                  checking: false,
                  method: res.data!.method,
                  isCatchAll: res.data!.is_catch_all,
                }
              : p
          )
        )
      } else {
        setPatterns((prev) =>
          prev.map((p) =>
            p.email === email ? { ...p, smtpValid: false, checking: false } : p
          )
        )
      }
    } catch {
      setPatterns((prev) =>
        prev.map((p) =>
          p.email === email ? { ...p, smtpValid: false, checking: false } : p
        )
      )
    }
  }

  // Suppress unused variable warning — user is imported for consistency with other pages
  void user

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Email Discovery</h2>
        <p className="text-sm text-gray-500 mt-1">
          MX Check, Pattern Generation, SMTP Verification &mdash;{' '}
          <span className="text-cyan-400">{user?.name || user?.email}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MX Records Panel */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Server size={18} className="text-cyan-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-200">MX Records</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Domain</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMxCheck()}
                  placeholder="example.com"
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700
                             rounded-lg text-sm text-gray-200 outline-none
                             focus:border-cyan-500 placeholder-gray-600"
                />
                <button
                  onClick={handleMxCheck}
                  disabled={mxLoading || loading || !domain}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg
                             bg-gradient-to-r from-cyan-500 to-blue-500
                             text-white text-sm font-medium
                             hover:from-cyan-400 hover:to-blue-400
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all shadow-lg shadow-cyan-500/20"
                >
                  {mxLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Search size={14} />
                  )}
                  Check
                </button>
              </div>
            </div>

            {mxError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle size={14} className="text-red-400" />
                <p className="text-xs text-red-400">{mxError}</p>
              </div>
            )}

            {mxChecked && !mxError && mxHasMx === false && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle size={14} className="text-amber-400" />
                <p className="text-xs text-amber-400">No MX records found for this domain.</p>
              </div>
            )}

            {mxChecked && !mxError && mxRecords.length === 0 && mxHasMx !== false && !mxLoading && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                <AlertCircle size={14} className="text-gray-500" />
                <p className="text-xs text-gray-500">No MX records found. Run a check to populate.</p>
              </div>
            )}

            {mxProvider && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <Mail size={14} className="text-cyan-400" />
                <p className="text-xs text-cyan-300">
                  Provider: <span className="font-semibold">{mxProvider}</span>
                </p>
              </div>
            )}

            {mxRecords.length > 0 && (
              <div className="space-y-2">
                {mxRecords.map((mx, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded-lg
                               bg-gray-800/50 border border-gray-700/50"
                  >
                    <div>
                      <p className="text-xs font-mono text-gray-300">{mx.host}</p>
                      <p className="text-[10px] text-gray-500">Priority: {mx.priority}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                      {mx.provider}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pattern Generator Panel */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <AtSign size={18} className="text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-200">Pattern Generator</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700
                           rounded-lg text-sm text-gray-200 outline-none
                           focus:border-cyan-500 placeholder-gray-600"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700
                           rounded-lg text-sm text-gray-200 outline-none
                           focus:border-cyan-500 placeholder-gray-600"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Domain</label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700
                           rounded-lg text-sm text-gray-200 outline-none
                           focus:border-cyan-500 placeholder-gray-600"
              />
            </div>

            {patternError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle size={14} className="text-red-400" />
                <p className="text-xs text-red-400">{patternError}</p>
              </div>
            )}

            <button
              onClick={handleGeneratePatterns}
              disabled={patternLoading || loading || !firstName || !lastName || !domain}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                         bg-gradient-to-r from-emerald-500 to-cyan-500
                         text-white text-sm font-medium
                         hover:from-emerald-400 hover:to-cyan-400
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all shadow-lg shadow-emerald-500/20"
            >
              {patternLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Mail size={14} />
              )}
              Generate Patterns
            </button>
          </div>
        </div>

        {/* Results Panel */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <CheckCircle size={18} className="text-purple-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-200">Verification Results</h3>
          </div>

          {patterns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Mail size={32} className="text-gray-700 mb-3" />
              <p className="text-sm text-gray-500">No patterns generated yet.</p>
              <p className="text-xs text-gray-600 mt-1">
                Enter a name and domain to generate email pattern candidates.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-xs text-gray-500 font-medium pb-2 pr-3">Email</th>
                    <th className="text-xs text-gray-500 font-medium pb-2 pr-3">Pattern</th>
                    <th className="text-xs text-gray-500 font-medium pb-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {patterns.map((p, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 pr-3">
                        <span className="text-xs font-mono text-gray-300">{p.email}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="text-[10px] text-gray-500">{p.pattern}</span>
                      </td>
                      <td className="py-2 text-center">
                        {p.checking ? (
                          <Loader2 size={14} className="text-amber-400 animate-spin mx-auto" />
                        ) : p.smtpValid === true ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <CheckCircle size={14} className="text-emerald-400" />
                            {p.isCatchAll && (
                              <span className="text-[9px] text-amber-400">catch-all</span>
                            )}
                          </div>
                        ) : p.smtpValid === false ? (
                          <AlertCircle size={14} className="text-red-400 mx-auto" />
                        ) : (
                          <button
                            onClick={() => handleVerifyEmail(p.email)}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                          >
                            Verify
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
