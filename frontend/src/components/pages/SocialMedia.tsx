import { useState, useEffect, useMemo, useCallback } from 'react'
import { Share2, Facebook, Instagram, Twitter, Youtube, Linkedin, Search, ExternalLink } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useApi } from '../../hooks/useApi'

interface SocialLink {
  domain_id: number
  domain: string
  platform: string
  url: string
  source: string
}

interface SocialRow {
  domain: string
  facebook?: string
  instagram?: string
  twitter?: string
  youtube?: string
  linkedin?: string
}

const PLATFORM_CONFIG = [
  { key: 'facebook' as const, label: 'Facebook', icon: Facebook, color: 'text-blue-400' },
  { key: 'instagram' as const, label: 'Instagram', icon: Instagram, color: 'text-pink-400' },
  { key: 'twitter' as const, label: 'Twitter', icon: Twitter, color: 'text-sky-400' },
  { key: 'youtube' as const, label: 'YouTube', icon: Youtube, color: 'text-red-400' },
  { key: 'linkedin' as const, label: 'LinkedIn', icon: Linkedin, color: 'text-blue-500' },
] as const

export default function SocialMedia() {
  const { user } = useAuth()
  const { get, loading } = useApi()

  const [rawData, setRawData] = useState<SocialLink[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState<string>('all')

  const fetchSocialLinks = useCallback(async () => {
    const res = await get<SocialLink[]>('/social')
    if (res.success && res.data) {
      setRawData(res.data)
    } else {
      setRawData([])
    }
  }, [get])

  // Load on mount and when user changes
  useEffect(() => {
    fetchSocialLinks()
  }, [user?.client_id, fetchSocialLinks])

  // Group flat list into rows keyed by domain
  const groupedRows = useMemo<SocialRow[]>(() => {
    const map = new Map<string, SocialRow>()

    for (const link of rawData) {
      if (!map.has(link.domain)) {
        map.set(link.domain, { domain: link.domain })
      }
      const row = map.get(link.domain)!
      const platform = link.platform.toLowerCase()
      if (platform === 'facebook') row.facebook = link.url
      else if (platform === 'instagram') row.instagram = link.url
      else if (platform === 'twitter' || platform === 'x') row.twitter = link.url
      else if (platform === 'youtube') row.youtube = link.url
      else if (platform === 'linkedin') row.linkedin = link.url
    }

    return Array.from(map.values())
  }, [rawData])

  // Apply client-side filters
  const filteredRows = useMemo(() => {
    return groupedRows.filter((row) => {
      // Search filter on domain name
      if (searchQuery && !row.domain.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      // Platform filter: only show rows that have the selected platform
      if (platformFilter !== 'all') {
        const key = platformFilter as keyof SocialRow
        if (!row[key]) return false
      }
      return true
    })
  }, [groupedRows, searchQuery, platformFilter])

  const handleExport = () => {
    if (filteredRows.length === 0) return
    const headers = ['Domain', ...PLATFORM_CONFIG.map((p) => p.label)]
    const csvRows = filteredRows.map((row) =>
      [row.domain, ...PLATFORM_CONFIG.map((p) => row[p.key] || '')].map(
        (v) => `"${String(v).replace(/"/g, '""')}"`
      ).join(',')
    )
    const csv = [headers.join(','), ...csvRows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `social_media_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Social Media</h2>
          <p className="text-sm text-gray-500 mt-1">
            Social media links discovered across domains &mdash;{' '}
            <span className="text-cyan-400">{user?.name || user?.email}</span>
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg
                     bg-gray-800 hover:bg-gray-700 border border-gray-700
                     text-sm text-gray-300 hover:text-gray-100
                     transition-colors"
        >
          <Share2 size={14} />
          Export
        </button>
      </div>

      {/* Filter Bar */}
      <div className="glass rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search domains..."
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700
                         rounded-lg text-sm text-gray-200 outline-none
                         focus:border-cyan-500 placeholder-gray-600"
            />
          </div>

          {/* Platform Filter */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700
                       rounded-lg text-sm text-gray-200 outline-none
                       focus:border-cyan-500"
          >
            <option value="all">All Platforms</option>
            {PLATFORM_CONFIG.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>

          {/* Total count indicator */}
          {rawData.length > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400">
              {filteredRows.length} of {groupedRows.length} domains
            </span>
          )}
        </div>
      </div>

      {/* Results Table */}
      <div className="glass rounded-xl p-5">
        {loading && rawData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-purple-400 rounded-full animate-spin mb-4" />
            <p className="text-sm text-gray-500">Loading social media data...</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Share2 size={40} className="text-gray-700 mb-3" />
            <p className="text-sm text-gray-500">
              {rawData.length === 0
                ? 'No social media data to display.'
                : 'No domains match your filters.'}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {rawData.length === 0
                ? 'Process domains first, then view discovered social links here.'
                : 'Try adjusting the search query or platform filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-xs text-gray-500 font-medium pb-3 pr-4">Domain</th>
                  {PLATFORM_CONFIG.map((p) => {
                    const Icon = p.icon
                    return (
                      <th key={p.key} className="text-xs text-gray-500 font-medium pb-3 pr-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Icon size={13} className={p.color} />
                          <span>{p.label}</span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-3 pr-4">
                      <span className="text-sm font-mono text-gray-200">{row.domain}</span>
                    </td>
                    {PLATFORM_CONFIG.map((p) => {
                      const url = row[p.key]
                      return (
                        <td key={p.key} className="py-3 pr-4 text-center">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700
                                         transition-colors ${p.color}`}
                              title={url}
                            >
                              <ExternalLink size={13} />
                            </a>
                          ) : (
                            <span className="text-gray-700">&mdash;</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
