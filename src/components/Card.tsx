import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type CardTone = 'paper' | 'yellow' | 'red' | 'blue' | 'mint' | 'pink' | 'ink'

const TONE: Record<CardTone, string> = {
  paper: 'bg-paper text-ink',
  yellow: 'bg-yellow text-ink',
  red: 'bg-red text-ink',
  blue: 'bg-blue text-ink',
  mint: 'bg-mint text-ink',
  pink: 'bg-pink text-ink',
  ink: 'bg-ink text-paper',
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
  /** Rotation in degrees, kept between -2 and 2. */
  tilt?: -2 | -1 | 0 | 1 | 2
  as?: 'div' | 'section' | 'article'
}

const TILT: Record<NonNullable<CardProps['tilt']>, string> = {
  [-2]: '-rotate-2',
  [-1]: '-rotate-1',
  0: '',
  1: 'rotate-1',
  2: 'rotate-2',
}

export function Card({ tone = 'paper', tilt = 0, as: Tag = 'div', className, ...rest }: CardProps) {
  return (
    <Tag
      className={cn('rounded-2xl brut p-4 shadow-hard', TONE[tone], TILT[tilt], className)}
      {...rest}
    />
  )
}
