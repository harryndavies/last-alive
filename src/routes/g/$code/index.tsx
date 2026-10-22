import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import {
  Avatar,
  Button,
  Card,
  FitText,
  Gravestone,
  Moment,
  NotificationsCard,
  PageHeader,
  StatBox,
  Tag,
} from '@/components'
import { epitaph } from '@/features/board/epitaph'
import { eventsQuery, gameFeed, survivedFor, type GameEvent } from '@/features/board/feed'
import { FeedList } from '@/features/board/FeedList'
import { LeaveButton } from '@/features/game/components/LeaveButton'
import { SwitchGameButton } from '@/features/game/components/SwitchGameButton'
import { useGameContext, type GameContext } from '@/features/game/queries'
import { DisputeCard } from '@/features/kills/DisputeCard'
import { disputesFor, killsQuery, openClaimBy, type Kill } from '@/features/kills/queries'
import { BeenGot } from '@/features/kills/BeenGotSheet'
import { ReportKillSheet } from '@/features/kills/ReportKillSheet'
import { CallTime, DeadlineBanner } from '@/features/game/components/Deadline'
import { deadlinePhase, useNow } from '@/lib/deadline'
import { CallOutCard } from '@/features/missions/CallOutCard'
import { missionQuery } from '@/features/missions/queries'
import { TargetCard } from '@/features/missions/TargetCard'
import { useReveal } from '@/features/missions/useReveal'
import { useUserId } from '@/lib/useUserId'
import { useCopy, useNames } from '@/lib/theme'

export const Route = createFileRoute('/g/$code/')({
  validateSearch: z.object({ report: z.boolean().optional() }),
  component: Home,
})

function Home() {
  const copy = useCopy()
  const names = useNames()
  const { code } = Route.useParams()
  const ctx = useGameContext(code, useUserId())
  const { game, players, me } = ctx
  const { data: kills = [] } = useQuery(killsQuery(game.id))
  const { data: events = [] } = useQuery(eventsQuery(game.id))

  const alive = players.filter((p) => p.status === 'alive').length
  const disputes = me.is_host ? disputesFor(kills) : []
  const news = gameFeed(events, { copy, nameOf: names.of }).slice(0, 3)

  return (
    <main className="flex flex-col gap-5 pt-4">
      <PageHeader
        kicker={game.name}
        title={me.status === 'alive' ? copy.homeAlive : copy.homeOut}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatBox label={copy.statAlive} value={`${alive}/${players.length}`} tone="mint" />
        <StatBox label={copy.statKills} value={me.kills_count ?? 0} tone="yellow" />
        <StatBox
          label={copy.statSurvived}
          value={survivedFor(game.started_at, me.died_at)}
          tone="pink"
        />
      </div>

      {game.prize && <p className="text-center label-mono">🏆 Playing for: {game.prize}</p>}
      <DeadlineBanner game={game} me={me} />
      <CallTime game={game} me={me} />
      <NotificationsCard />

      {disputes.map((k) => (
        <DisputeCard key={k.id} gameId={game.id} killId={k.id} />
      ))}

      {me.status === 'alive' ? (
        <Hunt ctx={ctx} kills={kills} />
      ) : (
        <Spectator
          ctx={ctx}
          rumbled={events.some((e) => e.type === 'rumbled' && e.payload.hunter_id === me.id)}
          myKill={events.find((e) => e.type === 'kill_confirmed' && e.payload.victim_id === me.id)}
        />
      )}

      <section aria-labelledby="news-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="news-heading" className="text-2xl">
            {copy.latestNews}
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
        <FeedList items={news} social={{ gameId: game.id, me, players }} />
      </section>

      <div className="flex flex-wrap items-center justify-center gap-x-6">
        <SwitchGameButton code={game.code} />
        {me.status === 'alive' && <LeaveButton gameId={game.id} active />}
      </div>
    </main>
  )
}

function Hunt({ ctx, kills }: { ctx: GameContext; kills: Kill[] }) {
  const copy = useCopy()
  const { game, players, me } = ctx
  const { code } = Route.useParams()
  const userId = useUserId()
  const { report } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: mission } = useQuery(missionQuery(game.id))
  const [revealed, toggle] = useReveal()
  const target = players.find((p) => p.id === mission?.target_id)
  const claim = openClaimBy(kills, me.id)
  const now = useNow(15_000)
  const suddenDeath = deadlinePhase(game, now) === 'sudden'
  const others = players.filter(
    (p) => p.status === 'alive' && p.id !== me.id && p.id !== target?.id,
  )
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
            {claim ? 'Claim sent' : suddenDeath ? copy.iGotSomeone : copy.iGotThem}
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

      <BeenGot
        gameId={game.id}
        suddenDeath={suddenDeath}
        others={players.filter((p) => p.status === 'alive' && p.id !== me.id)}
      />

      <CallOutCard gameId={game.id} me={me} players={players} />

      <ReportKillSheet
        userId={userId}
        suddenDeath={suddenDeath}
        others={others}
        open={!!report && !claim}
        onClose={() => setSheet(false)}
        gameId={game.id}
        mission={mission}
        target={target}
      />
    </>
  )
}

function Spectator({
  ctx,
  rumbled,
  myKill,
}: {
  ctx: GameContext
  rumbled: boolean
  myKill?: GameEvent
}) {
  const copy = useCopy()
  const { players, me } = ctx
  const killer = players.find((p) => p.id === me.killed_by)
  const line = epitaph({
    id: me.id,
    weapon: typeof myKill?.payload.weapon === 'string' ? myKill.payload.weapon : null,
    place: typeof myKill?.payload.place === 'string' ? myKill.payload.place : null,
    rumbled,
    left: !killer,
  })
  return (
    <Card tone="ink" tilt={-1} className="flex flex-col gap-3">
      <Moment
        id={`dead:${me.id}`}
        duration={2600}
        className="bg-ink/60 backdrop-blur-[1px] backdrop-grayscale"
      >
        <Gravestone
          name={me.name}
          epitaph={line}
          className="motion-safe:animate-[grave-drop_600ms_200ms_both]"
        />
        <FitText max={36} className="block px-4 text-center font-display text-paper uppercase">
          {copy.deadStamp}
        </FitText>
      </Moment>
      <Tag tone="red" className="self-start">
        Spectating
      </Tag>
      <Gravestone name={me.name} epitaph={line} className="self-center" />
      {killer ? (
        <div className="flex items-center gap-3">
          <Avatar name={killer.name} colour={killer.colour} photo={killer.avatar_path} />
          <p className="text-lg font-bold">
            {rumbled ? `${killer.name} rumbled you.` : `${killer.name} got you.`}
          </p>
        </div>
      ) : (
        <p className="text-lg font-bold">You left the game.</p>
      )}
      <p>You can still follow the feed and the board until someone wins.</p>
    </Card>
  )
}
