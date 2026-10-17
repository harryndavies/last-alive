import { describe, expect, it } from 'vitest'
import type { Game, Player } from '@/features/game/schemas'
import type { GameEvent } from './feed'
import { buildKillCam, whenInGame } from './killcamSlides'

const ana = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Ana',
  colour: 'red',
  kills_count: 2,
} as Player
const ben = {
  id: 'b0000000-0000-4000-8000-000000000002',
  name: 'Ben',
  colour: 'blue',
  kills_count: 0,
} as Player
const cat = {
  id: 'c0000000-0000-4000-8000-000000000003',
  name: 'Cat',
  colour: 'mint',
  kills_count: 0,
} as Player

const game = (over: Partial<Game> = {}): Game =>
  ({
    id: 'g0000000-0000-4000-8000-000000000000',
    name: 'Friday',
    status: 'active',
    winner_player_id: null,
    started_at: '2026-10-01T09:00:00Z',
    ...over,
  }) as Game

const kill = (
  id: number,
  killer: Player,
  victim: Player,
  extra: Record<string, unknown> = {},
): GameEvent => ({
  id,
  type: 'kill_confirmed',
  created_at: `2026-10-0${id}T12:00:00Z`,
  payload: {
    killer_id: killer.id,
    killer_name: killer.name,
    victim_id: victim.id,
    victim_name: victim.name,
    ...extra,
  },
})

describe('buildKillCam', () => {
  const events: GameEvent[] = [
    kill(3, ana, cat, {
      photo_path: 'g/u/p.jpg',
      phrase: 'Checkmate',
      weapon: 'Sock',
      place: 'Lift',
    }),
    { id: 2, type: 'player_joined', payload: { name: 'Dan' }, created_at: '2026-10-01T00:00:00Z' },
    kill(1, ana, ben),
  ]

  it('plays the kills oldest first, numbered, after an intro', () => {
    const slides = buildKillCam(events, [ana, ben, cat], game())
    expect(slides.map((s) => s.kind)).toEqual(['intro', 'kill', 'kill'])
    const [, first, second] = slides
    expect(first?.kind === 'kill' && [first.number, first.victim.name]).toEqual([1, 'Ben'])
    expect(
      second?.kind === 'kill' && [second.photoPath, second.phrase, second.killer.colour],
    ).toEqual(['g/u/p.jpg', 'Checkmate', 'red'])
  })

  it('handles older kills recorded before photos and cards were in the feed', () => {
    const [, first] = buildKillCam(events, [ana, ben, cat], game())
    expect(first?.kind === 'kill' && [first.photoPath, first.weapon, first.phrase]).toEqual([
      null,
      null,
      null,
    ])
  })

  it('ends on the winner once the game is over', () => {
    const slides = buildKillCam(
      events,
      [ana, ben, cat],
      game({ status: 'finished', winner_player_id: ana.id }),
    )
    const last = slides.at(-1)
    expect(last?.kind === 'winner' && [last.winner?.name, last.kills]).toEqual(['Ana', 2])
  })
})

describe('whenInGame', () => {
  it('counts days from the start of the game', () => {
    expect(whenInGame('2026-10-01T15:00:00Z', '2026-10-01T09:00:00Z')).toMatch(/^Day 1 · /)
    expect(whenInGame('2026-10-03T10:00:00Z', '2026-10-01T09:00:00Z')).toMatch(/^Day 3 · /)
  })
})
