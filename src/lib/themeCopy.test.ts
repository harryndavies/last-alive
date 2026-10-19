import { describe, expect, it } from 'vitest'
import { describeEvent } from '@/features/board/feed'
import { codenames, copyFor } from './themeCopy'

const ids = Array.from(
  { length: 40 },
  (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
)

describe('codenames', () => {
  it('gives every player in a game a different codename', () => {
    const names = codenames('game-1', ids)
    expect(new Set(names.values()).size).toBe(ids.length)
  })

  it('is the same for everyone, whatever order the players arrive in', () => {
    const a = codenames('game-1', ids)
    const b = codenames('game-1', [...ids].reverse())
    expect([...b]).toEqual(expect.arrayContaining([...a]))
  })

  it('still names everyone in games bigger than the list', () => {
    const many = Array.from({ length: 60 }, (_, i) => `p${String(i).padStart(3, '0')}`)
    expect(new Set(codenames('g', many).values()).size).toBe(60)
  })
})

describe('spy wording in the feed', () => {
  it('uses spy words and codenames', () => {
    const tags = codenames('g', ['killer', 'victim'])
    const item = describeEvent(
      {
        id: 1,
        type: 'kill_confirmed',
        payload: {
          killer_id: 'killer',
          killer_name: 'Tom',
          victim_id: 'victim',
          victim_name: 'Alex',
        },
        created_at: '2026-10-20T12:00:00Z',
      },
      {
        copy: copyFor('spy'),
        nameOf: (id, name) => (typeof id === 'string' && tags.get(id)) || String(name),
      },
    )
    expect(item?.text).toBe(`${tags.get('killer')} terminated ${tags.get('victim')}`)
  })

  it('reads as before in classic games', () => {
    const item = describeEvent({
      id: 1,
      type: 'kill_confirmed',
      payload: { killer_name: 'Tom', victim_name: 'Alex' },
      created_at: '2026-10-20T12:00:00Z',
    })
    expect(item?.text).toBe('Tom got Alex')
  })
})
