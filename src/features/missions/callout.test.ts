import { describe, expect, it } from 'vitest'
import { describeEvent, killFeed } from '@/features/board/feed'
import { CALLOUT_COOLDOWN_MS, nextCallOutAt } from './callout'

describe('nextCallOutAt', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')

  it('is free when you have never guessed wrong', () => {
    expect(nextCallOutAt(null, now)).toBeNull()
  })

  it('locks you out for 24 hours after a wrong guess', () => {
    const miss = new Date(now - 60 * 60 * 1000).toISOString()
    expect(nextCallOutAt(miss, now)?.getTime()).toBe(Date.parse(miss) + CALLOUT_COOLDOWN_MS)
  })

  it('frees you once the 24 hours are up', () => {
    expect(nextCallOutAt(new Date(now - CALLOUT_COOLDOWN_MS - 1).toISOString(), now)).toBeNull()
  })
})

describe('rumbled in the feed', () => {
  it('says who rumbled whom', () => {
    const item = describeEvent({
      id: 1,
      type: 'rumbled',
      payload: { by_name: 'Tom', hunter_name: 'Alex', by_id: 'x', hunter_id: 'y' },
      created_at: '2026-10-20T12:00:00Z',
    })
    expect(item).toMatchObject({ text: 'Tom rumbled Alex', icon: '🕵️' })
  })

  it('shows up in the kill feed', () => {
    const feed = killFeed([
      {
        id: 2,
        type: 'rumbled',
        payload: { by_name: 'Tom', hunter_name: 'Alex' },
        created_at: '2026-10-20T12:00:00Z',
      },
      { id: 1, type: 'game_started', payload: {}, created_at: '2026-10-20T11:00:00Z' },
    ])
    expect(feed.map((i) => i.type)).toEqual(['rumbled', 'game_started'])
  })
})
