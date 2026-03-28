import {
  LayoutDashboard,
  Globe,
  Mail,
  Linkedin,
  Share2,
  Database,
  ShieldBan,
  Settings,
  Wifi,
  WifiOff,
  FileSpreadsheet,
  LogOut,
  UserX,
} from 'lucide-react'
import { useWebSocket } from '../../contexts/WebSocketContext'
import { useAuth } from '../../contexts/AuthContext'
import type { PageType } from '../../utils/constants'
import { PAGES } from '../../utils/constants'

interface SidebarProps {
  activeTab: PageType
  onTabChange: (tab: PageType) => void
}

const NAV_ITEMS: {
  id: PageType
  label: string
  icon: typeof LayoutDashboard
  gradient: string
  shadow: string
}[] = [
  {
    id: PAGES.DASHBOARD,
    label: 'Dashboard',
    icon: LayoutDashboard,
    gradient: 'from-blue-500 to-cyan-500',
    shadow: 'shadow-blue-500/20',
  },
  {
    id: PAGES.DOMAIN_PROCESSING,
    label: 'Domain Processing',
    icon: Globe,
    gradient: 'from-blue-500 to-purple-600',
    shadow: 'shadow-purple-500/20',
  },
  {
    id: PAGES.EMAIL_DISCOVERY,
    label: 'Email Discovery',
    icon: Mail,
    gradient: 'from-emerald-500 to-cyan-500',
    shadow: 'shadow-emerald-500/20',
  },
  {
    id: PAGES.LINKEDIN_DORKER,
    label: 'LinkedIn Dorker',
    icon: Linkedin,
    gradient: 'from-blue-600 to-blue-400',
    shadow: 'shadow-blue-500/20',
  },
  {
    id: PAGES.SOCIAL_MEDIA,
    label: 'Social Media',
    icon: Share2,
    gradient: 'from-pink-500 to-purple-500',
    shadow: 'shadow-pink-500/20',
  },
  {
    id: PAGES.DATABASE_VIEWER,
    label: 'Database',
    icon: Database,
    gradient: 'from-green-500 to-emerald-500',
    shadow: 'shadow-green-500/20',
  },
  {
    id: PAGES.CSV_MERGE,
    label: 'CSV Birlestirme',
    icon: FileSpreadsheet,
    gradient: 'from-purple-500 to-pink-500',
    shadow: 'shadow-purple-500/20',
  },
  {
    id: PAGES.BLACKLIST_MANAGER,
    label: 'Blacklist',
    icon: ShieldBan,
    gradient: 'from-red-500 to-orange-500',
    shadow: 'shadow-red-500/20',
  },
  {
    id: PAGES.SETTINGS,
    label: 'Settings',
    icon: Settings,
    gradient: 'from-gray-400 to-gray-500',
    shadow: 'shadow-gray-500/20',
  },
]

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { connected } = useWebSocket()
  const { user, logout, isImpersonating, stopImpersonating } = useAuth()

  return (
    <div className="w-64 h-screen flex flex-col bg-gray-900/80 backdrop-blur-xl border-r border-gray-800/50">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-800/50">
        <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          Merka Mail Scraper
        </h1>
        <p className="text-[10px] text-gray-500 mt-0.5">v6.0 — Secure Platform</p>
      </div>

      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/30">
          <p className="text-[10px] text-amber-400 font-medium">Kullanıcı olarak giriş yapıldı</p>
          <button
            onClick={stopImpersonating}
            className="mt-1 w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded
                       bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-[10px] font-medium transition-colors"
          >
            <UserX size={11} />
            Admin'e Geri Dön
          </button>
        </div>
      )}

      {/* User Info */}
      <div className="px-4 py-3 border-b border-gray-800/50">
        <p className="text-xs text-gray-400 truncate">{user?.email}</p>
        <p className="text-[10px] text-gray-600 mt-0.5 capitalize">{user?.role}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                         text-sm font-medium transition-all duration-200
                         ${isActive
                           ? `bg-gradient-to-r ${item.gradient} text-white shadow-lg ${item.shadow}`
                           : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                         }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Bottom: Connection + Logout */}
      <div className="px-4 py-3 border-t border-gray-800/50 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          {connected ? (
            <>
              <Wifi size={14} className="text-emerald-400" />
              <span className="text-emerald-400">Connected</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="text-red-400" />
              <span className="text-red-400">Disconnected</span>
            </>
          )}
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-red-400 hover:bg-gray-800/50 transition-colors"
        >
          <LogOut size={14} />
          <span>Çıkış Yap</span>
        </button>
      </div>
    </div>
  )
}
