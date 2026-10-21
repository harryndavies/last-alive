import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { buttonClasses, Card, FitText, Moment, Tag } from '@/components'
import { eventsQuery } from '@/features/board/feed'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { useGameContext } from '@/features/game/queries'
import { markMissionSeen, missionChanges, missionHistoryQuery } from '@/features/missions/queries'
import { TargetCard } from '@/features/missions/TargetCard'
import { useUserId } from '@/lib/useUserId'
import { useCopy } from '@/lib/theme'

export const Route = createFileRoute('/g/$code/new-mission')({
  component: NewMission,
})

function NewMission() {
  const copy = useCopy()
  const { code } = Route.useParams()
  const { game, players } = useGameContext(code, useUserId())
  const { data: history } = useSuspenseQuery(missionHistoryQuery(game.id))
  const { data: events = [] } = useQuery(eventsQuery(game.id))
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
  // Rumbled: your old target was called out by their target, who is now yours.
  // Read from the public feed, since the secret feed hides who got who.
  const rumbled =
    !!victim && events.some((e) => e.type === 'rumbled' && e.payload.hunter_id === victim.id)
  const left =
    !!previous &&
    events.some((e) => e.type === 'player_left' && e.payload.player_id === previous.target_id)

  const gotThem = !!previous && !rumbled && !left

  return (
    <main className="flex flex-col gap-5 pt-4">
      {gotThem && (
        <Moment id={`gotcha:${current.id}`} className="bg-ink/70">
          <span className="max-w-[calc(100vw-2rem)] rounded-2xl border-4 border-ink bg-yellow px-6 py-3 font-display text-ink uppercase shadow-[8px_8px_0_#ff4b3e] motion-safe:animate-[stamp-slam_700ms_ease-out_both]">
            <FitText max={60} min={24} className="block">
              {copy.gotchaStamp}
            </FitText>
          </span>
          {victim && <p className="label-mono text-paper">You got {victim.name}</p>}
        </Moment>
      )}
      <Tag tone="mint" tilt className="self-start">
        {copy.newMissionTag}
      </Tag>
      <FitText as="h1" max={48} className="leading-[0.95]">
        {rumbled
          ? 'Your target got rumbled'
          : `You inherit ${victim ? `${victim.name}'s` : 'their'} mission`}
      </FitText>
      <p className="font-medium">
        {rumbled
          ? `${target?.name ?? 'Their target'} called ${victim?.name ?? 'them'} out, so ${victim?.name ?? 'they'} is out. ${target?.name ?? 'They'} is your target now. Same weapon, place and phrase as before.`
          : left
            ? `${victim?.name ?? 'Your target'} left the game, so their target is now yours.`
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
          kind="phrase"
          text={current.phrase.text}
          tilt={2}
          badge={changed.phrase ? 'New' : undefined}
        />
      </div>

      <Link to="/g/$code" params={{ code }} className={buttonClasses('yellow', 'lg', true)}>
        On it
      </Link>
    </main>
  )
}
