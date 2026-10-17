import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, Sheet } from '@/components'
import { errorMessage } from '@/lib/errors'
import { useLeaveGame } from '../queries'

export function LeaveButton({ gameId, active }: { gameId: string; active: boolean }) {
  const [open, setOpen] = useState(false)
  const leave = useLeaveGame(gameId)
  const navigate = useNavigate()

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
            onClick={() =>
              leave.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false)
                  void navigate({ to: active ? '/g/$code' : '/', replace: true })
                },
              })
            }
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
