import { KillPhoto } from '@/features/kills/KillPhoto'
import { cn } from '@/lib/cn'
import { timeAgo, type FeedItem } from './feed'

const TONE = {
  red: 'bg-red',
  mint: 'bg-mint',
  yellow: 'bg-yellow',
  blue: 'bg-blue',
  pink: 'bg-pink',
  paper: 'bg-paper',
} as const

export function FeedList({
  items,
  empty = 'Nothing yet. Quiet… too quiet.',
}: {
  items: FeedItem[]
  empty?: string
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border-2 border-dashed border-ink p-4 text-center label-mono">
        {empty}
      </p>
    )
  }
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-3 rounded-xl brut bg-paper p-3 shadow-hard-sm"
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex size-10 shrink-0 items-center justify-center rounded-lg brut font-display text-lg',
              TONE[item.tone],
            )}
          >
            {item.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="leading-snug font-bold">{item.text}</p>
            {item.detail && <p className="text-sm text-muted">{item.detail}</p>}
            {item.photoPath && (
              <KillPhoto
                path={item.photoPath}
                alt={item.text}
                className="mt-2 aspect-[4/3] w-full rounded-lg"
              />
            )}
            <p className="mt-0.5 label-mono text-muted">
              <time dateTime={item.at}>{timeAgo(item.at)}</time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
