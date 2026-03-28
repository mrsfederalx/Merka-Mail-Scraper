import type { LogEntry, ProcessingStats } from './index'

export type WSMessageType =
  | 'connected'
  | 'log'
  | 'progress'
  | 'domain_result'
  | 'email_classified'
  | 'notification'
  | 'pong'

export interface WSMessage {
  type: WSMessageType
  data: unknown
}

export interface WSConnectedMessage {
  type: 'connected'
  data: {
    client_id: number
    server_version: string
  }
}

export interface WSLogMessage {
  type: 'log'
  data: LogEntry
}

export interface WSProgressMessage {
  type: 'progress'
  data: ProcessingStats & {
    job_id: number
    job_type: string
    status: string
  }
}

export interface WSDomainResultMessage {
  type: 'domain_result'
  data: {
    domain: string
    status: string
    emails_found: number
    social_links_found: number
    contacts_found: number
    processing_time_ms: number
    platform?: string
  }
}

export interface WSEmailClassifiedMessage {
  type: 'email_classified'
  data: {
    email: string
    domain: string
    tier: number
    classification: string
    confidence: number
    suggested_role?: string
    is_decision_maker: boolean
  }
}

export interface WSNotificationMessage {
  type: 'notification'
  data: {
    level: 'info' | 'warning' | 'error'
    title: string
    message: string
  }
}
