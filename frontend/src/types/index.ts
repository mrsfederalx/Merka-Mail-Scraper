// ===== Client =====
export interface Client {
  id: number
  name: string
  created_at: string
  domain_count: number
  email_count: number
}

// ===== Domain =====
export type DomainStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'

export interface DomainRecord {
  id: number
  domain: string
  status: DomainStatus
  platform?: string
  method?: string
  error_code?: string
  error_message?: string
  processing_time_ms?: number
  has_cloudflare: boolean
  created_at: string
  processed_at?: string
  emails?: EmailRecord[]
  contacts?: ContactRecord[]
  social_links?: SocialLink[]
}

// ===== Email =====
export type EmailTier = 1 | 2 | 3 | 4
export type EmailClassification = 'junk' | 'generic' | 'department' | 'personal'
export type VerificationStatus = 'unverified' | 'valid' | 'invalid' | 'catch_all'

export interface EmailRecord {
  id: number
  domain_id: number
  email: string
  source?: string
  source_url?: string
  tier?: EmailTier
  classification?: EmailClassification
  confidence?: number
  suggested_role?: string
  is_decision_maker: boolean
  verification_status: VerificationStatus
  mx_valid?: boolean
  smtp_verified?: boolean
  created_at: string
}

// ===== Contact =====
export interface ContactRecord {
  id: number
  domain_id: number
  domain?: string
  full_name?: string
  first_name?: string
  last_name?: string
  role?: string
  linkedin_url?: string
  source?: string
  search_query?: string
  score: number
  email_found?: string | null
  email_verified: boolean
  created_at: string
}

// ===== Social =====
export type SocialPlatform = 'facebook' | 'instagram' | 'twitter' | 'youtube' | 'linkedin'

export interface SocialLink {
  id: number
  domain_id: number
  platform: SocialPlatform
  url: string
  source?: string
  created_at: string
}

// ===== WHOIS =====
export interface WhoisData {
  id: number
  domain_id: number
  registrant_name?: string
  registrant_org?: string
  registrant_email?: string
  registrar?: string
  creation_date?: string
  expiration_date?: string
  phone_numbers?: string[]
  created_at: string
}

// ===== Processing =====
export type JobType = 'crawler' | 'email_discovery' | 'linkedin_dork'
export type JobStatus = 'running' | 'paused' | 'completed' | 'failed'

export interface ProcessingJob {
  id: number
  job_type: JobType
  status: JobStatus
  total_items: number
  processed_items: number
  successful_items: number
  failed_items: number
  started_at: string
  completed_at?: string
}

export interface ProcessingStats {
  total: number
  processed: number
  successful: number
  failed: number
  pending: number
  current_domain?: string
  elapsed_seconds?: number
  estimated_remaining_seconds?: number
}

// ===== Log =====
export type LogLevel = 'DEBUG' | 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  module: string
  domain?: string
  message: string
}

// ===== Settings =====
export interface Settings {
  version: string
  api_keys: {
    gemini_api_key: string
    groq_api_key: string
    ollama_url: string
  }
  processing: {
    default_delay_ms: number
    default_concurrency: number
    default_timeout_ms: number
    max_retries: number
    playwright_timeout_ms: number
    contact_page_timeout_ms: number
  }
  proxy: {
    enabled: boolean
    proxy_list: string[]
    rotation_strategy: string
  }
  ai_classification: {
    enabled: boolean
    provider_priority: string[]
    batch_size: number
    max_html_context_chars: number
  }
  email_discovery: {
    smtp_timeout_seconds: number
    max_patterns_per_name: number
    verify_catch_all: boolean
  }
  linkedin_dorking: {
    rate_limit_seconds: number
    max_results_per_search: number
    default_roles: string[]
  }
}

// ===== Filters =====
export interface DatabaseFilters {
  status?: string
  platform?: string
  method?: string
  tier?: number
  classification?: string
  search?: string
  page?: number
  limit?: number
  start_date?: string
  end_date?: string
}

// ===== Stats =====
export interface DashboardStats {
  total_domains: number
  total_emails: number
  total_contacts: number
  total_social_links: number
  success_rate: number
  decision_makers_found: number
  platforms: Record<string, number>
  email_tiers: Record<string, number>
}
