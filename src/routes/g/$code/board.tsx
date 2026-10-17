import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { buttonClasses, PageHeader } from '@/components'
import { eventsQuery, killFeed, standings } from '@/features/board/feed'
import { FeedList } from '@/features/board/FeedList'
import { StandingsList } from '@/features/board/StandingsList'
import { useGameContext } from '@/features/game/queries'
import { cn } from '@/lib/cn'
import { useUserId } from '@/lib/useUserId'

const Tab = z.enum(['standings', 'feed'])

export const Route = createFileRoute('/g/$code/board')({
  validateSearch: z.object({ tab: Tab.optional() }),
  component: Board,
})

function Board() {
  const { code } = Route.useParams()
  const { tab = 'standings' } = Route.useSearch()
  const { game, players, me } = useGameContext(code, useUserId())
  const { data: events = [] } = useQuery(eventsQuery(game.id))
  const kills = killFeed(events)

  return (
    <main className="flex flex-col gap-5 pt-4">
      <PageHeader kicker={game.name} title="The board" />

      <div
        role="tablist"
        aria-label="Board"
        className="grid grid-cols-2 overflow-hidden rounded-xl brut shadow-hard-sm"
      >
        {Tab.options.map((t) => (
          <Link
            key={t}
            to="/g/$code/board"
            params={{ code }}
            search={{ tab: t }}
            replace
            role="tab"
            aria-selected={tab === t}
            className={cn(
              'flex min-h-12 items-center justify-center label-mono text-sm',
              tab === t ? 'bg-ink text-paper' : 'bg-paper text-ink',
              t === 'standings' && 'border-r-3 border-ink',
            )}
          >
            {t === 'standings' ? 'Standings' : 'Kill feed'}
          </Link>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'standings' ? (
          <StandingsList
            rows={standings(players, game.winner_player_id)}
            meId={me.id}
            winnerId={game.winner_player_id}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {kills.some((k) => k.type === 'kill_confirmed') && (
              <Link
                to="/g/$code/killcam"
                params={{ code }}
                className={buttonClasses('red', 'md', true)}
              >
                ▶ {game.status === 'finished' ? 'Watch the kill cam' : 'Kill cam so far'}
              </Link>
            )}
            <FeedList items={kills} empty="No kills yet. Everyone is still breathing." />
          </div>
        )}
      </div>

      {game.status === 'finished' && (
        <Link
          to="/g/$code/winner"
          params={{ code }}
          className={buttonClasses('yellow', 'md', true)}
        >
          ← Back to the winner
        </Link>
      )}
    </main>
  )
}
