interface ProgressBarProps {
  value: number
  max: number
  color?: 'cyan' | 'emerald' | 'purple' | 'blue'
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function ProgressBar({
  value,
  max,
  color = 'cyan',
  showLabel = true,
  size = 'md',
}: ProgressBarProps) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0

  const colorMap = {
    cyan: 'from-cyan-500 to-blue-500',
    emerald: 'from-emerald-500 to-cyan-500',
    purple: 'from-purple-500 to-blue-500',
    blue: 'from-blue-500 to-indigo-500',
  }

  const sizeMap = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  }

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-400">
            {value.toLocaleString()} / {max.toLocaleString()}
          </span>
          <span className="text-xs font-mono text-cyan-400">{percent}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-800 rounded-full ${sizeMap[size]} overflow-hidden`}>
        <div
          className={`${sizeMap[size]} rounded-full bg-gradient-to-r ${colorMap[color]}
                      transition-all duration-500 ease-out relative overflow-hidden`}
          style={{ width: `${percent}%` }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 shimmer" />
        </div>
      </div>
    </div>
  )
}
