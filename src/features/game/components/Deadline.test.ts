import { describe, expect, it } from 'vitest'
import { eveningAfter } from './Deadline'

const HOUR = 3_600_000

describe('eveningAfter', () => {
  it('ends at 8pm, never sooner than asked', () => {
    for (const startHour of [0, 9, 19, 20, 21, 23]) {
      const now = new Date(2026, 9, 20, startHour, 30).getTime()
      const end = new Date(eveningAfter(48, now))
      expect(end.getHours()).toBe(20)
      expect(end.getMinutes()).toBe(0)
      expect(end.getTime()).toBeGreaterThanOrEqual(now + 48 * HOUR)
      expect(end.getTime()).toBeLessThan(now + 72 * HOUR)
    }
  })
})
