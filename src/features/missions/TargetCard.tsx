import type { ReactNode } from 'react'
import { Avatar, Tag } from '@/components'
import { cn } from '@/lib/cn'
import { useNames, useTheme } from '@/lib/theme'
import type { Player } from '@/features/game/schemas'

export interface TargetCardProps {
  target: Player | undefined
  hidden?: boolean
  badge?: string
  children?: ReactNode
  className?: string
}

export function TargetCard({ target, hidden, badge, children, className }: TargetCardProps) {
  const theme = useTheme()
  const names = useNames()
  return (
    <section
      aria-label="Your target"
      className={cn('relative -rotate-1 rounded-2xl brut bg-pink p-4 shadow-hard-lg', className)}
    >
      <div className="mb-3 flex items-center justify-between">
        <Tag tone="ink">{theme === 'spy' ? 'Subject' : 'Your target'}</Tag>
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
        <div className="min-w-0">
          <p className="font-display text-4xl leading-none break-words uppercase">
            {hidden
              ? theme === 'spy'
                ? 'Classified'
                : 'Hidden'
              : target
                ? names.primary(target)
                : 'Unknown'}
          </p>
          {!hidden && target && names.secondary(target) && (
            <p className="mt-1 text-lg font-bold">{names.secondary(target)}</p>
          )}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  )
}
