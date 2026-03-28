import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  color: 'cyan' | 'emerald' | 'purple' | 'red' | 'amber' | 'blue'
  subtitle?: string
}

const COLOR_MAP = {
  cyan: {
    border: 'border-l-cyan-500',
    bg: 'bg-cyan-500/5',
    icon: 'text-cyan-400',
    shadow: 'shadow-cyan-500/5',
    value: 'text-cyan-300',
  },
  emerald: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-500/5',
    icon: 'text-emerald-400',
    shadow: 'shadow-emerald-500/5',
    value: 'text-emerald-300',
  },
  purple: {
    border: 'border-l-purple-500',
    bg: 'bg-purple-500/5',
    icon: 'text-purple-400',
    shadow: 'shadow-purple-500/5',
    value: 'text-purple-300',
  },
  red: {
    border: 'border-l-red-500',
    bg: 'bg-red-500/5',
    icon: 'text-red-400',
    shadow: 'shadow-red-500/5',
    value: 'text-red-300',
  },
  amber: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-500/5',
    icon: 'text-amber-400',
    shadow: 'shadow-amber-500/5',
    value: 'text-amber-300',
  },
  blue: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-500/5',
    icon: 'text-blue-400',
    shadow: 'shadow-blue-500/5',
    value: 'text-blue-300',
  },
}

export default function StatCard({ title, value, icon: Icon, color, subtitle }: StatCardProps) {
  const c = COLOR_MAP[color]

  return (
    <div
      className={`glass rounded-xl p-4 border-l-4 ${c.border} ${c.bg}
                  shadow-2xl ${c.shadow} transition-all hover:scale-[1.02]`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${c.value}`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-2 rounded-lg ${c.bg}`}>
          <Icon size={20} className={c.icon} />
        </div>
      </div>
    </div>
  )
}
