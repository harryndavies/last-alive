import { queryOptions, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Avatar } from '@/components'
import { cn } from '@/lib/cn'
import { rpcParsed } from '@/lib/rpc'

const SeasonSchema = z.object({
  games: z.number().int(),
  rows: z.array(
    z.object({
      user_id: z.uuid(),
      name: z.string(),
      colour: z.string(),
      played: z.number().int(),
      points: z.number().int(),
    }),
  ),
})

export const seasonQuery = (gameId: string) =>
  queryOptions({
    queryKey: ['season', gameId] as const,
    queryFn: () => rpcParsed('season_standings', { p_game_id: gameId }, SeasonSchema),
  })

/** The league across this chain of rematches. Hidden for one-off games. */
export function SeasonTable({ gameId, userId }: { gameId: string; userId: string }) {
  const { data } = useQuery(seasonQuery(gameId))
  if (!data || data.games < 2) return null
  return (
    <section aria-labelledby="season-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="season-heading" className="text-2xl">
          Season · {data.games} games
        </h2>
        <p className="label-mono text-muted">Win 10 · Kill 2 · Survive 1</p>
      </div>
      <ol className="flex flex-col gap-2" aria-label="Season standings">
        {data.rows.map((row, i) => (
          <li
            key={row.user_id}
            className={cn(
              'flex min-h-14 items-center gap-3 rounded-xl brut px-3 py-2 shadow-hard-sm',
              i === 0 ? 'bg-yellow' : 'bg-paper',
            )}
          >
            <span className="w-7 shrink-0 text-center font-display text-xl">{i + 1}</span>
            <Avatar name={row.name} colour={row.colour} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold">
                {row.name}
                {row.user_id === userId && <span className="text-muted"> (you)</span>}
              </p>
              <p className="label-mono text-muted">{row.played} played</p>
            </div>
            <span className="text-right">
              <span className="block font-display text-xl leading-none">{row.points}</span>
              <span className="label-mono">pts</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
