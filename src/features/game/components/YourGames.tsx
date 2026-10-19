import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Avatar, Card } from '@/components'
import { cn } from '@/lib/cn'
import { useUserId } from '@/lib/useUserId'
import { myGamesQuery, type MyGame } from '../myGames'

/** The games this device has a seat in, so you can jump back in without the code. */
export function YourGames() {
  const userId = useUserId()
  const { data: games } = useQuery(myGamesQuery(userId))
  if (!games || games.length === 0) return null
  return <YourGamesList games={games} />
}

interface YourGamesListProps {
  games: readonly MyGame[]
  /** The game you're in now: shown as "You're here" instead of a link. */
  currentCode?: string
  /** Leave out the heading when something else already titles the list (a sheet). */
  heading?: boolean
}

export function YourGamesList({ games, currentCode, heading = true }: YourGamesListProps) {
  return (
    <section aria-labelledby={heading ? 'your-games' : undefined} className="flex flex-col gap-2">
      {heading && (
        <h2 id="your-games" className="label-mono">
          Your games
        </h2>
      )}
      <Card tone="paper" className="flex flex-col gap-1 p-2">
        {games.map((g) => {
          const rowClass = cn(
            'flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5',
            g.finished && 'opacity-70',
          )
          const details = (
            <>
              <Avatar name={g.playerName} colour={g.colour} size="sm" dead={g.dead} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-bold">{g.gameName}</span>
                <span className="truncate text-sm text-muted">
                  {g.playerName} · {g.summary}
                </span>
              </span>
            </>
          )
          return g.code === currentCode ? (
            <div key={g.code} aria-current="page" className={cn(rowClass, 'bg-ground')}>
              {details}
              <span className="shrink-0 label-mono">You&rsquo;re here</span>
            </div>
          ) : (
            <Link
              key={g.code}
              to="/g/$code"
              params={{ code: g.code }}
              className={cn(rowClass, 'active:bg-ground')}
            >
              {details}
              <span className="shrink-0 label-mono">{g.code}</span>
            </Link>
          )
        })}
      </Card>
    </section>
  )
}
