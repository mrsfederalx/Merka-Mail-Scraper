import { useState, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  Upload, FileSpreadsheet, Download, Loader2, AlertCircle,
  CheckCircle, XCircle, Table2, Merge, Search,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import StatCard from '../layout/StatCard'

// Separate axios instance for multipart uploads:
// - No default Content-Type (browser sets multipart/form-data with boundary automatically)
// - Long timeout for large files
// - 401 → refresh token → retry
const longApi = axios.create({ baseURL: '/api', timeout: 600000 })

longApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

longApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) {
        window.location.href = '/login'
        return Promise.reject(error)
      }
      try {
        const { data } = await axios.post('/api/auth/refresh', { refresh_token: refreshToken })
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return longApi(original)
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }
    return Promise.reject(error)
  }
)

interface PreviewData {
  columns: string[]
  preview_rows: Record<string, string>[]
  total_rows: number
  domain_column: string | null
}

interface MergeStats {
  total_csv_rows: number
  matched_domains: number
  unmatched_domains: number
  total_emails_in_db: number
  total_contacts_in_db: number
  db_domains_total: number
}

export default function CSVMerge() {
  const { user } = useAuth()

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [domainColumn, setDomainColumn] = useState('website')
  const [stats, setStats] = useState<MergeStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file selection
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile)
    setError(null)
    setSuccess(null)
    setStats(null)
    setLoading(true)

    try {
      // Preview
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await longApi.post('/csv-merge/preview', formData)
      if (res.data.success) {
        const previewData = res.data.data as PreviewData
        setPreview(previewData)
        if (previewData.domain_column) {
          setDomainColumn(previewData.domain_column)
        }

        // Auto-fetch stats
        const statsForm = new FormData()
        statsForm.append('file', selectedFile)
        statsForm.append('domain_column', previewData.domain_column || 'website')

        const statsRes = await longApi.post('/csv-merge/stats', statsForm)
        if (statsRes.data.success) {
          setStats(statsRes.data.data)
        }
      } else {
        setError(res.data.error || 'Preview basarisiz')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dosya okunamadi')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.csv') || droppedFile.name.endsWith('.txt'))) {
      handleFileSelect(droppedFile)
    }
  }, [handleFileSelect])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) handleFileSelect(selected)
    e.target.value = ''
  }, [handleFileSelect])

  // Merge and download
  const handleMerge = useCallback(async () => {
    if (!file) return

    setMerging(true)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('domain_column', domainColumn)

      const res = await longApi.post('/csv-merge/merge', formData, {
        responseType: 'blob',
      })

      // Download
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `merged_${user?.name || 'export'}_${Date.now()}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      const matchCount = res.headers['x-match-count'] || '?'
      const totalRows = res.headers['x-total-rows'] || '?'
      setSuccess(`Basariyla birlestirildi! ${matchCount} / ${totalRows} domain eslestirildi. XLSX indirildi.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Birlestirme basarisiz')
    } finally {
      setMerging(false)
    }
  }, [file, domainColumn, user])

  // Reset
  const handleReset = () => {
    setFile(null)
    setPreview(null)
    setStats(null)
    setError(null)
    setSuccess(null)
    setDomainColumn('website')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">CSV Birlestirme</h2>
        <p className="text-sm text-gray-500 mt-1">
          CSV dosyanizi DB verileriyle domain bazinda birlestirin &mdash;{' '}
          <span className="text-cyan-400">{user?.name || user?.email}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT PANEL */}
        <div className="space-y-4">
          {/* File Upload */}
          <div className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-purple-500/10">
                <FileSpreadsheet size={16} className="text-purple-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-300">CSV Dosyasi</h3>
            </div>

            {!file ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-700 rounded-lg p-8
                           hover:border-cyan-500/50 transition-colors cursor-pointer
                           flex flex-col items-center justify-center gap-3"
              >
                <Upload size={32} className="text-gray-600" />
                <div className="text-center">
                  <p className="text-sm text-gray-400">CSV dosyasini surukleyin</p>
                  <p className="text-xs text-gray-600 mt-1">veya tiklayarak secin</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-black/40 rounded-lg p-3 border border-gray-800">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet size={16} className="text-purple-400" />
                    <div>
                      <p className="text-sm text-gray-200 truncate max-w-[180px]">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(file.size / 1024).toFixed(1)} KB
                        {preview && ` — ${preview.total_rows} satir`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleReset}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Kaldir
                  </button>
                </div>

                {/* Domain Column Selector */}
                {preview && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Domain Kolonu</label>
                    <select
                      value={domainColumn}
                      onChange={(e) => setDomainColumn(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-gray-800
                                 rounded-lg text-sm text-gray-200 outline-none
                                 focus:border-cyan-500/50"
                    >
                      {preview.columns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Merge Button */}
          {file && preview && (
            <button
              onClick={handleMerge}
              disabled={merging}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg
                         bg-gradient-to-r from-purple-600 to-cyan-500
                         text-white text-sm font-medium
                         hover:from-purple-500 hover:to-cyan-400
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all shadow-lg shadow-purple-500/20"
            >
              {merging ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Birlestiriliyor...
                </>
              ) : (
                <>
                  <Merge size={16} />
                  Birlestir ve XLSX Indir
                </>
              )}
            </button>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats Cards */}
          {stats ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                title="CSV Satir"
                value={stats.total_csv_rows}
                icon={Table2}
                color="purple"
              />
              <StatCard
                title="Eslesen Domain"
                value={stats.matched_domains}
                icon={CheckCircle}
                color="emerald"
              />
              <StatCard
                title="Eslesmeyen"
                value={stats.unmatched_domains}
                icon={XCircle}
                color="red"
              />
              <StatCard
                title="DB Email"
                value={stats.total_emails_in_db}
                icon={Search}
                color="cyan"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard title="CSV Satir" value={0} icon={Table2} color="purple" />
              <StatCard title="Eslesen Domain" value={0} icon={CheckCircle} color="emerald" />
              <StatCard title="Eslesmeyen" value={0} icon={XCircle} color="red" />
              <StatCard title="DB Email" value={0} icon={Search} color="cyan" />
            </div>
          )}

          {/* Match Rate Bar */}
          {stats && stats.total_csv_rows > 0 && (
            <div className="glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Eslestirme Orani</span>
                <span className="text-xs font-mono text-cyan-400">
                  {Math.round((stats.matched_domains / stats.total_csv_rows) * 100)}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all duration-500"
                  style={{ width: `${(stats.matched_domains / stats.total_csv_rows) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-gray-600">
                  {stats.matched_domains} eslesti / {stats.unmatched_domains} esleemedi
                </span>
                <span className="text-[10px] text-gray-600">
                  DB: {stats.db_domains_total} domain, {stats.total_emails_in_db} email, {stats.total_contacts_in_db} kisi
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="glass rounded-xl p-3 border border-red-500/30 bg-red-500/5">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span className="text-xs text-red-300">{error}</span>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="glass rounded-xl p-3 border border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-center gap-2">
                <Download size={14} className="text-emerald-400 shrink-0" />
                <span className="text-xs text-emerald-300">{success}</span>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="glass rounded-xl p-8 flex flex-col items-center gap-3">
              <Loader2 size={24} className="text-cyan-400 animate-spin" />
              <p className="text-sm text-gray-400">CSV analiz ediliyor...</p>
            </div>
          )}

          {/* CSV Preview Table */}
          {preview && !loading && (
            <div className="glass rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-cyan-500/10">
                  <Table2 size={14} className="text-cyan-400" />
                </div>
                <h3 className="text-sm font-medium text-gray-300">On Izleme (ilk 10 satir)</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">
                  {preview.columns.length} kolon
                </span>
              </div>
              <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '350px' }}>
                <table className="text-left min-w-full">
                  <thead className="sticky top-0 bg-gray-900/95 z-10">
                    <tr className="border-b border-gray-800">
                      {preview.columns
                        .filter((c) => c !== 'raw_data')
                        .slice(0, 10)
                        .map((col) => (
                          <th
                            key={col}
                            className={`text-xs font-medium pb-2 pr-4 whitespace-nowrap ${
                              col === domainColumn ? 'text-cyan-400' : 'text-gray-500'
                            }`}
                          >
                            {col}
                            {col === domainColumn && ' *'}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview_rows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                        {preview.columns
                          .filter((c) => c !== 'raw_data')
                          .slice(0, 10)
                          .map((col) => (
                            <td key={col} className="py-1.5 pr-4">
                              <span className="text-xs text-gray-400 truncate block max-w-[200px]">
                                {row[col] || ''}
                              </span>
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.columns.length > 10 && (
                <p className="text-[10px] text-gray-600 mt-2">
                  + {preview.columns.length - 10} daha fazla kolon gosterilmiyor
                </p>
              )}
            </div>
          )}

          {/* Empty state */}
          {!file && !loading && (
            <div className="glass rounded-xl p-12 flex flex-col items-center justify-center text-center">
              <FileSpreadsheet size={48} className="text-gray-700 mb-4" />
              <p className="text-sm text-gray-500">
                CSV dosyanizi yukleyin — DB&apos;deki email, kisi ve sosyal medya verileri
                domain bazinda otomatik birlestirilecek.
              </p>
              <p className="text-xs text-gray-600 mt-2">
                Desteklenen format: .csv, .txt (virgul veya noktali virgul ayiracli)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
