import { describe, expect, it } from 'vitest'
import { epitaph } from './epitaph'

describe('epitaph', () => {
  it('uses the weapon or place, tidied up', () => {
    const line = epitaph({ id: 'x', weapon: 'A Rubber Duck ', place: 'The Kitchen' })
    expect(line).toMatch(/rubber duck|kitchen/)
    expect(line).not.toMatch(/A Rubber|The Kitchen/)
  })

  it('always gives the same line for the same death', () => {
    const d = { id: 'abc', weapon: 'pen', place: 'lift' }
    expect(epitaph(d)).toBe(epitaph(d))
  })

  it('has lines for rumbles, leavers and unknown deaths', () => {
    expect(epitaph({ id: 'a', rumbled: true })).toBeTruthy()
    expect(epitaph({ id: 'a', left: true })).toMatch(/Left|Gone/)
    expect(epitaph({ id: 'a' })).toBeTruthy()
  })
})
