import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { buttonClasses, Card, Tag } from '@/components'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { useGameContext } from '@/features/game/queries'
import { markMissionSeen, missionChanges, missionHistoryQuery } from '@/features/missions/queries'
import { TargetCard } from '@/features/missions/TargetCard'
import { useUserId } from '@/lib/useUserId'

export const Route = createFileRoute('/g/$code/new-mission')({
  component: NewMission,
})

function NewMission() {
  const { code } = Route.useParams()
  const { game, players } = useGameContext(code, useUserId())
  const { data: history } = useSuspenseQuery(missionHistoryQuery(game.id))
  const current = history.find((m) => m.is_active)
  const previous = history.find((m) => !m.is_active && m.id !== current?.id)

  useEffect(() => {
    if (current) markMissionSeen(current.id)
  }, [current])

  if (!current) {
    return (
      <main className="pt-8">
        <Card tone="paper">
          <p className="font-bold">No new mission right now.</p>
        </Card>
      </main>
    )
  }

  const changed = missionChanges(current, previous)
  const victim = players.find((p) => p.id === previous?.target_id)
  const target = players.find((p) => p.id === current.target_id)

  return (
    <main className="flex flex-col gap-5 pt-4">
      <Tag tone="mint" tilt className="self-start">
        New mission unlocked
      </Tag>
      <h1 className="text-5xl leading-[0.95]">
        You inherit {victim ? `${victim.name}'s` : 'their'} mission
      </h1>
      <p className="font-medium">
        {victim?.status === 'dead' && victim.killed_by === null
          ? `${victim.name} left the game, so their target is now yours.`
          : `${victim?.name ?? 'Your target'} was hunting someone. Now you are.`}
      </p>

      <TargetCard target={target} badge={changed.target ? 'New' : undefined} />

      <div className="flex flex-col gap-4">
        <PlayingCard
          kind="weapon"
          text={current.weapon.text}
          tilt={1}
          badge={changed.weapon ? 'New' : undefined}
        />
        <PlayingCard
          kind="place"
          text={current.place.text}
          tilt={-1}
          badge={changed.place ? 'New' : undefined}
        />
        <PlayingCard
          kind="object"
          text={current.object.text}
          tilt={2}
          badge={changed.object ? 'New' : undefined}
        />
      </div>

      <Link to="/g/$code" params={{ code }} className={buttonClasses('yellow', 'lg', true)}>
        On it
      </Link>
    </main>
  )
}
