import { describe, expect, it } from 'vitest'
import { summarise, type ReactionRow } from './social'

describe('summarise', () => {
  const rows: ReactionRow[] = [
    { event_id: 1, player_id: 'a', emoji: '💀' },
    { event_id: 1, player_id: 'b', emoji: '💀' },
    { event_id: 1, player_id: 'a', emoji: '😂' },
    { event_id: 2, player_id: 'a', emoji: '🔥' },
  ]

  it('counts each reaction on one kill, in a fixed order', () => {
    expect(summarise(rows, 1, 'b').map((r) => [r.emoji, r.count, r.mine])).toEqual([
      ['💀', 2, true],
      ['😂', 1, false],
      ['🔥', 0, false],
      ['😱', 0, false],
      ['👏', 0, false],
    ])
  })
})
