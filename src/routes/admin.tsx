import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Button, Card, StatBox, Tag, TextField } from '@/components'
import { formatDeadline, fromLocalInput, toLocalInput } from '@/lib/deadline'
import { errorMessage } from '@/lib/errors'
import { rpc } from '@/lib/rpc'

/**
 * Harry's back office. Not linked from anywhere, but that is not the security:
 * every call sends the password and the database checks it (and locks after
 * five wrong tries). The password only lives in this tab's session storage.
 */
export const Route = createFileRoute('/admin')({
  validateSearch: z.object({ game: z.string().optional() }),
  component: Admin,
})

const KEY = 'last-alive-admin'
const ERRORS: Record<string, string> = {
  admin_wrong_password: 'Wrong password.',
  admin_locked: 'Too many wrong passwords. Try again in 15 minutes.',
  admin_not_set_up: 'No admin password yet. Set one in the SQL editor first.',
  game_not_found: 'No game with that code.',
  card_text_invalid: 'Card text must be 1–80 characters.',
  card_not_found: 'That card has gone.',
  player_not_found: 'That player has gone.',
  wrong_phase: 'Not possible at this stage of the game.',
}

type Result = { ok: true } & Record<string, unknown>

/** Calls an admin function; a bad password or refusal becomes a thrown Error. */
async function admin<T>(name: string, args: Record<string, unknown>): Promise<T & Result> {
  const res = (await rpc(name as never, args as never)) as { ok: boolean; error?: string }
  if (!res.ok) throw new Error(ERRORS[res.error ?? ''] ?? res.error ?? 'Something went wrong')
  return res as T & Result
}

function readPassword(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

function Admin() {
  const [password, setPassword] = useState<string | null>(readPassword)
  const { game } = Route.useSearch()
  const lock = () => {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      // Nothing stored.
    }
    setPassword(null)
  }

  if (!password) return <Unlock onUnlock={setPassword} />
  return (
    <main className="flex flex-col gap-5 pt-4">
      <div className="flex items-center justify-between">
        <Tag tone="ink">Admin</Tag>
        <button type="button" onClick={lock} className="min-h-11 label-mono underline">
          Lock
        </button>
      </div>
      {game ? <GameView password={password} code={game} /> : <Overview password={password} />}
    </main>
  )
}

function Unlock({ onUnlock }: { onUnlock: (password: string) => void }) {
  const [value, setValue] = useState('')
  const check = useMutation({
    mutationFn: (p: string) => admin('admin_overview', { p_password: p }),
    onSuccess: (_, p) => {
      try {
        sessionStorage.setItem(KEY, p)
      } catch {
        // Fine: it just won't survive a reload.
      }
      onUnlock(p)
    },
  })
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (value) check.mutate(value)
  }
  return (
    <main className="pt-10">
      <Card tone="paper" className="flex flex-col gap-4">
        <h1 className="text-3xl">Admin</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={check.isError ? errorMessage(check.error) : null}
          />
          <Button type="submit" variant="ink" block loading={check.isPending}>
            Unlock
          </Button>
        </form>
      </Card>
    </main>
  )
}

interface OverviewData {
  stats: { games: number; running: number; players: number; games_24h: number; kills_24h: number }
  games: {
    id: string
    code: string
    name: string
    status: string
    players: number
    alive: number
    created_at: string
    ends_at: string | null
  }[]
}

