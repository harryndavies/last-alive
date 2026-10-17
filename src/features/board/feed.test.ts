import { describe, expect, it } from 'vitest'
import type { Player } from '@/features/game/schemas'
import { describeEvent, killFeed, standings, survivedFor, type GameEvent } from './feed'

function player(over: Partial<Player> & { id: string; name: string }): Player {
  return {
    game_id: '00000000-0000-4000-8000-000000000000',
    user_id: '00000000-0000-4000-8000-000000000001',
    colour: 'red',
    is_host: false,
    status: 'alive',
    cards_locked: true,
    kills_count: 0,
    killed_by: null,
    died_at: null,
    created_at: '2026-10-01T00:00:00Z',
    ...over,
  }
}

const ev = (id: number, type: string, payload: Record<string, unknown> = {}): GameEvent => ({
  id,
  type,
  payload,
  created_at: '2026-10-02T00:00:00Z',
})

describe('describeEvent', () => {
  it('describes a confirmed kill that was auto-confirmed', () => {
    const item = describeEvent(
      ev(1, 'kill_confirmed', {
        killer_name: 'Ana',
        victim_name: 'Ben',
        resolved_by: 'auto',
      }),
    )
    expect(item?.text).toBe('Ana got Ben')
    expect(item?.detail).toMatch(/12h/)
  })

  it('ignores unknown events', () => {
    expect(describeEvent(ev(1, 'secret_thing'))).toBeNull()
  })
})

describe('killFeed', () => {
  it('only shows game events from the start onwards, newest first', () => {
    const events = [
      ev(5, 'game_finished', { winner_name: 'Ana' }),
      ev(4, 'kill_confirmed', { killer_name: 'Ana', victim_name: 'Ben' }),
      ev(3, 'game_started', { player_count: 4 }),
      ev(2, 'player_joined', { name: 'Ben' }),
      ev(1, 'game_created', { name: 'Ana' }),
    ]
    expect(killFeed(events).map((i) => i.type)).toEqual([
      'game_finished',
      'kill_confirmed',
      'game_started',
    ])
  })
})

describe('standings', () => {
  const ana = player({ id: 'a', name: 'Ana', kills_count: 2 })
  const ben = player({
    id: 'b',
    name: 'Ben',
    status: 'dead',
    killed_by: 'a',
    died_at: '2026-10-02T10:00:00Z',
  })
  const cat = player({ id: 'c', name: 'Cat', kills_count: 1 })
  const dan = player({
    id: 'd',
    name: 'Dan',
    status: 'dead',
    killed_by: 'c',
    died_at: '2026-10-03T10:00:00Z',
  })

  it('ranks the living by kills, then the dead by who lasted longest', () => {
    expect(standings([ben, dan, cat, ana]).map((s) => s.player.name)).toEqual([
      'Ana',
      'Cat',
      'Dan',
      'Ben',
    ])
  })

  it('puts the winner first and records who got each dead player', () => {
    const rows = standings([ana, ben, cat, dan], 'c')
    expect(rows[0]?.player.name).toBe('Cat')
    expect(rows.find((r) => r.player.id === 'b')?.killedBy?.name).toBe('Ana')
  })
})

describe('survivedFor', () => {
  it('shows hours under a day and days after', () => {
    const start = '2026-10-01T00:00:00Z'
    expect(survivedFor(start, '2026-10-01T05:30:00Z')).toBe('5h')
    expect(survivedFor(start, '2026-10-03T01:00:00Z')).toBe('2d')
    expect(survivedFor(null, null)).toBe('0h')
  })
})
