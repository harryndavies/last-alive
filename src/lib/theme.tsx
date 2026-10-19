import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { codenames as makeCodenames, copyFor, type Copy, type Theme } from './themeCopy'

interface ThemeState {
  theme: Theme
  /** Spy codenames by player id (empty in classic games). */
  codenames: ReadonlyMap<string, string>
}

const ThemeContext = createContext<ThemeState>({ theme: 'classic', codenames: new Map() })

/**
 * Applies a game's theme inside its screens: the words (useCopy), codenames
 * (useNames) and the look (data-theme on <html>, which index.css restyles).
 * Leaving the game goes back to classic.
 */
export function GameTheme({
  theme,
  gameId,
  playerIds,
  children,
}: {
  theme: Theme
  gameId: string
  playerIds: readonly string[]
  children: ReactNode
}) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    return () => {
      delete document.documentElement.dataset.theme
    }
  }, [theme])
  const key = playerIds.join(',')
  const value = useMemo<ThemeState>(
    () => ({
      theme,
      codenames: theme === 'spy' ? makeCodenames(gameId, key ? key.split(',') : []) : new Map(),
    }),
    [theme, gameId, key],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  return useContext(ThemeContext).theme
}

export function useCopy(): Copy {
  return copyFor(useTheme())
}

/**
 * How to show a player. Classic: their name. Spy: their codename, with their
 * real name as the secondary line.
 */
export function useNames() {
  const { codenames } = useContext(ThemeContext)
  return useMemo(
    () => ({
      primary: (p: { id: string; name: string }) => codenames.get(p.id) ?? p.name,
      secondary: (p: { id: string; name: string }) => (codenames.has(p.id) ? p.name : null),
      /** For text built from an event payload (id + name). */
      of: (id: unknown, name: unknown, fallback = 'Someone') =>
        (typeof id === 'string' && codenames.get(id)) ||
        (typeof name === 'string' && name) ||
        fallback,
    }),
    [codenames],
  )
}
