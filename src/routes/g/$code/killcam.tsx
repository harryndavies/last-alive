import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { eventsQuery } from '@/features/board/feed'
import { KillCam, type Banter } from '@/features/board/KillCam'
import { buildKillCam } from '@/features/board/killcamSlides'
import { commentsQuery, reactionsQuery, REACTIONS } from '@/features/board/social'
import { useGameContext } from '@/features/game/queries'
import { useUserId } from '@/lib/useUserId'

export const Route = createFileRoute('/g/$code/killcam')({
  component: KillCamScreen,
})

function KillCamScreen() {
  const { code } = Route.useParams()
  const { game, players } = useGameContext(code, useUserId())
  const { data: events = [] } = useQuery(eventsQuery(game.id))
  const { data: reactions = [] } = useQuery(reactionsQuery(game.id))
  const { data: comments = [] } = useQuery(commentsQuery(game.id))

  const names = new Map(players.map((p) => [p.id, p.name]))
  const banter = new Map<number, Banter>()
  for (const e of events) {
    if (e.type !== 'kill_confirmed') continue
    banter.set(e.id, {
      reactions: REACTIONS.map((emoji) => ({
        emoji,
        count: reactions.filter((r) => r.event_id === e.id && r.emoji === emoji).length,
      })).filter((r) => r.count > 0),
      comments: comments
        .filter((c) => c.event_id === e.id)
        .slice(-2)
        .map((c) => ({ id: c.id, author: names.get(c.player_id) ?? 'Someone', body: c.body })),
    })
  }
  const navigate = useNavigate()

  return (
    <KillCam
      slides={buildKillCam(events, players, game)}
      startedAt={game.started_at}
      banter={banter}
      onClose={() =>
        void navigate({
          to: game.status === 'finished' ? '/g/$code/winner' : '/g/$code/board',
          params: { code },
          search: game.status === 'finished' ? undefined : { tab: 'feed' },
        })
      }
    />
  )
}
