import { useState } from 'react'
import { Button, Card, Sheet, Tag } from '@/components'
import {
  deadlinePhase,
  formatDeadline,
  formatRemaining,
  fromLocalInput,
  toLocalInput,
  useNow,
} from '@/lib/deadline'
import { errorMessage } from '@/lib/errors'
import { rpc } from '@/lib/rpc'
import { useQueryClient } from '@tanstack/react-query'
import type { Game, Player } from '../schemas'

const HOUR = 3_600_000

/** A datetime input for the end time, at least an hour away. */
export function DeadlineField({
  value,
  onChange,
  min,
  label = 'End by (optional)',
}: {
  value: string
  onChange: (value: string) => void
  min?: number
  label?: string
}) {
  const [minValue] = useState(() => toLocalInput(min ?? Date.now() + HOUR))
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono">{label}</span>
      <input
        type="datetime-local"
        value={value}
        min={minValue}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 rounded-xl brut bg-paper px-4 text-lg font-medium shadow-hard-sm focus:shadow-hard focus:outline-none"
      />
      <span className="text-sm text-muted">
        For holidays and trips. When time runs out, most kills among survivors wins, and the last 24
        hours are sudden death.
      </span>
    </label>
  )
}

function useSetEnd(gameId: string) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save(endsAt: string | null): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await rpc(
        'set_game_end',
        endsAt ? { p_game_id: gameId, p_ends_at: endsAt } : { p_game_id: gameId },
      )
      await qc.invalidateQueries({ queryKey: ['game'] })
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { save, busy, error }
}

/** Lobby and card picking: shows the end time; the host can set, change or clear it. */
export function DeadlineEditor({ game, me }: { game: Game; me: Player }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(
    game.ends_at ? toLocalInput(new Date(game.ends_at).getTime()) : '',
  )
  const { save, busy, error } = useSetEnd(game.id)

  if (!me.is_host) {
    if (!game.ends_at) return null
    return (
      <p className="text-center label-mono">
        ⏱ Game ends {formatDeadline(game.ends_at)} · last 24h sudden death
      </p>
    )
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 text-center">
        <span className="label-mono">
          {game.ends_at ? `⏱ Ends ${formatDeadline(game.ends_at)}` : '⏱ No end time'}
        </span>
        <button
          type="button"
          className="min-h-11 label-mono underline"
          onClick={() => setEditing(true)}
        >
          {game.ends_at ? 'Change' : 'Set an end time'}
        </button>
      </div>
    )
  }

  return (
    <Card tone="paper" className="flex flex-col gap-3">
      <DeadlineField value={value} onChange={setValue} />
      {error && (
        <p role="alert" className="font-bold text-red-ink">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="yellow"
          loading={busy}
          disabled={!value}
          onClick={() => void save(fromLocalInput(value)).then((ok) => ok && setEditing(false))}
        >
          Save
        </Button>
        {game.ends_at && (
          <Button
            variant="paper"
            disabled={busy}
            onClick={() =>
              void save(null).then((ok) => {
                if (ok) {
                  setValue('')
                  setEditing(false)
                }
              })
            }
          >
            No end time
          </Button>
        )}
        <button
          type="button"
          className="min-h-11 label-mono underline"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </div>
    </Card>
  )
}

/** In-game countdown, the sudden-death warning, and the host's "Extend". */
export function DeadlineBanner({
  game,
  me,
  compact = false,
}: {
  game: Game
  me: Player
  compact?: boolean
}) {
  const now = useNow(1000)
  const phase = deadlinePhase(game, now)
  const [extending, setExtending] = useState(false)
  if (phase === 'none' || !game.ends_at) return null
  const remaining = formatRemaining(new Date(game.ends_at).getTime() - now)

  const extend = me.is_host && phase !== 'over' && !compact && (
    <button
      type="button"
      className="min-h-11 label-mono underline"
      onClick={() => setExtending(true)}
    >
      Extend
    </button>
  )

  return (
    <>
      {phase === 'sudden' ? (
        <Card tone="red" tilt={-1} className="flex flex-col gap-1">
          <Tag tone="ink" className="self-start">
            ⚡ Sudden death
          </Tag>
          <p className="font-display text-3xl leading-none uppercase" aria-live="off">
            {remaining} left
          </p>
          {!compact && (
            <p className="font-bold">
              Anyone can get anyone now. Any weapon, any place. Most kills among survivors wins at
              the end.
            </p>
          )}
          {extend}
        </Card>
      ) : phase === 'over' ? (
        <Card tone="yellow" className="flex flex-col gap-1">
          <p className="font-display text-2xl uppercase">⏱ Time&rsquo;s up</p>
          <p className="font-bold">
            Waiting for the last claims to be answered, then the winner is crowned.
          </p>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2 text-center">
          <span className="label-mono">
            ⏱ Ends in <b className="font-display text-base">{remaining}</b> ·{' '}
            {formatDeadline(game.ends_at, now)}
          </span>
          {extend}
        </div>
      )}
      {extending && <ExtendSheet game={game} onClose={() => setExtending(false)} />}
    </>
  )
}

function ExtendSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  // Only opened when the game has a deadline.
  const current = new Date(game.ends_at ?? 0).getTime()
  const [value, setValue] = useState(toLocalInput(current + 24 * HOUR))
  const { save, busy, error } = useSetEnd(game.id)
  return (
    <Sheet open onClose={onClose} title="Extend the game">
      <div className="flex flex-col gap-4">
        <p className="font-medium">
          Currently ends {formatDeadline(game.ends_at ?? '')}. You can only make it later.
        </p>
        <DeadlineField
          value={value}
          onChange={setValue}
          min={current + 60_000}
          label="New end time"
        />
        {error && (
          <p role="alert" className="font-bold text-red-ink">
            {error}
          </p>
        )}
        <Button
          block
          loading={busy}
          onClick={() => void save(fromLocalInput(value)).then((ok) => ok && onClose())}
        >
          Extend
        </Button>
      </div>
    </Sheet>
  )
}
