import { useEffect, useState } from 'react'

const HOUR = 3_600_000
const DAY = 24 * HOUR

export type DeadlinePhase = 'none' | 'counting' | 'sudden' | 'over'

export interface DeadlineGame {
  status: string
  ends_at: string | null
  started_at: string | null
  created_at: string
}

/** Sudden death: the last 24 hours, or the last quarter of a shorter game (mirrors the database). */
export function suddenDeathFrom(game: DeadlineGame): number | null {
  if (!game.ends_at) return null
  const end = new Date(game.ends_at).getTime()
  const start = new Date(game.started_at ?? game.created_at).getTime()
  return end - Math.min(DAY, (end - start) / 4)
}

export function deadlinePhase(game: DeadlineGame, now: number): DeadlinePhase {
  if (!game.ends_at || game.status !== 'active') return 'none'
  const end = new Date(game.ends_at).getTime()
  if (now >= end) return 'over'
  const sudden = suddenDeathFrom(game)
  return sudden !== null && now >= sudden ? 'sudden' : 'counting'
}

/** "3d 4h", "5h 12m", "12m 05s", "0s". */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

/** "Sat 14:00", or "Sat 18 Oct, 14:00" if it is more than a week away. */
export function formatDeadline(iso: string, now = Date.now()): string {
  const date = new Date(iso)
  const far = date.getTime() - now > 6 * DAY
  return date.toLocaleString(undefined, {
    weekday: 'short',
    ...(far ? { day: 'numeric', month: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** For <input type="datetime-local">: local time as YYYY-MM-DDTHH:mm. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** The current time, re-rendering every `everyMs` (faster as it matters more is up to the caller). */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}
