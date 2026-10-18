import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, buttonClasses, PinReveal } from '@/components'
import { uploadAvatar } from '@/lib/avatars'
import { errorMessage, GameError } from '@/lib/errors'
import { dataUrlToBlob } from '@/lib/image'
import { loadProfile } from '@/lib/profile'
import { rpcParsed } from '@/lib/rpc'
import { gameKeys } from '../keys'
import { previewQuery } from '../queries'
import { JoinGameResult, type Game } from '../schemas'

/** Rematch from the winner screen: start one, join one, or go to the one you are in. */
export function RematchPanel({ game, userId }: { game: Game; userId: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [pin, setPin] = useState<{ pin: string; code: string; note: string | null } | null>(null)
  const { data: rematch } = useQuery({
    ...previewQuery(game.rematch_code ?? ''),
    enabled: !!game.rematch_code,
  })

  const go = useMutation({
    mutationFn: async (kind: 'create' | 'join') => {
      const res = await rpcParsed(
        kind === 'create' ? 'create_rematch' : 'join_rematch',
        { p_game_id: game.id },
        JoinGameResult,
      )
      // Bring your remembered photo along, like a normal join.
      let note: string | null = null
      const photo = loadProfile()?.photo
      if (photo && !res.rejoined) {
        try {
          await uploadAvatar(res.game_id, userId, await dataUrlToBlob(photo))
        } catch (err) {
          note = errorMessage(err)
        }
      }
      return { ...res, note }
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: gameKeys.game(game.code) })
      if (res.pin) setPin({ pin: res.pin, code: res.code, note: res.note })
      else void navigate({ to: '/g/$code', params: { code: res.code } })
    },
  })

  if (pin) {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-ground px-4 pb-10">
        <div className="mx-auto max-w-md">
          <PinReveal
            pin={pin.pin}
            note={pin.note}
            onDone={() => void navigate({ to: '/g/$code/lobby', params: { code: pin.code } })}
          />
        </div>
      </div>
    )
  }

  const error = go.isError ? (
    <p role="alert" className="text-center font-bold text-red-ink">
      {go.error instanceof GameError && go.error.code === 'game_already_started'
        ? 'The rematch has already started without you.'
        : errorMessage(go.error)}
    </p>
  ) : null

  if (!game.rematch_code) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          variant="red"
          size="lg"
          block
          loading={go.isPending}
          onClick={() => go.mutate('create')}
        >
          🔁 Rematch
        </Button>
        <p className="text-center label-mono text-muted">Same group, new cards, new missions</p>
        {error}
      </div>
    )
  }

  if (rematch?.is_member) {
    return (
      <Link
        to="/g/$code"
        params={{ code: game.rematch_code }}
        className={buttonClasses('red', 'lg', true)}
      >
        🔁 Go to the rematch
      </Link>
    )
  }

  if (rematch && rematch.status !== 'lobby' && rematch.status !== 'picking') {
    return <p className="text-center label-mono">The rematch is already under way.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="red"
        size="lg"
        block
        loading={go.isPending}
        onClick={() => go.mutate('join')}
      >
        🔁 Join the rematch
      </Button>
      <p className="text-center label-mono text-muted">
        {rematch ? `${rematch.player_count} in already` : 'Someone started a new game'}
      </p>
      {error}
    </div>
  )
}
