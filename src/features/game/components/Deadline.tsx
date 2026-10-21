import { useState } from 'react'
import { Button, Card, FitText, Moment, Sheet, Tag } from '@/components'
import { useCopy } from '@/lib/theme'
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

const CALL_OPTIONS = [
  { label: '48 hours', hours: 48 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
] as const

/** 8pm on the first evening at least `hours` away (the server insists on 48h). */
export function eveningAfter(hours: number, now = Date.now()): string {
  const earliest = now + hours * HOUR
  const end = new Date(earliest)
  end.setHours(20, 0, 0, 0)
  if (end.getTime() < earliest) end.setDate(end.getDate() + 1)
  return end.toISOString()
}

/** Host only, in a running game with no end time: set one, with fair warning. */
export function CallTime({ game, me }: { game: Game; me: Player }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState<number>(48)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!me.is_host || game.status !== 'active' || game.ends_at) return null
  const endsAt = eveningAfter(hours)

  async function call() {
    setBusy(true)
    setError(null)
    try {
      await rpc('call_time', { p_game_id: game.id, p_ends_at: endsAt })
      await qc.invalidateQueries({ queryKey: ['game'] })
      setOpen(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card tone="paper" className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Game dragging on? Give it an end.</p>
        <Button variant="ink" className="shrink-0 whitespace-nowrap" onClick={() => setOpen(true)}>
          ⏱ Call time
        </Button>
      </Card>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title="Call time">
          <div className="flex flex-col gap-4">
            <p className="font-medium">
              Everyone gets told you called it. The last 24 hours are sudden death: anyone can get
              anyone. When time runs out, the survivor with the most kills wins.
            </p>
            <ul className="flex flex-wrap gap-2">
              {CALL_OPTIONS.map((o) => (
                <li key={o.hours}>
                  <button
                    type="button"
                    aria-pressed={hours === o.hours}
                    onClick={() => setHours(o.hours)}
                    className="min-h-11 rounded-full border-2 border-ink bg-paper px-3 text-sm font-bold shadow-hard-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none aria-pressed:bg-yellow"
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
            <p className="label-mono">Ends {formatDeadline(endsAt)}</p>
            {error && (
              <p role="alert" className="font-bold text-red-ink">
                {error}
              </p>
            )}
            <Button block variant="red" loading={busy} onClick={() => void call()}>
              Call time
            </Button>
          </div>
        </Sheet>
      )}
    </>
  )
}

/**
 * Sudden death changes the rules (anyone can get anyone), so every living
 * player sees it once, whichever screen they open, even without notifications.
 */
export function SuddenDeathAlert({ game, me }: { game: Game; me: Player }) {
  const now = useNow(30_000)
  if (me.status !== 'alive' || deadlinePhase(game, now) !== 'sudden' || !game.ends_at) return null
  return <SuddenDeathMoment game={game} endsAt={game.ends_at} now={now} />
}

function SuddenDeathMoment({ game, endsAt, now }: { game: Game; endsAt: string; now: number }) {
  const copy = useCopy()
  // Keyed on the end time: if the host extends out of sudden death and it comes round again, it shows again.
  return (
    <Moment id={`sudden:${game.id}:${endsAt}`} duration={4500} essential className="bg-ink/80">
      <span className="mx-4 max-w-[calc(100vw-2rem)] rounded-2xl border-4 border-ink bg-red px-5 py-3 text-center font-display text-ink uppercase shadow-[8px_8px_0_#ffd23f] motion-safe:animate-[stamp-slam_700ms_ease-out_both]">
        <FitText max={36} min={20} className="block">
          ⚡ {copy.suddenTitle}
        </FitText>
      </span>
      <p className="max-w-xs text-center text-lg font-bold text-paper">{copy.suddenBody}</p>
      <p className="label-mono text-paper/80">
        {formatRemaining(new Date(endsAt).getTime() - now)} left · tap to close
      </p>
    </Moment>
  )
}
