import { createFileRoute } from '@tanstack/react-router'
import { Button, Card, PageHeader } from '@/components'
import { LeaveButton } from '@/features/game/components/LeaveButton'
import { PlayerList } from '@/features/game/components/PlayerList'
import { ShareCode } from '@/features/game/components/ShareCode'
import { useGameContext, useRemovePlayer, useStartPicking } from '@/features/game/queries'
import { errorMessage } from '@/lib/errors'
import { useUserId } from '@/lib/useUserId'

export const Route = createFileRoute('/g/$code/lobby')({
  component: Lobby,
})

const MIN_PLAYERS = 4

function Lobby() {
  const { code } = Route.useParams()
  const { game, players, me } = useGameContext(code, useUserId())
  const startPicking = useStartPicking(game.id)
  const remove = useRemovePlayer(game.id)
  const host = players.find((p) => p.is_host)
  const missing = Math.max(0, MIN_PLAYERS - players.length)

  return (
    <main className="flex flex-col gap-6 pt-4">
      <PageHeader kicker="Lobby" title={game.name} />
      <ShareCode code={game.code} gameName={game.name} />

      <section aria-labelledby="players-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="players-heading" className="text-2xl">
            Players
          </h2>
          <span className="label-mono">{players.length} in</span>
        </div>
        <PlayerList
          players={players}
          meId={me.id}
          onRemove={me.is_host ? (p) => remove.mutate(p.id) : undefined}
        />
      </section>

      {me.is_host ? (
        <div className="flex flex-col gap-2">
          {startPicking.isError && (
            <p role="alert" className="font-bold text-red-ink">
              {errorMessage(startPicking.error)}
            </p>
          )}
          <Button
            size="lg"
            variant="mint"
            block
            disabled={missing > 0}
            loading={startPicking.isPending}
            onClick={() => startPicking.mutate(undefined)}
          >
            Start picking cards
          </Button>
          {missing > 0 && (
            <p className="text-center label-mono">
              Need {missing} more {missing === 1 ? 'player' : 'players'}
            </p>
          )}
        </div>
      ) : (
        <Card tone="pink" tilt={1}>
          <p className="font-bold">Waiting for {host?.name ?? 'the host'} to start…</p>
          <p className="text-sm">Everyone will pick cards next.</p>
        </Card>
      )}

      <LeaveButton gameId={game.id} active={false} />
    </main>
  )
}
