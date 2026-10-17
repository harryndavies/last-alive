import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef } from 'react'
import { Avatar, Button, Tag } from '@/components'
import { PlayingCard } from '@/features/cards/PlayingCard'
import type { Player } from '@/features/game/schemas'
import { errorMessage } from '@/lib/errors'
import { claimQuery, killsQuery, pendingClaimAgainst, useRespondToKill } from './queries'

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * The victim-confirm screen. Opens by itself whenever a pending claim names
 * you, which Realtime delivers the moment the hunter taps "I got them".
 */
export function KillAlert({ gameId, me }: { gameId: string; me: Player }) {
  const { data: kills = [] } = useQuery(killsQuery(gameId))
  const pending = pendingClaimAgainst(kills, me.id)
  if (!pending) return null
  return <ConfirmDeath gameId={gameId} killId={pending.id} />
}

function ConfirmDeath({ gameId, killId }: { gameId: string; killId: string }) {
  const { data: claim } = useQuery(claimQuery(killId))
  const respond = useRespondToKill(gameId)
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    if ('vibrate' in navigator) navigator.vibrate?.([120, 60, 120])
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Not dismissible: you have to answer (or wait for the 12h auto-confirm).
      onCancel={(e) => e.preventDefault()}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-red p-0 text-ink"
    >
      <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Tag tone="ink" tilt className="self-start">
          Incoming
        </Tag>
        <h1 id={titleId} className="text-5xl leading-[0.95]">
          Someone says they got you
        </h1>

        {claim ? (
          <>
            <div className="flex -rotate-1 items-center gap-3 rounded-2xl brut bg-paper p-3 shadow-hard">
              <Avatar name={claim.killer.name} colour={claim.killer.colour} size="lg" />
              <div>
                <p className="label-mono">Claimed by</p>
                <p className="font-display text-3xl uppercase">{claim.killer.name}</p>
              </div>
            </div>
            <div className="grid gap-3">
              <PlayingCard kind="weapon" text={claim.weapon} tilt={1} />
              <PlayingCard kind="place" text={claim.place} tilt={-1} />
              <PlayingCard kind="phrase" text={claim.phrase} tilt={1} />
            </div>
            {claim.note && (
              <p className="rounded-xl brut bg-paper p-3 font-medium shadow-hard-sm">
                &ldquo;{claim.note}&rdquo;
              </p>
            )}
            <p className="label-mono">
              No answer by {formatDeadline(claim.auto_confirm_at)} counts as yes.
            </p>
          </>
        ) : (
          <p className="label-mono">Loading the details…</p>
        )}

        {respond.isError && (
          <p role="alert" className="rounded-xl brut bg-paper p-3 font-bold">
            {errorMessage(respond.error)}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-3">
          <Button
            variant="ink"
            size="lg"
            block
            loading={respond.isPending && respond.variables?.confirm === true}
            disabled={respond.isPending}
            onClick={() => respond.mutate({ killId, confirm: true })}
          >
            Yes, I&rsquo;m dead
          </Button>
          <Button
            variant="paper"
            size="lg"
            block
            loading={respond.isPending && respond.variables?.confirm === false}
            disabled={respond.isPending}
            onClick={() => respond.mutate({ killId, confirm: false })}
          >
            That&rsquo;s wrong
          </Button>
          <p className="text-center text-sm font-bold">
            &ldquo;That&rsquo;s wrong&rdquo; sends it to the host to decide.
          </p>
        </div>
      </div>
    </dialog>
  )
}
