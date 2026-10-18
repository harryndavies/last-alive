import type { ReactNode } from 'react'
import { Avatar, Tag } from '@/components'
import { cn } from '@/lib/cn'
import type { Player } from '@/features/game/schemas'

export interface TargetCardProps {
  target: Player | undefined
  hidden?: boolean
  badge?: string
  children?: ReactNode
  className?: string
}

export function TargetCard({ target, hidden, badge, children, className }: TargetCardProps) {
  return (
    <section
      aria-label="Your target"
      className={cn('relative -rotate-1 rounded-2xl brut bg-pink p-4 shadow-hard-lg', className)}
    >
      <div className="mb-3 flex items-center justify-between">
        <Tag tone="ink">Your target</Tag>
        {badge && (
          <Tag tone="yellow" className="rotate-3">
            {badge}
          </Tag>
        )}
      </div>
      <div className="flex items-center gap-4">
        {hidden || !target ? (
          <span
            aria-hidden="true"
            className="inline-flex size-16 shrink-0 items-center justify-center rounded-full brut bg-ink font-display text-2xl text-paper shadow-hard-sm"
          >
            ?
          </span>
        ) : (
          <Avatar name={target.name} colour={target.colour} photo={target.avatar_path} size="lg" />
        )}
        <p className="min-w-0 font-display text-4xl leading-none break-words uppercase">
          {hidden ? 'Hidden' : (target?.name ?? 'Unknown')}
        </p>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  )
}
