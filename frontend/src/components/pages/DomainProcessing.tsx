import { useState, useCallback } from 'react'
import { Play, Pause, Square, RotateCcw, Upload, CheckCircle, XCircle, Clock } from 'lucide-react'
import StatCard from '../layout/StatCard'
import TerminalLog from '../layout/TerminalLog'
import ProgressBar from '../shared/ProgressBar'
import { useWebSocket } from '../../contexts/WebSocketContext'
import { useApi } from '../../hooks/useApi'

type ProcessState = 'idle' | 'running' | 'paused'

export default function DomainProcessing() {
  const { logs, progress, clearLogs } = useWebSocket()
  const { post, loading } = useApi()

  const [domainText, setDomainText] = useState('')
  const [processState, setProcessState] = useState<ProcessState>('idle')
  const [concurrency, setConcurrency] = useState(3)
  const [delay, setDelay] = useState(3000)

  const parseDomains = useCallback((text: string): string[] => {
    return text
      .split(/[\n,;]+/)
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0)
      .map((d) => d.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, ''))
      .filter((d, i, arr) => arr.indexOf(d) === i)
  }, [])

  const domainCount = parseDomains(domainText).length

  const handleStart = async () => {
    const domains = parseDomains(domainText)
    if (domains.length === 0) return

    const res = await post('/crawler/start', {
      domains,
      concurrency,
      delay,
    })

    if (res.success) {
      setProcessState('running')
      clearLogs()
    }
  }

  const handlePause = async () => {
    await post('/crawler/pause')
    setProcessState('paused')
  }

  const handleResume = async () => {
    await post('/crawler/resume')
    setProcessState('running')
  }

  const handleStop = async () => {
    await post('/crawler/stop')
    setProcessState('idle')
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length === 0) return

      const parseCSVLine = (line: string) =>
        line.split(',').map((col) => col.trim().replace(/^"|"$/g, ''))

      const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase())
      const domainKeywords = ['domain', 'website', 'url', 'site', 'web', 'host']
      const colIndex = headers.findIndex((h) => domainKeywords.some((k) => h.includes(k)))

      let domains: string[]
      if (colIndex !== -1) {
        domains = lines.slice(1)
          .map((line) => parseCSVLine(line)[colIndex] ?? '')
          .filter((d) => d.length > 0)
      } else {
        // Fallback: first column
        domains = lines.slice(1)
          .map((line) => parseCSVLine(line)[0] ?? '')
          .filter((d) => d.length > 0)
      }

      setDomainText((prev) => (prev ? prev + '\n' : '') + domains.join('\n'))
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Domain Processing</h2>
          <p className="text-sm text-gray-500 mt-1">Bulk domain scraping</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {processState === 'idle' && (
            <button
              onClick={handleStart}
              disabled={loading || domainCount === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg
                         bg-gradient-to-r from-emerald-500 to-cyan-500
                         text-white font-medium text-sm
                         hover:from-emerald-400 hover:to-cyan-400
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all shadow-lg shadow-emerald-500/20"
            >
              <Play size={16} />
              Start ({domainCount})
            </button>
          )}

          {processState === 'running' && (
            <>
              <button
                onClick={handlePause}
                className="flex items-center gap-2 px-4 py-2 rounded-lg
                           bg-amber-500/10 border border-amber-500/30 text-amber-400
                           hover:bg-amber-500/20 transition-all text-sm"
              >
                <Pause size={16} />
                Pause
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 rounded-lg
                           bg-red-500/10 border border-red-500/30 text-red-400
                           hover:bg-red-500/20 transition-all text-sm"
              >
                <Square size={16} />
                Stop
              </button>
            </>
          )}

          {processState === 'paused' && (
            <>
              <button
                onClick={handleResume}
                className="flex items-center gap-2 px-4 py-2 rounded-lg
                           bg-gradient-to-r from-emerald-500 to-cyan-500
                           text-white font-medium text-sm transition-all"
              >
                <RotateCcw size={16} />
                Resume
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 rounded-lg
                           bg-red-500/10 border border-red-500/30 text-red-400
                           hover:bg-red-500/20 transition-all text-sm"
              >
                <Square size={16} />
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input */}
        <div className="space-y-4">
          {/* Domain Input */}
          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-300">Domain List</h3>
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                               bg-gray-800 hover:bg-gray-700 cursor-pointer
                               text-xs text-gray-400 hover:text-gray-200 transition-colors">
                <Upload size={14} />
                Upload .csv
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
            <textarea
              value={domainText}
              onChange={(e) => setDomainText(e.target.value)}
              placeholder="Enter domains (one per line)&#10;example.com&#10;another-site.com&#10;..."
              className="w-full h-64 bg-black/40 rounded-lg p-3 text-sm font-mono
                         text-gray-300 placeholder-gray-600
                         border border-gray-800 focus:border-cyan-500/50
                         outline-none resize-none"
              disabled={processState !== 'idle'}
            />
            <p className="text-xs text-gray-500 mt-2">
              {domainCount} unique domain{domainCount !== 1 ? 's' : ''} detected
            </p>
          </div>

          {/* Config */}
          <div className="glass rounded-xl p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Processing Config</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Concurrency</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700
                             rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500"
                  disabled={processState !== 'idle'}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Delay (ms)</label>
                <input
                  type="number"
                  min={0}
                  max={30000}
                  step={500}
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700
                             rounded-lg text-sm text-gray-200 outline-none focus:border-cyan-500"
                  disabled={processState !== 'idle'}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Progress + Logs */}
        <div className="space-y-4">
          {/* Progress */}
          {progress && (
            <div className="glass rounded-xl p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Progress</h3>
              <ProgressBar value={progress.processed} max={progress.total} />
              {progress.current_domain && (
                <p className="text-xs text-gray-500 mt-2 font-mono truncate">
                  Processing: {progress.current_domain}
                </p>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              title="Successful"
              value={progress?.successful || 0}
              icon={CheckCircle}
              color="emerald"
            />
            <StatCard
              title="Failed"
              value={progress?.failed || 0}
              icon={XCircle}
              color="red"
            />
            <StatCard
              title="Pending"
              value={progress?.pending || 0}
              icon={Clock}
              color="amber"
            />
          </div>

          {/* Terminal */}
          <TerminalLog logs={logs} title="crawler" maxHeight="340px" />
        </div>
      </div>
    </div>
  )
}
