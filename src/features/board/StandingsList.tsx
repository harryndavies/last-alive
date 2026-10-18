import { Avatar, Tag } from '@/components'
import { cn } from '@/lib/cn'
import type { Standing } from './feed'

export function StandingsList({
  rows,
  meId,
  winnerId,
}: {
  rows: Standing[]
  meId: string
  winnerId?: string | null
}) {
  return (
    <ol className="flex flex-col gap-2.5" aria-label="Standings">
      {rows.map(({ player, rank, killedBy }) => {
        const dead = player.status === 'dead'
        return (
          <li
            key={player.id}
            className={cn(
              'flex min-h-16 items-center gap-3 rounded-xl brut px-3 py-2 shadow-hard-sm',
              player.id === winnerId ? 'bg-yellow' : dead ? 'bg-ground' : 'bg-paper',
            )}
          >
            <span className="w-7 shrink-0 text-center font-display text-xl">{rank}</span>
            <Avatar
              name={player.name}
              colour={player.colour}
              photo={player.avatar_path}
              dead={dead}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate text-lg font-bold',
                  dead && 'text-muted line-through decoration-red-ink decoration-[3px]',
                )}
              >
                {player.name}
                {player.id === meId && <span className="sr-only"> (you)</span>}
              </p>
              {dead && (
                <p className="label-mono text-muted">
                  {killedBy ? `Got by ${killedBy.name}` : 'Left the game'}
                </p>
              )}
            </div>
            {player.id === meId && <Tag tone="blue">You</Tag>}
            <span className="text-right">
              <span className="block font-display text-xl leading-none">{player.kills_count}</span>
              <span className="label-mono">{player.kills_count === 1 ? 'kill' : 'kills'}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
