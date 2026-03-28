export const API_BASE_URL = '/api'

// Use Vite proxy — works for both dev and prod
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
export const WS_BASE_URL = `${wsProtocol}//${window.location.host}/ws`

export const PAGES = {
  DASHBOARD: 'dashboard',
  DOMAIN_PROCESSING: 'domain-processing',
  EMAIL_DISCOVERY: 'email-discovery',
  LINKEDIN_DORKER: 'linkedin-dorker',
  SOCIAL_MEDIA: 'social-media',
  DATABASE_VIEWER: 'database-viewer',
  BLACKLIST_MANAGER: 'blacklist-manager',
  CSV_MERGE: 'csv-merge',
  SETTINGS: 'settings',
} as const

export type PageType = typeof PAGES[keyof typeof PAGES]
