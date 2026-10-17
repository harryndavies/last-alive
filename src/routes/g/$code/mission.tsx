import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button, buttonClasses, Card, PageHeader, Tag } from '@/components'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { useGameContext } from '@/features/game/queries'
import { missionQuery } from '@/features/missions/queries'
import { TargetCard } from '@/features/missions/TargetCard'
import { useReveal } from '@/features/missions/useReveal'
import { useUserId } from '@/lib/useUserId'

export const Route = createFileRoute('/g/$code/mission')({
  component: MissionScreen,
})

function MissionScreen() {
  const { code } = Route.useParams()
  const { game, players } = useGameContext(code, useUserId())
  const { data: mission } = useSuspenseQuery(missionQuery(game.id))
  const [revealed, toggle] = useReveal()
  const hidden = !revealed
  const target = players.find((p) => p.id === mission?.target_id)

  return (
    <main className="flex flex-col gap-5 pt-4">
      <PageHeader kicker="Top secret" title="Your mission">
        <p className="font-medium">Only you can see this. Keep your screen to yourself.</p>
      </PageHeader>

      {mission ? (
        <>
          <Button
            variant={hidden ? 'yellow' : 'paper'}
            block
            onClick={toggle}
            aria-pressed={revealed}
          >
            {hidden ? '👁 Tap to reveal' : 'Hide mission'}
          </Button>

          <TargetCard target={target} hidden={hidden} />

          <div className="flex flex-col gap-4" aria-label="Mission cards">
            <PlayingCard kind="weapon" text={mission.weapon.text} tilt={1} hidden={hidden} />
            <PlayingCard kind="place" text={mission.place.text} tilt={-1} hidden={hidden} />
            <PlayingCard kind="phrase" text={mission.phrase.text} tilt={2} hidden={hidden} />
          </div>

          <Card tone="paper" className="mt-1">
            <h2 className="mb-2 text-xl">The rules</h2>
            <ol className="list-decimal space-y-1 pl-5 font-medium">
              <li>
                Tag <strong>your target</strong> with the <strong>weapon</strong>.
              </li>
              <li>
                It has to happen in the <strong>place</strong>.
              </li>
              <li>
                Then say the <strong>phrase</strong> to them.
              </li>
              <li>Then tap &ldquo;I got them&rdquo; on Home.</li>
            </ol>
          </Card>

          <Link
            to="/g/$code"
            params={{ code }}
            search={{ report: true }}
            className={buttonClasses('red', 'lg', true)}
          >
            I got them!
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
