interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  processing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  skipped: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  running: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  // Email classifications
  junk: 'bg-red-500/10 text-red-400 border-red-500/20',
  generic: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  department: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  personal: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  // Verification
  unverified: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  valid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  invalid: 'bg-red-500/10 text-red-400 border-red-500/20',
  catch_all: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'

  return (
    <span className={`inline-flex items-center ${sizeClass} rounded-full border font-medium ${style}`}>
      {status}
    </span>
  )
}
