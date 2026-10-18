import { describe, expect, it } from 'vitest'
import { codeFromPath, guardRedirect, screenFromPath } from './guard'

describe('screenFromPath', () => {
  it('reads the screen segment', () => {
    expect(screenFromPath('/g/CLUE-7Q')).toBe('home')
    expect(screenFromPath('/g/CLUE-7Q/')).toBe('home')
    expect(screenFromPath('/g/CLUE-7Q/mission')).toBe('mission')
    expect(screenFromPath('/g/CLUE-7Q/new-mission')).toBe('new-mission')
    expect(screenFromPath('/g/CLUE-7Q/nope')).toBeNull()
    expect(screenFromPath('/')).toBeNull()
  })
})

describe('codeFromPath', () => {
  it('reads the game code', () => {
    expect(codeFromPath('/g/CLUE-7Q/lobby')).toBe('CLUE-7Q')
    expect(codeFromPath('/g/CLUE-7Q')).toBe('CLUE-7Q')
    expect(codeFromPath('/join/CLUE-7Q')).toBeNull()
  })
})

describe('guardRedirect', () => {
  it('keeps everyone in the lobby until picking starts', () => {
    expect(guardRedirect('lobby', true, 'mission')).toBe('lobby')
    expect(guardRedirect('lobby', true, 'lobby')).toBeNull()
  })

  it('sends everyone to card picking', () => {
    expect(guardRedirect('picking', true, 'lobby')).toBe('cards')
  })

  it('lets living players use every game tab', () => {
    for (const s of ['home', 'mission', 'new-mission', 'board'] as const) {
      expect(guardRedirect('active', true, s)).toBeNull()
    }
    expect(guardRedirect('active', true, 'cards')).toBe('home')
  })

  it('gives dead players a read-only spectator view', () => {
    expect(guardRedirect('active', false, 'mission')).toBe('home')
    expect(guardRedirect('active', false, 'new-mission')).toBe('home')
    expect(guardRedirect('active', false, 'board')).toBeNull()
  })

  it('shows the winner once the game is over', () => {
    expect(guardRedirect('finished', true, 'home')).toBe('winner')
    expect(guardRedirect('finished', false, 'board')).toBeNull()
  })
})
