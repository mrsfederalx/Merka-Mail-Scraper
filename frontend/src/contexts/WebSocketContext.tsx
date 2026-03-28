import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { WSMessage, WSLogMessage, WSProgressMessage } from '../types/websocket'
import type { LogEntry, ProcessingStats } from '../types'
import { WS_BASE_URL } from '../utils/constants'
import { useAuth } from './AuthContext'

interface WebSocketContextType {
  connected: boolean
  logs: LogEntry[]
  progress: ProcessingStats | null
  lastMessage: WSMessage | null
  clearLogs: () => void
}

const WebSocketContext = createContext<WebSocketContextType | null>(null)

const MAX_LOGS = 500

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const clientId = user?.client_id ?? null

  const [connected, setConnected] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [progress, setProgress] = useState<ProcessingStats | null>(null)
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number>()

  const clearLogs = useCallback(() => setLogs([]), [])

  useEffect(() => {
    if (clientId === null) return

    let destroyed = false

    function connect() {
      if (destroyed) return

      const token = localStorage.getItem('access_token')
      const url = token
        ? `${WS_BASE_URL}/${clientId}?token=${encodeURIComponent(token)}`
        : `${WS_BASE_URL}/${clientId}`

      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!destroyed) setConnected(true)
      }

      ws.onclose = () => {
        if (!destroyed) {
          setConnected(false)
          reconnectTimeoutRef.current = window.setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data)
          setLastMessage(msg)

          if (msg.type === 'log') {
            const logMsg = msg as WSLogMessage
            setLogs((prev) => {
              const next = [...prev, logMsg.data]
              return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next
            })
          }

          if (msg.type === 'progress') {
            const progMsg = msg as WSProgressMessage
            setProgress(progMsg.data)
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Ping every 30 seconds
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30000)

      ws.addEventListener('close', () => clearInterval(pingInterval))
    }

    connect()

    return () => {
      destroyed = true
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      wsRef.current?.close()
    }
  }, [clientId])

  return (
    <WebSocketContext.Provider
      value={{ connected, logs, progress, lastMessage, clearLogs }}
    >
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext)
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider')
  return ctx
}
