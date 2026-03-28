import { useEffect, useState } from 'react'
import { Globe, Mail, Users, Share2, Target, TrendingUp } from 'lucide-react'
import StatCard from '../layout/StatCard'
import TerminalLog from '../layout/TerminalLog'
import { useWebSocket } from '../../contexts/WebSocketContext'
import { useAuth } from '../../contexts/AuthContext'
import { useApi } from '../../hooks/useApi'
import type { DashboardStats } from '../../types'

export default function Dashboard() {
  const { logs } = useWebSocket()
  const { user } = useAuth()
  const { get } = useApi()
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    async function loadStats() {
      const domainRes = await get<Record<string, number>>('/results/stats')
      const emailRes = await get<Record<string, number>>('/emails/stats')

      if (domainRes.success && emailRes.success) {
        setStats({
          total_domains: domainRes.data?.total || 0,
          total_emails: emailRes.data?.total || 0,
          total_contacts: 0,
          total_social_links: 0,
          success_rate: domainRes.data?.total
            ? Math.round(((domainRes.data?.completed || 0) / domainRes.data.total) * 100)
            : 0,
          decision_makers_found: emailRes.data?.decision_makers || 0,
          platforms: {},
          email_tiers: {},
        })
      }
    }
    loadStats()
  }, [user?.client_id, get])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">
          Hoş geldiniz, <span className="text-cyan-400">{user?.name || user?.email}</span>
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Domains"
          value={stats?.total_domains || 0}
          icon={Globe}
          color="cyan"
        />
        <StatCard
          title="Emails Found"
          value={stats?.total_emails || 0}
          icon={Mail}
          color="emerald"
        />
        <StatCard
          title="Decision Makers"
          value={stats?.decision_makers_found || 0}
          icon={Target}
          color="purple"
        />
        <StatCard
          title="Contacts"
          value={stats?.total_contacts || 0}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Social Links"
          value={stats?.total_social_links || 0}
          icon={Share2}
          color="amber"
        />
        <StatCard
          title="Success Rate"
          value={`${stats?.success_rate || 0}%`}
          icon={TrendingUp}
          color="emerald"
        />
      </div>

      {/* Recent Activity */}
      <TerminalLog logs={logs.slice(-100)} title="Recent Activity" maxHeight="350px" />
    </div>
  )
}
