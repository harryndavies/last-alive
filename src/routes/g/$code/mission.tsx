import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, buttonClasses, Card, PageHeader, Stamp, Tag } from '@/components'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { useGameContext } from '@/features/game/queries'
import { missionQuery } from '@/features/missions/queries'
import { DeadlineBanner } from '@/features/game/components/Deadline'
import { TargetCard } from '@/features/missions/TargetCard'
import { useReveal } from '@/features/missions/useReveal'
import { useUserId } from '@/lib/useUserId'
import { useCopy, useTheme } from '@/lib/theme'

export const Route = createFileRoute('/g/$code/mission')({
  component: MissionScreen,
})

function MissionScreen() {
  const copy = useCopy()
  const theme = useTheme()
  const { code } = Route.useParams()
  const { game, players, me } = useGameContext(code, useUserId())
  const { data: mission } = useSuspenseQuery(missionQuery(game.id))
  const [revealed, toggle] = useReveal()
  // Bumped on each reveal so the cards flip over again (not on page load).
  const [flips, setFlips] = useState(0)
  const hidden = !revealed
  const target = players.find((p) => p.id === mission?.target_id)

  return (
    <main className="flex flex-col gap-5 pt-4">
      <PageHeader kicker={copy.missionKicker} title={copy.missionTitle}>
        {theme === 'spy' && <Stamp className="self-start">Top secret</Stamp>}
        <p className="font-medium">
          {theme === 'spy'
            ? 'This message will self-destruct. Deny all knowledge.'
            : 'Only you can see this. Keep your screen to yourself.'}
        </p>
      </PageHeader>
      <DeadlineBanner game={game} me={me} compact />

      {mission ? (
        <>
          <Button
            variant={hidden ? 'yellow' : 'paper'}
            block
            onClick={() => {
              if (hidden) setFlips((n) => n + 1)
              toggle()
            }}
            aria-pressed={revealed}
          >
            {hidden ? '👁 Tap to reveal' : 'Hide mission'}
          </Button>

          <TargetCard target={target} hidden={hidden} />

          <div className="flex flex-col gap-4" aria-label="Mission cards">
            {(['weapon', 'place', 'phrase'] as const).map((kind, i) => (
              <PlayingCard
                key={`${kind}-${flips}`}
                kind={kind}
                text={mission[kind].text}
                tilt={([1, -1, 2] as const)[i]}
                hidden={hidden}
                flipDelay={flips > 0 && !hidden ? i * 140 : undefined}
              />
            ))}
          </div>

          <Card tone="paper" className="mt-1">
            <h2 className="mb-2 text-xl">The rules</h2>
            <ol className="list-decimal space-y-1 pl-5 font-medium">
              <li>
                Get <strong>your target</strong> to take the <strong>weapon</strong> from you. They
                have to take it willingly.
              </li>
              <li>
                It has to happen in the <strong>place</strong>.
              </li>
              <li>
                Then say the <strong>phrase</strong> to them.
              </li>
              <li>
                Then tap &ldquo;{copy.iGotThem}&rdquo; on {copy.tabHome}.
              </li>
            </ol>
          </Card>

          <Link
            to="/g/$code"
            params={{ code }}
            search={{ report: true }}
            className={buttonClasses('red', 'lg', true)}
          >
            {copy.iGotThem}
          </Link>
        </>
      ) : (
        <Card tone="mint" tilt={-1}>
          <Tag tone="ink">No mission</Tag>
          <p className="mt-2 font-bold">You have no active mission right now.</p>
        </Card>
      )}
    </main>
  )
}
