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
              'flex cursor-pointer flex-col gap-2 rounded-xl brut p-2 shadow-hard-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink',
              value === t ? 'bg-yellow' : 'bg-paper',
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
            <span className="flex items-center justify-between gap-1 leading-tight font-bold">
              {THEME_INFO[t].name}
              {value === t && <span aria-hidden="true">✓</span>}
            </span>
            <span className={cn('text-sm', value !== t && 'text-muted')}>
              {THEME_INFO[t].blurb}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** The host's secret feed switch. On: the living only see who's out, not who got them. */
export function LobbySecretFeed({ game, isHost }: { game: Game; isHost: boolean }) {
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: (on: boolean) => rpc('set_secret_feed', { p_game_id: game.id, p_on: on }),
    onSuccess: () => qc.invalidateQueries({ queryKey: gameKeys.game(game.code) }),
  })
  const blurb = game.secret_feed
    ? "Players see who's out, but not who got them, until they're out themselves."
    : 'Everyone sees who got who as it happens.'
  if (!isHost) {
    return (
      <p className="text-sm">
        <span className="label-mono">Secret feed: {game.secret_feed ? 'on' : 'off'}.</span> {blurb}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl brut bg-paper p-3 shadow-hard-sm">
        <span className="flex flex-col">
          <span className="font-bold">Secret feed</span>
          <span className="text-sm text-muted">{blurb}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={game.secret_feed}
          disabled={toggle.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
          className="size-6 shrink-0 accent-ink"
        />
      </label>
      {toggle.isError && (
        <p role="alert" className="font-bold text-red-ink">
          {errorMessage(toggle.error)}
        </p>
      )}
    </div>
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
