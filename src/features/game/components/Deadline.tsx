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
  hint = true,
}: {
  value: string
  onChange: (value: string) => void
  min?: number
  label?: string
  hint?: boolean
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
      {hint && (
        <span className="text-sm text-muted">
          For holidays and trips. When time runs out, most kills among survivors wins, and the last
          24 hours are sudden death.
        </span>
      )}
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

const PRESETS = [
  { key: 'none', label: 'No limit', days: null },
  { key: '1d', label: '1 day', days: 1 },
  { key: '3d', label: '3 days', days: 3 },
  { key: '1w', label: '1 week', days: 7 },
] as const
type Pick = (typeof PRESETS)[number]['key'] | 'custom'

/** 8pm, N days from today: games finish at a sociable time, not mid-morning. */
export function daysFromNow(days: number, now = Date.now()): string {
  const end = new Date(now)
  end.setDate(end.getDate() + days)
  end.setHours(20, 0, 0, 0)
  return end.toISOString()
}

const CHIP =
  'min-h-11 rounded-full border-2 border-ink bg-paper px-3 text-sm font-bold shadow-hard-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none aria-pressed:bg-yellow disabled:opacity-60'

/** Lobby and card picking: how long the game runs. The host picks; others just see it. */
export function DeadlineEditor({ game, me }: { game: Game; me: Player }) {
  const [picked, setPicked] = useState<Pick>(game.ends_at ? 'custom' : 'none')
  const [custom, setCustom] = useState(
    game.ends_at ? toLocalInput(new Date(game.ends_at).getTime()) : '',
  )
  const { save, busy, error } = useSetEnd(game.id)
  const summary = game.ends_at
    ? `Ends ${formatDeadline(game.ends_at)}. Most kills among survivors wins, with sudden death at the end.`
    : 'Runs until one player is left.'

  if (!me.is_host) {
    return (
      <p className="text-sm">
        <span className="label-mono">Game length:</span> {summary}
      </p>
    )
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 label-mono">Game length</legend>
      <ul className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              aria-pressed={picked === p.key}
              disabled={busy}
              className={CHIP}
              onClick={() =>
                void save(p.days === null ? null : daysFromNow(p.days)).then(
                  (ok) => ok && setPicked(p.key),
                )
              }
            >
              {p.label}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            aria-pressed={picked === 'custom'}
            disabled={busy}
            className={CHIP}
            onClick={() => setPicked('custom')}
          >
            Pick a date
          </button>
        </li>
      </ul>
      {picked === 'custom' && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <DeadlineField value={custom} onChange={setCustom} label="Ends at" hint={false} />
          </div>
          <Button
            variant="yellow"
            loading={busy}
            disabled={!custom}
            onClick={() => void save(fromLocalInput(custom))}
          >
            Set
          </Button>
        </div>
      )}
      <p className="text-sm text-muted">{summary}</p>
      {error && (
        <p role="alert" className="font-bold text-red-ink">
          {error}
        </p>
      )}
    </fieldset>
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
