import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** A rubber stamp ("TOP SECRET", "KIA") for the spy theme. */
export function Stamp({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block -rotate-3 border-4 border-red-ink px-3 font-display text-3xl leading-tight text-red-ink uppercase',
        className,
      )}
    >
      {children}
    </span>
  )
}