function Overview({ password }: { password: string }) {
  const { data, error, isPending } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => admin<OverviewData>('admin_overview', { p_password: password }),
    refetchInterval: 30_000,
  })
  const [code, setCode] = useState('')
  const navigate = useNavigate()
  if (isPending) return <p className="label-mono">Loading…</p>
  if (error) return <p className="font-bold text-red-ink">{errorMessage(error)}</p>
  const { stats, games } = data
  return (
    <>
      <div className="grid grid-cols-3 gap-2.5">
        <StatBox label="Running" value={stats.running} tone="mint" />
        <StatBox label="Games" value={stats.games} tone="yellow" />
        <StatBox label="Players" value={stats.players} tone="pink" />
        <StatBox label="New games 24h" value={stats.games_24h} tone="blue" />
        <StatBox label="Kills 24h" value={stats.kills_24h} tone="red" />
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) void navigate({ to: '/admin', search: { game: code.trim() } })
        }}
      >
        <TextField
          label="Open any game by code"
          placeholder="MOLE-E3"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" variant="ink">
          Open
        </Button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl">Running games</h2>
        {games.length === 0 && <p className="label-mono">Nothing running.</p>}
        {games.map((g) => (
          <Link
            key={g.id}
            to="/admin"
            search={{ game: g.code }}
            className="flex items-center gap-3 rounded-xl brut bg-paper px-3 py-2 shadow-hard-sm"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{g.name}</span>
              <span className="label-mono text-muted">
                {g.code} · {g.status} · {g.alive}/{g.players} alive
                {g.ends_at ? ` · ends ${formatDeadline(g.ends_at)}` : ''}
              </span>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </section>
    </>
  )
}

interface CardRef {
  id: string
  text: string
}
interface GameData {
  game: {
    id: string
    code: string
    name: string
    status: string
    ends_at: string | null
    prize: string | null
    secret_feed: boolean
  }
  players: { id: string; name: string; status: string; is_host: boolean; kills: number }[]
  missions: { hunter: string; target: string; weapon: CardRef; place: CardRef; phrase: CardRef }[]
}

function GameView({ password, code }: { password: string; code: string }) {
  const qc = useQueryClient()
  const key = ['admin', 'game', code]
  const { data, error, isPending } = useQuery({
    queryKey: key,
    queryFn: () => admin<GameData>('admin_game', { p_password: password, p_code: code }),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] })
  const act = useMutation({
    mutationFn: ({ name, args }: { name: string; args: Record<string, unknown> }) =>
      admin(name, { p_password: password, ...args }),
    onSuccess: () => void refresh(),
  })

  if (isPending) return <p className="label-mono">Loading…</p>
  if (error)
    return (
      <>
        <BackLink />
        <p className="font-bold text-red-ink">{errorMessage(error)}</p>
      </>
    )
  const { game, players, missions } = data
  const running = game.status === 'active'

  return (
    <>
      <BackLink />
      <header>
        <p className="label-mono">
          {game.code} · {game.status}
          {game.secret_feed ? ' · secret feed' : ''}
        </p>
        <h1 className="text-3xl break-words">{game.name}</h1>
        {game.prize && <p className="label-mono">🏆 {game.prize}</p>}
      </header>

      {act.isError && (
        <p role="alert" className="font-bold text-red-ink">
          {errorMessage(act.error)}
        </p>
      )}

      {game.status !== 'finished' && (
        <EndTime
          endsAt={game.ends_at}
          busy={act.isPending}
          onSave={(endsAt) =>
            act.mutate({
              name: 'admin_set_end',
              args: { p_game_id: game.id, ...(endsAt ? { p_ends_at: endsAt } : {}) },
            })
          }
        />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl">Players</h2>
        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-xl brut bg-paper px-3 py-2 shadow-hard-sm"
          >
            <span className="min-w-0 flex-1">
              <span
                className={p.status === 'dead' ? 'font-bold text-muted line-through' : 'font-bold'}
              >
                {p.name}
              </span>
              <span className="label-mono text-muted">
                {' '}
                · {p.kills} kills{p.is_host ? ' · host' : ''}
              </span>
            </span>
            {running && p.status === 'alive' && (
              <button
                type="button"
                disabled={act.isPending}
                className="min-h-11 label-mono text-red-ink underline"
                onClick={() => {
                  if (window.confirm(`Remove ${p.name}? Their hunter takes their mission.`)) {
                    act.mutate({ name: 'admin_remove_player', args: { p_player_id: p.id } })
                  }
                }}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </section>

      {missions.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">Missions</h2>
          {missions.map((m) => (
            <Card key={m.hunter} tone="paper" className="flex flex-col gap-2">
              <p className="font-bold">
                {m.hunter} → {m.target}
              </p>
              {(['weapon', 'place', 'phrase'] as const).map((kind) => (
                <CardEdit
                  key={m[kind].id}
                  label={kind}
                  card={m[kind]}
                  busy={act.isPending}
                  onSave={(text) =>
                    act.mutate({
                      name: 'admin_set_card',
                      args: { p_card_id: m[kind].id, p_text: text },
                    })
                  }
                />
              ))}
            </Card>
          ))}
        </section>
      )}
    </>
  )
}

function BackLink() {
  return (
    <Link
      to="/admin"
      search={{}}
      className="inline-flex min-h-11 items-center label-mono underline"
    >
      ← All games
    </Link>
  )
}

function EndTime({
  endsAt,
  busy,
  onSave,
}: {
  endsAt: string | null
  busy: boolean
  onSave: (endsAt: string | null) => void
}) {
  const [value, setValue] = useState(endsAt ? toLocalInput(new Date(endsAt).getTime()) : '')
  return (
    <Card tone="paper" className="flex flex-col gap-2">
      <p className="font-bold">End time: {endsAt ? formatDeadline(endsAt) : 'none'}</p>
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-11 flex-1 rounded-xl brut bg-paper px-3"
          aria-label="New end time"
        />
        <Button
          variant="ink"
          disabled={busy || !value}
          onClick={() => onSave(fromLocalInput(value))}
        >
          Save
        </Button>
        {endsAt && (
          <Button variant="paper" disabled={busy} onClick={() => onSave(null)}>
            Clear
          </Button>
        )}
      </div>
    </Card>
  )
}

function CardEdit({
  label,
  card,
  busy,
  onSave,
}: {
  label: string
  card: CardRef
  busy: boolean
  onSave: (text: string) => void
}) {
  const [text, setText] = useState(card.text)
  const changed = text.trim() !== card.text
  return (
    <div className="flex items-end gap-2">
      <TextField
        label={label}
        value={text}
        maxLength={80}
        onChange={(e) => setText(e.target.value)}
        className="flex-1"
      />
      <Button variant="ink" disabled={busy || !changed} onClick={() => onSave(text.trim())}>
        Save
      </Button>
    </div>
  )
}
