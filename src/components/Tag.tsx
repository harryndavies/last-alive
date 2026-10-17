import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type TagTone = 'yellow' | 'red' | 'blue' | 'mint' | 'pink' | 'paper' | 'ink'

const TONE: Record<TagTone, string> = {
  yellow: 'bg-yellow text-ink',
  red: 'bg-red text-ink',
  blue: 'bg-blue text-ink',
  mint: 'bg-mint text-ink',
  pink: 'bg-pink text-ink',
  paper: 'bg-paper text-ink',
  ink: 'bg-ink text-paper',
}

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone
  tilt?: boolean
}

export function Tag({ tone = 'yellow', tilt, className, ...rest }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border-2 border-ink px-2 py-0.5 label-mono shadow-hard-sm',
        TONE[tone],
        tilt && '-rotate-2',
        className,
      )}
      {...rest}
    />
  )
}
