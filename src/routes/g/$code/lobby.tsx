import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, Card, NotificationsCard, PageHeader } from '@/components'
import { ChangePhotoSheet } from '@/features/game/components/ChangePhotoSheet'
import { DeadlineEditor } from '@/features/game/components/Deadline'
import { LeaveButton } from '@/features/game/components/LeaveButton'
import { SwitchGameButton } from '@/features/game/components/SwitchGameButton'
import { PlayerList } from '@/features/game/components/PlayerList'
import { ShareCode } from '@/features/game/components/ShareCode'
import { gameKeys } from '@/features/game/keys'
import { useGameContext, useRemovePlayer, useStartPicking } from '@/features/game/queries'
import { errorMessage } from '@/lib/errors'
import { useUserId } from '@/lib/useUserId'
import { useCopy } from '@/lib/theme'
import { LobbySecretFeed, LobbyTheme } from '@/features/game/components/ThemePicker'

export const Route = createFileRoute('/g/$code/lobby')({
  component: Lobby,
})

const MIN_PLAYERS = 4

function Lobby() {
  const copy = useCopy()
  const { code } = Route.useParams()
  const userId = useUserId()
  const { game, players, me } = useGameContext(code, userId)
  const qc = useQueryClient()
  const [photoOpen, setPhotoOpen] = useState(false)
  const startPicking = useStartPicking(game.id)
  const remove = useRemovePlayer(game.id)
  const host = players.find((p) => p.is_host)
  const missing = Math.max(0, MIN_PLAYERS - players.length)

  return (
    <main className="flex flex-col gap-6 pt-4">
      <PageHeader kicker={copy.lobbyKicker} title={game.name} />
      <ShareCode code={game.code} gameName={game.name} />
      <DeadlineEditor game={game} me={me} />
      <LobbyTheme game={game} isHost={me.is_host} />
      <LobbySecretFeed game={game} isHost={me.is_host} />
      <NotificationsCard />

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
          onEditMe={() => setPhotoOpen(true)}
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

      <div className="flex flex-wrap items-center justify-center gap-x-6">
        <SwitchGameButton code={game.code} />
        <LeaveButton gameId={game.id} active={false} />
      </div>
      {photoOpen && (
        <ChangePhotoSheet
          open
          onClose={() => setPhotoOpen(false)}
          me={me}
          userId={userId}
          onSaved={() => void qc.invalidateQueries({ queryKey: gameKeys.players(game.id) })}
        />
      )}
    </main>
  )
}
