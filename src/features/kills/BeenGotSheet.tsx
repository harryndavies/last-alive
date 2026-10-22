import { useState } from 'react'
import { Avatar, Button, Sheet } from '@/components'
import type { Player } from '@/features/game/schemas'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { useReportOwnDeath } from './queries'

/**
 * For when your killer forgets to tap "I got them": you say you've been got,
 * and it counts straight away. Normally it's your hunter, so there's nothing to
 * pick; in sudden death anyone could have, so you choose who.
 */
export function BeenGot({
  gameId,
  suddenDeath,
  others,
}: {
  gameId: string
  suddenDeath: boolean
  /** Everyone still alive except you (for sudden death). */
  others: Player[]
}) {
  const [open, setOpen] = useState(false)
  const [killer, setKiller] = useState<string | null>(null)
  const report = useReportOwnDeath(gameId)
  const close = () => {
    setOpen(false)
    setKiller(null)
    report.reset()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 self-center label-mono underline"
      >
        I&rsquo;ve been got
      </button>
      <Sheet open={open} onClose={close} title="You've been got?">
        <div className="flex flex-col gap-4">
          <p className="font-medium">
            {suddenDeath
              ? 'Who got you? It counts straight away and you’ll be out for good.'
              : 'Your hunter got you? It counts straight away, they get your mission, and you’ll be out for good.'}
          </p>
          {suddenDeath && (
            <ul className="flex flex-col gap-2" aria-label="Who got you">
              {others.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={killer === p.id}
                    onClick={() => setKiller(p.id)}
                    className={cn(
                      'flex min-h-12 w-full items-center gap-3 rounded-xl brut px-3 py-2 text-left font-bold shadow-hard-sm',
                      killer === p.id ? 'bg-ink text-paper' : 'bg-paper',
                    )}
                  >
                    <Avatar name={p.name} colour={p.colour} photo={p.avatar_path} size="sm" />
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {report.isError && (
            <p role="alert" className="font-bold text-red-ink">
              {errorMessage(report.error)}
            </p>
          )}
          <Button
            variant="red"
            block
            loading={report.isPending}
            disabled={suddenDeath && !killer}
            onClick={() => report.mutate(killer, { onSuccess: close })}
          >
            Yes, I&rsquo;m out
          </Button>
          <Button variant="paper" block onClick={close}>
            No, I&rsquo;m still in
          </Button>
        </div>
      </Sheet>
    </>
  )
}
