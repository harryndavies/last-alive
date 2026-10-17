import type { GameStatus } from './schemas'

export type Screen =
  'lobby' | 'cards' | 'home' | 'mission' | 'new-mission' | 'board' | 'killcam' | 'winner'

const SCREENS: readonly Screen[] = [
  'lobby',
  'cards',
  'home',
  'mission',
  'new-mission',
  'board',
  'killcam',
  'winner',
]

/** Which screen a /g/$code/... path is, or null for unknown sub-paths. */
export function screenFromPath(pathname: string): Screen | null {
  const match = /^\/g\/[^/]+\/?([^/?#]*)/.exec(pathname)
  if (!match) return null
  const segment = match[1] ?? ''
  if (segment === '') return 'home'
  return (SCREENS as readonly string[]).includes(segment) ? (segment as Screen) : null
}

export function allowedScreens(status: GameStatus, alive: boolean): readonly Screen[] {
  switch (status) {
    case 'lobby':
      return ['lobby']
    case 'picking':
      return ['cards']
    case 'active':
      return alive
        ? ['home', 'mission', 'new-mission', 'board', 'killcam']
        : ['home', 'board', 'killcam']
    case 'finished':
      return ['winner', 'board', 'killcam']
  }
}

/** Where to send someone who is on `screen`, or null if they may stay. */
export function guardRedirect(
  status: GameStatus,
  alive: boolean,
  screen: Screen | null,
): Screen | null {
  const allowed = allowedScreens(status, alive)
  if (screen && allowed.includes(screen)) return null
  return allowed[0] ?? 'home'
}

export function screenPath(screen: Screen): '/g/$code' | `/g/$code/${Exclude<Screen, 'home'>}` {
  return screen === 'home' ? '/g/$code' : `/g/$code/${screen}`
}
