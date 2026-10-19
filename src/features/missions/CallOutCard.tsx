import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Avatar, Button, Card, Sheet } from '@/components'
import type { Player } from '@/features/game/schemas'
import { useNow } from '@/lib/deadline'
import { errorMessage } from '@/lib/errors'
import { lastMissQuery, nextCallOutAt, useCallOut, type CallOutResult } from './callout'

const time = (d: Date) =>
  d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Cutthroat call-outs. Botched hand-overs give hunters away: name yours and
 * they're out (and the kill is yours). Guess wrong and you can't call anyone
 * out for 24 hours.
 */
export function CallOutCard({
  gameId,
  me,
  players,
}: {
  gameId: string
  me: Player
  players: Player[]
}) {
  const [open, setOpen] = useState(false)
  const [suspect, setSuspect] = useState<Player | null>(null)
  const [result, setResult] = useState<CallOutResult | null>(null)
  const { data: lastMiss = null } = useQuery(lastMissQuery(gameId, me.id))
  const callOut = useCallOut(gameId, me.id)
  const now = useNow(60_000)
  const lockedUntil = nextCallOutAt(lastMiss, now)
  const suspects = players.filter((p) => p.status === 'alive' && p.id !== me.id)

  function close() {
    setOpen(false)
    setSuspect(null)
    setResult(null)
    callOut.reset()
  }

  return (
    <Card tone="pink" tilt={-1} className="flex flex-col gap-3">
      <h2 className="text-2xl">Onto your hunter?</h2>
      <p className="font-medium">
        Spotted someone trying to hand you their weapon? Call them out. Right and they&rsquo;re out,
        and the kill is yours. Wrong and you can&rsquo;t call anyone out for 24 hours.
      </p>
      {lockedUntil ? (
        <p className="label-mono">Next call-out: {time(lockedUntil)}</p>
      ) : (
        <Button variant="ink" block onClick={() => setOpen(true)}>
          Call out my hunter
        </Button>
      )}

      <Sheet
        open={open}
        onClose={close}
        title={result ? (result.correct ? 'Rumbled!' : 'Not them') : 'Who is hunting you?'}
      >
        {result ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-bold">
              {result.correct
                ? `You rumbled ${suspect?.name}. They're out, and the kill is yours.`
                : `${suspect?.name} isn't hunting you. You can call someone out again in 24 hours. Nobody else knows you guessed.`}
            </p>
            <Button variant="yellow" block onClick={close}>
              {result.correct ? 'Back to the hunt' : 'Got it'}
            </Button>
          </div>
        ) : suspect ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar
                name={suspect.name}
                colour={suspect.colour}
                photo={suspect.avatar_path}
                size="md"
              />
              <p className="text-lg font-bold">Call out {suspect.name}?</p>
            </div>
            <p className="font-medium">
              If {suspect.name} is your hunter, they&rsquo;re out. If not, you can&rsquo;t call
              anyone out for 24 hours.
            </p>
            {callOut.isError && (
              <p role="alert" className="font-bold text-red-ink">
                {errorMessage(callOut.error)}
              </p>
            )}
            <Button
              variant="red"
              block
              loading={callOut.isPending}
              onClick={() => callOut.mutate(suspect.id, { onSuccess: setResult })}
            >
              Yes, it&rsquo;s {suspect.name}
            </Button>
            <Button variant="paper" block onClick={() => setSuspect(null)}>
              Pick someone else
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {suspects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSuspect(p)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl brut bg-paper px-3 shadow-hard-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                >
                  <Avatar name={p.name} colour={p.colour} photo={p.avatar_path} size="sm" />
                  <span className="font-bold">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </Card>
  )
}
