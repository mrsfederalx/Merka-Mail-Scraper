import { useEffect, useRef } from 'react'
import type { LogEntry } from '../../types'

interface TerminalLogProps {
  logs: LogEntry[]
  title?: string
  maxHeight?: string
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-gray-500',
  INFO: 'text-cyan-400',
  SUCCESS: 'text-emerald-400',
  WARNING: 'text-amber-400',
  ERROR: 'text-red-400',
}

const LEVEL_ICONS: Record<string, string> = {
  DEBUG: '│',
  INFO: '→',
  SUCCESS: '✓',
  WARNING: '⚠',
  ERROR: '✗',
}

export default function TerminalLog({ logs, title = 'Terminal', maxHeight = '400px' }: TerminalLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* macOS style title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-900/80 border-b border-gray-800/50">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
        </div>
        <span className="text-xs text-gray-500 font-mono ml-2">{title}</span>
      </div>

      {/* Log content */}
      <div
        className="p-3 overflow-y-auto bg-black/40 font-mono text-xs leading-relaxed"
        style={{ maxHeight }}
      >
        {logs.length === 0 ? (
          <div className="text-gray-600 text-center py-8">
            Waiting for activity...
          </div>
        ) : (
          logs.map((log, i) => {
            const colorClass = LEVEL_COLORS[log.level] || 'text-gray-400'
            const icon = LEVEL_ICONS[log.level] || '|'
            const time = new Date(log.timestamp).toLocaleTimeString('tr-TR')

            return (
              <div key={i} className={`terminal-line ${colorClass} flex gap-2`}>
                <span className="text-gray-600 select-none w-16 shrink-0">{time}</span>
                <span className="select-none w-4">{icon}</span>
                {log.domain && (
                  <span className="text-gray-500 w-32 truncate shrink-0">[{log.domain}]</span>
                )}
                <span className="break-all">{log.message}</span>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
