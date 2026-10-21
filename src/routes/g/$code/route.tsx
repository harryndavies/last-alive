import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { TabBar } from '@/components'
import { codeFromPath, guardRedirect, screenFromPath, screenPath } from '@/features/game/guard'
import { gameQuery, playersQuery, useGameContext } from '@/features/game/queries'
import { useGameRealtime } from '@/features/game/realtime'
import { normaliseCode } from '@/features/game/schemas'
import { SuddenDeathAlert } from '@/features/game/components/Deadline'
import { KillAlert } from '@/features/kills/KillAlert'
import { hasSeenMission, missionQuery } from '@/features/missions/queries'
import { usePrefetchAvatars } from '@/lib/avatars'
import { GameTheme } from '@/lib/theme'
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
  const { game, players, me } = useGameContext(code, userId)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useGameRealtime(game.id, code)
  usePrefetchAvatars(players.map((p) => p.avatar_path))

  // Live guard: status changes arrive over realtime, so re-check on every change.
  const alive = me.status === 'alive'
  // While navigating to another game (e.g. a rematch), this layout briefly sees
  // the other game's path. Only guard paths that belong to this game.
  const ownPath = codeFromPath(pathname) === code

  useEffect(() => {
    if (!ownPath) return
    const target = guardRedirect(game.status, alive, screenFromPath(pathname))
    if (target) void navigate({ to: screenPath(target), params: { code }, replace: true })
  }, [game.status, alive, pathname, code, navigate, ownPath])

  // Inherited a mission you have not looked at yet: show "New mission unlocked".
  const { data: mission } = useQuery({
    ...missionQuery(game.id),
    enabled: game.status === 'active' && alive,
  })
  const unseenInherited = mission?.inherited_from && !hasSeenMission(mission.id) ? mission.id : null
  useEffect(() => {
    if (ownPath && unseenInherited && screenFromPath(pathname) !== 'new-mission') {
      void navigate({ to: '/g/$code/new-mission', params: { code } })
    }
  }, [unseenInherited, pathname, code, navigate, ownPath])

  return (
    <GameTheme theme={game.theme} gameId={game.id} playerIds={players.map((p) => p.id)}>
      <Outlet />
      {game.status === 'active' && (
        <>
          {/* Room so the last thing on the page isn't hidden behind the tab bar. */}
          <div aria-hidden="true" className="h-20" />
          <TabBar code={code} spectator={!alive} />
        </>
      )}
      {game.status === 'active' && alive && <KillAlert gameId={game.id} me={me} />}
      {game.status === 'active' && <SuddenDeathAlert game={game} me={me} />}
    </GameTheme>
  )
}
