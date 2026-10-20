import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Avatar, buttonClasses, Card, StatBox, Tag } from '@/components'
import { eventsQuery, standings } from '@/features/board/feed'
import { SeasonTable } from '@/features/board/SeasonTable'
import { StandingsList } from '@/features/board/StandingsList'
import { RematchPanel } from '@/features/game/components/RematchPanel'
import { useGameContext } from '@/features/game/queries'
import { useUserId } from '@/lib/useUserId'

export const Route = createFileRoute('/g/$code/winner')({
  component: Winner,
})

function Winner() {
  const { code } = Route.useParams()
  const userId = useUserId()
  const { game, players, me } = useGameContext(code, userId)
  const { data: events = [] } = useQuery(eventsQuery(game.id))
  const onTime = events.find((e) => e.type === 'game_finished')?.payload.reason === 'time'
  const winner = players.find((p) => p.id === game.winner_player_id)
  const rows = standings(players, game.winner_player_id)
  const totalKills = players.reduce((n, p) => n + (p.kills_count ?? 0), 0)
  const days =
    game.started_at && game.finished_at
      ? Math.max(
          1,
          Math.ceil(
            (new Date(game.finished_at).getTime() - new Date(game.started_at).getTime()) /
              86_400_000,
          ),
        )
      : 1

  return (
    <main className="flex flex-col gap-6 pt-4">
      <Tag tone="red" tilt className="self-start">
        Game over
      </Tag>
      <Card
        tone="yellow"
        tilt={-2}
        className="flex flex-col items-center gap-3 py-8 text-center shadow-hard-lg"
      >
        <span aria-hidden="true" className="font-display text-5xl">
          ♛
        </span>
        {winner && (
          <Avatar name={winner.name} colour={winner.colour} photo={winner.avatar_path} size="xl" />
        )}
        <p className="label-mono">{onTime ? 'Time’s up · most kills' : 'Last one alive'}</p>
        <h1 className="text-5xl break-words">{winner?.name ?? 'Nobody'}</h1>
        {winner?.id === me.id && <Tag tone="ink">That&rsquo;s you!</Tag>}
      </Card>

      <div className="grid grid-cols-3 gap-2.5">
        <StatBox label="Players" value={players.length} tone="mint" />
        <StatBox label="Kills" value={totalKills} tone="red" />
        <StatBox label={days === 1 ? 'Day' : 'Days'} value={days} tone="pink" />
      </div>

      <SeasonTable gameId={game.id} userId={userId} />

      <RematchPanel game={game} userId={userId} />

      <section aria-labelledby="final-heading" className="flex flex-col gap-3">
        <h2 id="final-heading" className="text-2xl">
          Final standings
        </h2>
        <StandingsList rows={rows} meId={me.id} winnerId={game.winner_player_id} />
      </section>

      <div className="flex flex-col gap-3">
        {totalKills > 0 && (
          <Link
            to="/g/$code/killcam"
            params={{ code }}
            className={buttonClasses('yellow', 'lg', true)}
          >
            ▶ Watch the kill cam
          </Link>
        )}
        <Link
          to="/g/$code/board"
          params={{ code }}
          search={{ tab: 'feed' }}
          className={buttonClasses('paper', 'md', true)}
        >
          See every kill
        </Link>
        <Link
          to="/new"
          className="inline-flex min-h-11 items-center justify-center label-mono underline"
        >
          New game with different people
        </Link>
      </div>
    </main>
  )
}
