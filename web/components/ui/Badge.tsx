import type { HTMLAttributes } from 'react'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'amber'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-stone-800 text-stone-300 border-stone-700',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  warning: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  danger: 'bg-red-500/15 text-red-300 border-red-500/30',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  amber: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
}

// Maps common compliance/status strings to a tone for convenience.
export function toneForStatus(status?: string): BadgeTone {
  const s = (status ?? '').toLowerCase()
  if (['compliant', 'resolved', 'active', 'passed', 'admitted', 'ok', 'paid'].includes(s)) return 'success'
  if (['deficient', 'failed', 'expired', 'overdue', 'terminated', 'uninsured'].includes(s)) return 'danger'
  if (['pending', 'expiring', 'waived', 'open', 'requested', 'in_progress'].includes(s)) return 'warning'
  return 'neutral'
}

export function Badge({ tone = 'neutral', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

export default Badge
