import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'
import { gameKeys } from '@/features/game/keys'
import type { Game } from '@/features/game/schemas'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { rpc } from '@/lib/rpc'
import { THEME_INFO, THEMES, type Theme } from '@/lib/themeCopy'

// Each theme's own colours and type, so the preview looks right in either theme.
const PREVIEW: Record<Theme, { bg: string; ink: string; accent: string; font: string }> = {
  classic: {
    bg: '#ffd23f',
    ink: '#111111',
    accent: '#ff4b3e',
    font: "'Archivo Black', sans-serif",
  },
  spy: { bg: '#d8d0ae', ink: '#26281c', accent: '#a62d1f', font: "'Stardos Stencil', sans-serif" },
}

export function ThemePicker({ value, onChange }: { value: Theme; onChange: (t: Theme) => void }) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 label-mono">Theme</legend>
      <div className="grid grid-cols-2 gap-3">
        {THEMES.map((t) => (
          <label
            key={t}
            className={cn(
              'flex cursor-pointer flex-col gap-2 rounded-xl brut bg-paper p-2 shadow-hard-sm',
              value === t && 'outline-3 outline-offset-2 outline-blue',
            )}
          >
            <input
              type="radio"
              name={name}
              value={t}
              checked={value === t}
              onChange={() => onChange(t)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className="flex h-16 items-center justify-center border-2 text-xl uppercase"
              style={{
                background: PREVIEW[t].bg,
                color: PREVIEW[t].ink,
                borderColor: PREVIEW[t].ink,
                fontFamily: PREVIEW[t].font,
              }}
            >
              {t === 'spy' ? (
                <span
                  style={{
                    color: PREVIEW[t].accent,
                    border: `3px solid ${PREVIEW[t].accent}`,
                    padding: '0 6px',
                    transform: 'rotate(-4deg)',
                  }}
                >
                  Top secret
                </span>
              ) : (
                'Last Alive'
              )}
            </span>
            <span className="leading-tight font-bold">{THEME_INFO[t].name}</span>
            <span className="text-sm text-muted">{THEME_INFO[t].blurb}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** The lobby's theme switch: the host changes it for everyone; others just see it. */
export function LobbyTheme({ game, isHost }: { game: Game; isHost: boolean }) {
  const qc = useQueryClient()
  const setTheme = useMutation({
    mutationFn: (theme: Theme) => rpc('set_game_theme', { p_game_id: game.id, p_theme: theme }),
    onSuccess: () => qc.invalidateQueries({ queryKey: gameKeys.game(game.code) }),
  })
  if (!isHost) {
    return <p className="label-mono">Theme: {THEME_INFO[game.theme].name}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      <ThemePicker value={game.theme} onChange={(t) => setTheme.mutate(t)} />
      {setTheme.isError && (
        <p role="alert" className="font-bold text-red-ink">
          {errorMessage(setTheme.error)}
        </p>
      )}
    </div>
  )
}
