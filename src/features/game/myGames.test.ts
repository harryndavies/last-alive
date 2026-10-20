import { describe, expect, it } from 'vitest'
import { toMyGames, type MySeat } from './myGames'

const ME = '00000000-0000-4000-8000-000000000001'

function seat(
  code: string,
  status: MySeat['games']['status'],
  created_at: string,
  extra: Partial<Omit<MySeat, 'games' | 'player_stats'>> & {
    winner?: string | null
    kills_count?: number
  } = {},
): MySeat {
  return {
    id: extra.id ?? ME,
    name: extra.name ?? 'Harry',
    colour: extra.colour ?? 'yellow',
    status: extra.status ?? 'alive',
    player_stats: { kills_count: extra.kills_count ?? 0 },
    games: {
      code,
      name: `Game ${code}`,
      status,
      winner_player_id: extra.winner ?? null,
      created_at,
    },
  }
}

describe('toMyGames', () => {
  it('lists games still going first, newest first, then finished ones', () => {
    const games = toMyGames([
      seat('OLD-01', 'finished', '2026-10-01'),
      seat('ACT-01', 'active', '2026-10-10'),
      seat('LOB-01', 'lobby', '2026-10-12'),
      seat('NEW-01', 'finished', '2026-10-15'),
    ])
    expect(games.map((g) => g.code)).toEqual(['LOB-01', 'ACT-01', 'NEW-01', 'OLD-01'])
  })

  it('says where you stand in each game', () => {
    const [lobby, picking, alive, out, won, lost] = toMyGames([
      seat('A-01', 'lobby', '2026-10-06'),
      seat('B-01', 'picking', '2026-10-05'),
      seat('C-01', 'active', '2026-10-04', { kills_count: 1 }),
      seat('D-01', 'active', '2026-10-03', { status: 'dead', kills_count: 2 }),
      seat('E-01', 'finished', '2026-10-02', { winner: ME, kills_count: 4 }),
      seat('F-01', 'finished', '2026-10-01', {
        status: 'dead',
        winner: '00000000-0000-4000-8000-000000000002',
      }),
    ])
    expect(lobby?.summary).toBe('Waiting to start')
    expect(picking?.summary).toBe('Picking cards')
    expect(alive?.summary).toBe('Alive · 1 kill')
    expect(out).toMatchObject({ summary: "You're out · 2 kills", dead: true })
    expect(won).toMatchObject({ summary: 'You won · 4 kills', finished: true })
    expect(lost?.summary).toBe('Finished · 0 kills')
  })
})
