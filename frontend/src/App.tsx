import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import Sidebar from './components/layout/Sidebar'
import Dashboard from './components/pages/Dashboard'
import DomainProcessing from './components/pages/DomainProcessing'
import EmailDiscovery from './components/pages/EmailDiscovery'
import LinkedInDorker from './components/pages/LinkedInDorker'
import SocialMedia from './components/pages/SocialMedia'
import DatabaseViewer from './components/pages/DatabaseViewer'
import BlacklistManager from './components/pages/BlacklistManager'
import CSVMerge from './components/pages/CSVMerge'
import Settings from './components/pages/Settings'
import Login from './pages/Login'
import LoadingSpinner from './components/shared/LoadingSpinner'
import { PAGES, type PageType } from './utils/constants'

function AppContent() {
  const [activeTab, setActiveTab] = useState<PageType>(PAGES.DASHBOARD)
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-950">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  const renderPage = () => {
    switch (activeTab) {
      case PAGES.DASHBOARD:
        return <Dashboard />
      case PAGES.DOMAIN_PROCESSING:
        return <DomainProcessing />
      case PAGES.EMAIL_DISCOVERY:
        return <EmailDiscovery />
      case PAGES.LINKEDIN_DORKER:
        return <LinkedInDorker />
      case PAGES.SOCIAL_MEDIA:
        return <SocialMedia />
      case PAGES.DATABASE_VIEWER:
        return <DatabaseViewer />
      case PAGES.CSV_MERGE:
        return <CSVMerge />
      case PAGES.BLACKLIST_MANAGER:
        return <BlacklistManager />
      case PAGES.SETTINGS:
        return <Settings />
      default:
        return <Dashboard />
    }
  }

  return (
    <WebSocketProvider>
      <div className="flex h-screen bg-gray-950 overflow-hidden">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 overflow-y-auto p-6">
          {renderPage()}
        </main>
      </div>
    </WebSocketProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
