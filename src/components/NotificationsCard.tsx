import { useState } from 'react'
import { usePush } from '@/lib/push'
import { safeStorage } from '@/lib/storage'
import { Button } from './Button'
import { Card } from './Card'
import { Tag } from './Tag'

const DISMISS_KEY = 'last-alive:push-card-dismissed'

/**
 * Asks to turn on push notifications. `compact` is a one-line status/toggle for
 * places where the full card would be noise (or once it has been dismissed).
 */
export function NotificationsCard({ compact = false }: { compact?: boolean }) {
  const { state, busy, error, enable, disable } = usePush()
  const [dismissed, setDismissed] = useState(() => safeStorage.get(DISMISS_KEY) === '1')

  if (state === 'unsupported') return null

  if (compact || dismissed || state === 'on') {
    if (state === 'on') {
      return (
        <p className="flex min-h-11 items-center justify-center gap-2 text-center label-mono">
          <span aria-hidden="true">🔔</span> Notifications on ·{' '}
          <button
            type="button"
            className="min-h-11 underline"
            disabled={busy}
            onClick={() => void disable()}
          >
            Turn off
          </button>
        </p>
      )
    }
    if (state === 'off') {
      return (
        <p className="flex min-h-11 items-center justify-center text-center label-mono">
          <button
            type="button"
            className="min-h-11 underline"
            disabled={busy}
            onClick={() => void enable()}
          >
            🔔 Turn on notifications
          </button>
        </p>
      )
    }
    return null
  }

  return (
    <Card tone="pink" tilt={1} className="flex flex-col gap-3">
      <Tag tone="ink" className="self-start">
        Don&rsquo;t miss a hit
      </Tag>
      {state === 'ios-install' ? (
        <>
          <p className="font-bold">On iPhone, notifications only work from your home screen.</p>
          <ol className="list-decimal space-y-1 pl-5 font-medium">
            <li>
              Tap <strong>Share</strong> <span aria-hidden="true">(□↑)</span> in Safari.
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>.
            </li>
            <li>Open Last Alive from your home screen and turn them on there.</li>
          </ol>
          <p className="text-sm">
            Then reclaim your seat with your name and PIN (you&rsquo;ll be on a fresh session).
          </p>
        </>
      ) : state === 'denied' ? (
        <p className="font-bold">
          Notifications are blocked for this site. Turn them on in your browser&rsquo;s site
          settings to get pinged when someone says they got you.
        </p>
      ) : (
        <>
          <p className="font-bold">
            Get a ping when someone says they got you, when your mission changes, and when the game
            ends. Miss a claim for 12 hours and it counts.
          </p>
          <Button variant="ink" block loading={busy} onClick={() => void enable()}>
            Turn on notifications
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="font-bold text-red-ink">
          {error}
        </p>
      )}
      <button
        type="button"
        className="min-h-11 self-center label-mono underline"
        onClick={() => {
          safeStorage.set(DISMISS_KEY, '1')
          setDismissed(true)
        }}
      >
        Not now
      </button>
    </Card>
  )
}
