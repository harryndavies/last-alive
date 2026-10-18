import { describe, expect, it } from 'vitest'
import {
  deadlinePhase,
  formatRemaining,
  fromLocalInput,
  suddenDeathFrom,
  toLocalInput,
} from './deadline'

const HOUR = 3_600_000
const game = (startedHoursAgo: number, endsInHours: number | null, status = 'active') => {
  const now = Date.UTC(2026, 9, 18, 12)
  return {
    now,
    g: {
      status,
      started_at: new Date(now - startedHoursAgo * HOUR).toISOString(),
      created_at: new Date(now - startedHoursAgo * HOUR).toISOString(),
      ends_at: endsInHours === null ? null : new Date(now + endsInHours * HOUR).toISOString(),
    },
  }
}

describe('deadlinePhase', () => {
  it('is none without a deadline or outside an active game', () => {
    const { g, now } = game(10, null)
    expect(deadlinePhase(g, now)).toBe('none')
    const lobby = game(10, 50, 'lobby')
    expect(deadlinePhase(lobby.g, lobby.now)).toBe('none')
  })

  it('counts down, then sudden death for the last 24 hours, then over', () => {
    const { g, now } = game(72, 30)
    expect(deadlinePhase(g, now)).toBe('counting')
    expect(deadlinePhase(g, now + 7 * HOUR)).toBe('sudden')
    expect(deadlinePhase(g, now + 30 * HOUR)).toBe('over')
  })

  it('uses the last quarter for short games', () => {
    const { g } = game(0, 8)
    const end = new Date(g.ends_at ?? '').getTime()
    expect(end - (suddenDeathFrom(g) ?? 0)).toBe(2 * HOUR)
  })
})

describe('formatRemaining', () => {
  it('shows the two biggest units', () => {
    expect(formatRemaining((3 * 24 + 4) * HOUR)).toBe('3d 4h')
    expect(formatRemaining(5 * HOUR + 12 * 60_000)).toBe('5h 12m')
    expect(formatRemaining(12 * 60_000 + 5_000)).toBe('12m 05s')
    expect(formatRemaining(-1)).toBe('0s')
  })
})

describe('datetime-local round trip', () => {
  it('keeps the minute', () => {
    const ms = new Date(2026, 9, 25, 18, 30).getTime()
    expect(new Date(fromLocalInput(toLocalInput(ms)) ?? '').getTime()).toBe(ms)
    expect(fromLocalInput('')).toBeNull()
  })
})
