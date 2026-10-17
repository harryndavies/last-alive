import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { TabBar } from '@/components'
import { guardRedirect, screenFromPath, screenPath } from '@/features/game/guard'
import { gameQuery, playersQuery, useGameContext } from '@/features/game/queries'
import { useGameRealtime } from '@/features/game/realtime'
import { normaliseCode } from '@/features/game/schemas'
import { KillAlert } from '@/features/kills/KillAlert'
import { useUserId } from '@/lib/useUserId'

export const Route = createFileRoute('/g/$code')({
  beforeLoad: async ({ params, context, location }) => {
    const code = normaliseCode(params.code)
    if (code !== params.code) throw redirect({ to: '/g/$code', params: { code } })

    const game = await context.queryClient.ensureQueryData(gameQuery(code))
    if (!game) throw redirect({ to: '/join/$code', params: { code } })
    const players = await context.queryClient.ensureQueryData(playersQuery(game.id))
    const me = players.find((p) => p.user_id === context.userId)
    if (!me) throw redirect({ to: '/join/$code', params: { code } })

    const target = guardRedirect(
      game.status,
      me.status === 'alive',
      screenFromPath(location.pathname),
    )
    if (target) throw redirect({ to: screenPath(target), params: { code }, replace: true })
  },
  component: GameLayout,
})

function GameLayout() {
  const { code } = Route.useParams()
  const userId = useUserId()
  const { game, me } = useGameContext(code, userId)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useGameRealtime(game.id, code)

  // Live guard: status changes arrive over realtime, so re-check on every change.
  const alive = me.status === 'alive'
  useEffect(() => {
    const target = guardRedirect(game.status, alive, screenFromPath(pathname))
    if (target) void navigate({ to: screenPath(target), params: { code }, replace: true })
  }, [game.status, alive, pathname, code, navigate])

  return (
    <>
      <Outlet />
      {game.status === 'active' && <TabBar code={code} />}
      {game.status === 'active' && alive && <KillAlert gameId={game.id} me={me} />}
    </>
  )
}
