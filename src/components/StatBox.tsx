import { cn } from '@/lib/cn'

export interface StatBoxProps {
  label: string
  value: number | string
  tone?: 'yellow' | 'mint' | 'pink' | 'blue' | 'paper' | 'red'
  className?: string
}

const TONE = {
  yellow: 'bg-yellow',
  mint: 'bg-mint',
  pink: 'bg-pink',
  blue: 'bg-blue',
  paper: 'bg-paper',
  red: 'bg-red',
} as const

export function StatBox({ label, value, tone = 'paper', className }: StatBoxProps) {
  return (
    <div className={cn('rounded-xl brut p-3 text-ink shadow-hard-sm', TONE[tone], className)}>
      <div className="font-display text-3xl leading-none">{value}</div>
      <div className="mt-1 label-mono">{label}</div>
    </div>
  )
}
