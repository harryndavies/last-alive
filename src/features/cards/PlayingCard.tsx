import { cn } from '@/lib/cn'
import type { CardKind } from './suggestions'

const TONE: Record<CardKind, string> = {
  weapon: 'bg-red',
  place: 'bg-blue',
  object: 'bg-mint',
}
const ICON: Record<CardKind, string> = { weapon: '🗡', place: '⌖', object: '◆' }
const LABEL: Record<CardKind, string> = { weapon: 'Weapon', place: 'Place', object: 'Object' }

export interface PlayingCardProps {
  kind: CardKind
  text: string
  tilt?: -2 | -1 | 0 | 1 | 2
  badge?: string
  hidden?: boolean
  className?: string
}

const TILT = { [-2]: '-rotate-2', [-1]: '-rotate-1', 0: '', 1: 'rotate-1', 2: 'rotate-2' } as const

/** A weapon / place / object card. */
export function PlayingCard({ kind, text, tilt = 0, badge, hidden, className }: PlayingCardProps) {
  return (
    <div
      className={cn(
        'relative flex min-h-24 flex-col justify-between rounded-2xl brut p-3 text-ink shadow-hard',
        TONE[kind],
        TILT[tilt],
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="label-mono">
          <span aria-hidden="true">{ICON[kind]} </span>
          {LABEL[kind]}
          {kind === 'object' && <span className="opacity-80"> · bonus</span>}
        </span>
        {badge && (
          <span className="rotate-3 rounded-md border-2 border-ink bg-yellow px-1.5 label-mono shadow-hard-sm">
            {badge}
          </span>
        )}
      </div>
      <p
        className={cn(
          'font-display text-2xl leading-tight uppercase',
          hidden && 'tracking-widest select-none',
        )}
      >
        {hidden ? '••••••••' : text}
      </p>
    </div>
  )
}
