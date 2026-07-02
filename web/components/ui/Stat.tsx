import type { ReactNode } from 'react'

interface StatProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'success' | 'warning' | 'danger'
  className?: string
}

const valueTones = {
  default: 'text-white',
  success: 'text-emerald-400',
  warning: 'text-cyan-400',
  danger: 'text-red-400',
}

export function Stat({ label, value, hint, tone = 'default', className = '' }: StatProps) {
  return (
    <div className={`rounded-xl border border-stone-800 bg-stone-900 px-5 py-4 ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${valueTones[tone]}`}>{value}</div>
      {hint != null && <div className="mt-1 text-sm text-stone-400">{hint}</div>}
    </div>
  )
}

export default Stat
