import { Sprite } from '@/components'
import { cn } from '@/lib/cn'
import { CARD_SPRITE } from './cardSprites'
import { useCopy, useTheme } from '@/lib/theme'
import type { CardKind } from './suggestions'

const TONE: Record<CardKind, string> = {
  weapon: 'bg-red',
  place: 'bg-blue',
  phrase: 'bg-mint',
}
const ICON: Record<CardKind, string> = { weapon: '🗡', place: '⌖', phrase: '❝' }

export interface PlayingCardProps {
  kind: CardKind
  text: string
  tilt?: -2 | -1 | 0 | 1 | 2
  badge?: string
  hidden?: boolean
  /** Flip the card over as it appears, after this many ms. */
  flipDelay?: number
  className?: string
}

const TILT = { [-2]: '-rotate-2', [-1]: '-rotate-1', 0: '', 1: 'rotate-1', 2: 'rotate-2' } as const

/** A weapon / place / phrase card. */
export function PlayingCard({
  kind,
  text,
  tilt = 0,
  badge,
  hidden,
  flipDelay,
  className,
}: PlayingCardProps) {
  const copy = useCopy()
  // Spy games show cards as typed lines on the file: plain paper, no tilt.
  const spy = useTheme() === 'spy'
  return (
    <div
      className={cn(
        'relative flex min-h-24 flex-col justify-between rounded-2xl brut p-3 text-ink shadow-hard',
        spy ? 'bg-paper' : TONE[kind],
        !spy && TILT[tilt],
        flipDelay !== undefined && 'motion-safe:animate-[card-flip_450ms_ease-out_both]',
        className,
      )}
      style={flipDelay !== undefined ? { animationDelay: `${flipDelay}ms` } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="label-mono">
          {spy && <span aria-hidden="true">{ICON[kind]} </span>}
          {copy[kind]}
        </span>
        {badge && (
          <span className="rotate-3 rounded-md border-2 border-ink bg-yellow px-1.5 label-mono shadow-hard-sm">
            {badge}
          </span>
        )}
      </div>
      {!spy && (
        <Sprite
          name={CARD_SPRITE[kind].name}
          className={cn('absolute right-3 bottom-3', CARD_SPRITE[kind].width)}
        />
      )}
      <p
        className={cn(
          'font-display text-2xl leading-tight uppercase',
          !spy && 'pr-18',
          hidden && 'tracking-widest select-none',
        )}
      >
        {hidden ? '••••••••' : kind === 'phrase' ? `“${text}”` : text}
      </p>
    </div>
  )
}
