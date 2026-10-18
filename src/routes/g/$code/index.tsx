import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { Avatar, Button, Card, NotificationsCard, PageHeader, StatBox, Tag } from '@/components'
import { eventsQuery, gameFeed, survivedFor } from '@/features/board/feed'
import { FeedList } from '@/features/board/FeedList'
import { LeaveButton } from '@/features/game/components/LeaveButton'
import { useGameContext, type GameContext } from '@/features/game/queries'
import { DisputeCard } from '@/features/kills/DisputeCard'
import { disputesFor, killsQuery, openClaimBy, type Kill } from '@/features/kills/queries'
import { ReportKillSheet } from '@/features/kills/ReportKillSheet'
import { missionQuery } from '@/features/missions/queries'
import { TargetCard } from '@/features/missions/TargetCard'
import { useReveal } from '@/features/missions/useReveal'
import { useUserId } from '@/lib/useUserId'

export const Route = createFileRoute('/g/$code/')({
  validateSearch: z.object({ report: z.boolean().optional() }),
  component: Home,
})

function Home() {
  const { code } = Route.useParams()
  const ctx = useGameContext(code, useUserId())
  const { game, players, me } = ctx
  const { data: kills = [] } = useQuery(killsQuery(game.id))
  const { data: events = [] } = useQuery(eventsQuery(game.id))

  const alive = players.filter((p) => p.status === 'alive').length
  const disputes = me.is_host ? disputesFor(kills) : []
  const news = gameFeed(events).slice(0, 3)

  return (
    <main className="flex flex-col gap-5 pt-4">
      <PageHeader kicker={game.name} title={me.status === 'alive' ? 'Stay alive' : "You're out"} />

      <div className="grid grid-cols-3 gap-2.5">
        <StatBox label="Alive" value={`${alive}/${players.length}`} tone="mint" />
        <StatBox label="Kills" value={me.kills_count} tone="yellow" />
        <StatBox label="Survived" value={survivedFor(game.started_at, me.died_at)} tone="pink" />
      </div>

      <NotificationsCard />

      {disputes.map((k) => (
        <DisputeCard key={k.id} gameId={game.id} killId={k.id} />
      ))}

      {me.status === 'alive' ? <Hunt ctx={ctx} kills={kills} /> : <Spectator ctx={ctx} />}

      <section aria-labelledby="news-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="news-heading" className="text-2xl">
            Latest news
          </h2>
          <Link
            to="/g/$code/board"
            params={{ code }}
            search={{ tab: 'feed' }}
            className="inline-flex min-h-11 items-center label-mono underline"
          >
            All news →
          </Link>
        </div>
        <FeedList items={news} />
      </section>

      {me.status === 'alive' && <LeaveButton gameId={game.id} active />}
    </main>
  )
}

function Hunt({ ctx, kills }: { ctx: GameContext; kills: Kill[] }) {
  const { game, players, me } = ctx
  const { code } = Route.useParams()
  const userId = useUserId()
  const { report } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: mission } = useQuery(missionQuery(game.id))
  const [revealed, toggle] = useReveal()
  const target = players.find((p) => p.id === mission?.target_id)
  const claim = openClaimBy(kills, me.id)
  const lastRejected = kills.find(
    (k) =>
      k.killer_id === me.id &&
      k.status === 'rejected' &&
      k.resolved_by === 'host' &&
      k.mission_id === mission?.id,
  )

  const setSheet = (open: boolean) =>
    void navigate({ search: open ? { report: true } : {}, replace: true })

  if (!mission || !target) {
    return (
      <Card tone="paper">
        <p className="font-bold">Waiting for your mission…</p>
      </Card>
    )
  }

  return (
    <>
      {claim && (
        <Card tone={claim.status === 'disputed' ? 'yellow' : 'blue'} tilt={1}>
          <Tag tone="ink">{claim.status === 'disputed' ? 'Disputed' : 'Pending'}</Tag>
          <p className="mt-2 font-bold">
            {claim.status === 'disputed'
              ? `${target.name} says that's wrong. The host will decide.`
              : `Waiting for ${target.name} to confirm. It counts automatically after 12 hours.`}
          </p>
        </Card>
      )}
      {!claim && lastRejected && (
        <Card tone="paper" tilt={-1}>
          <p className="font-bold">
            The host ruled your last claim didn&rsquo;t count. Keep hunting.
          </p>
        </Card>
      )}

      <TargetCard target={target} hidden={!revealed}>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={toggle}
            className="min-h-11 self-start label-mono underline"
            aria-pressed={revealed}
          >
            {revealed ? 'Hide target' : 'Show target'}
          </button>
          <Button variant="red" size="lg" block disabled={!!claim} onClick={() => setSheet(true)}>
            {claim ? 'Claim sent' : 'I got them!'}
          </Button>
          <Link
            to="/g/$code/mission"
            params={{ code }}
            className="inline-flex min-h-11 items-center justify-center label-mono underline"
          >
            View weapon, place &amp; phrase
          </Link>
        </div>
      </TargetCard>

      <ReportKillSheet
        userId={userId}
        open={!!report && !claim}
        onClose={() => setSheet(false)}
        gameId={game.id}
        mission={mission}
        target={target}
      />
    </>
  )
}

function Spectator({ ctx }: { ctx: GameContext }) {
  const { players, me } = ctx
  const killer = players.find((p) => p.id === me.killed_by)
  return (
    <Card tone="ink" tilt={-1} className="flex flex-col gap-3">
      <Tag tone="red" className="self-start">
        Spectating
      </Tag>
      {killer ? (
        <div className="flex items-center gap-3">
          <Avatar name={killer.name} colour={killer.colour} photo={killer.avatar_path} />
          <p className="text-lg font-bold">{killer.name} got you.</p>
        </div>
      ) : (
        <p className="text-lg font-bold">You left the game.</p>
      )}
      <p>You can still follow the feed and the board until someone wins.</p>
    </Card>
  )
}
