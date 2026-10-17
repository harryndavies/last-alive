import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { eventsQuery } from '@/features/board/feed'
import { KillCam } from '@/features/board/KillCam'
import { buildKillCam } from '@/features/board/killcamSlides'
import { useGameContext } from '@/features/game/queries'
import { useUserId } from '@/lib/useUserId'

export const Route = createFileRoute('/g/$code/killcam')({
  component: KillCamScreen,
})

function KillCamScreen() {
  const { code } = Route.useParams()
  const { game, players } = useGameContext(code, useUserId())
  const { data: events = [] } = useQuery(eventsQuery(game.id))
  const navigate = useNavigate()

  return (
    <KillCam
      slides={buildKillCam(events, players, game)}
      startedAt={game.started_at}
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
