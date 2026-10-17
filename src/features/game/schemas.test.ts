import { describe, expect, it } from 'vitest'
import { CodeForm, JoinGameResult, normaliseCode, ReclaimResult } from './schemas'

describe('normaliseCode', () => {
  it('accepts codes however people type them', () => {
    expect(normaliseCode(' clue-7q ')).toBe('CLUE-7Q')
    expect(normaliseCode('clue7q')).toBe('CLUE-7Q')
    expect(CodeForm.safeParse({ code: normaliseCode('clue7q') }).success).toBe(true)
    expect(CodeForm.safeParse({ code: 'nope' }).success).toBe(false)
  })
})

describe('RPC response schemas', () => {
  it('rejects a join response without a player id', () => {
    expect(JoinGameResult.safeParse({ code: 'CLUE-7Q', pin: '1234' }).success).toBe(false)
  })

  it('understands a failed reclaim', () => {
    const r = ReclaimResult.parse({ ok: false, error: 'wrong_pin', attempts_left: 3 })
    expect(r.ok).toBe(false)
  })
})
