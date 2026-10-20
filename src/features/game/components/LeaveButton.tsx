import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, Sheet } from '@/components'
import { errorMessage } from '@/lib/errors'
import { gameKeys } from '../keys'
import { useLeaveGame } from '../queries'

export function LeaveButton({ gameId, active }: { gameId: string; active: boolean }) {
  const [open, setOpen] = useState(false)
  const leave = useLeaveGame(gameId)
  const navigate = useNavigate()
  const qc = useQueryClient()

  async function afterLeaving() {
    setOpen(false)
    if (active) {
      // You stay in the game as a spectator, so just refresh it.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['game'] }),
        qc.invalidateQueries({ queryKey: gameKeys.players(gameId) }),
        qc.invalidateQueries({ queryKey: gameKeys.events(gameId) }),
      ])
      return
    }
    // Your seat is gone: get off the game's screens before forgetting it.
    await navigate({ to: '/', replace: true })
    qc.removeQueries({ queryKey: ['game'] })
    qc.removeQueries({ queryKey: gameKeys.players(gameId) })
    void qc.invalidateQueries({ queryKey: ['my-games'] })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 self-center label-mono underline"
      >
        Leave game
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Leave the game?">
        <p className="mb-4 font-medium">
          {active
            ? 'You will be out for good. Whoever is hunting you takes over your mission.'
            : 'You can rejoin with the code while the game has not started.'}
        </p>
        {leave.isError && (
          <p role="alert" className="mb-3 font-bold text-red-ink">
            {errorMessage(leave.error)}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <Button
            variant="red"
            block
            loading={leave.isPending}
            onClick={() => leave.mutate(undefined, { onSuccess: () => void afterLeaving() })}
          >
            {active ? 'Yes, I forfeit' : 'Leave'}
          </Button>
          <Button variant="paper" block onClick={() => setOpen(false)}>
            Stay
          </Button>
        </div>
      </Sheet>
    </>
  )
}
