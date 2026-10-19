import { useQuery } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { Avatar } from '@/components'
import type { Player } from '@/features/game/schemas'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { timeAgo } from './feed'
import {
  commentsQuery,
  reactionsQuery,
  summarise,
  useAddComment,
  useDeleteComment,
  useToggleReaction,
} from './social'

export interface SocialContext {
  gameId: string
  me: Player
  players: Player[]
}

/** Reactions and the comment thread under one kill in the feed. */
export function KillSocial({ eventId, ctx }: { eventId: number; ctx: SocialContext }) {
  const { gameId, me, players } = ctx
  const { data: reactions = [] } = useQuery(reactionsQuery(gameId))
  const { data: allComments = [] } = useQuery(commentsQuery(gameId))
  const toggle = useToggleReaction(gameId, me.id)
  const add = useAddComment(gameId)
  const remove = useDeleteComment(gameId)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const threadId = useId()

  const summary = summarise(reactions, eventId, me.id)
  const comments = allComments.filter((c) => c.event_id === eventId)
  const byId = new Map(players.map((p) => [p.id, p]))

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    add.mutate({ eventId, body }, { onSuccess: () => setDraft('') })
  }

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {summary.map((r) => (
          <button
            key={r.emoji}
            type="button"
            aria-pressed={r.mine}
            aria-label={`${r.emoji} ${r.count}${r.mine ? ', you reacted' : ''}`}
            onClick={() => toggle.mutate({ eventId, emoji: r.emoji })}
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border-2 border-ink px-2.5 text-base shadow-hard-sm transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
              r.mine ? 'bg-yellow' : 'bg-paper',
            )}
          >
            <span aria-hidden="true">{r.emoji}</span>
            {r.count > 0 && (
              <span aria-hidden="true" className="font-mono text-xs font-bold">
                {r.count}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={threadId}
          onClick={() => setOpen((o) => !o)}
          className="ml-auto inline-flex min-h-11 items-center gap-1 label-mono underline"
        >
          💬 {comments.length > 0 ? comments.length : 'Comment'}
        </button>
      </div>

      {!open && comments.length > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-left text-sm">
          <b>{byId.get(comments.at(-1)?.player_id ?? '')?.name ?? 'Someone'}:</b>{' '}
          {comments.at(-1)?.body}
        </button>
      )}

      {open && (
        <div
          id={threadId}
          className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-ground p-2.5"
        >
          {comments.length === 0 && (
            <p className="label-mono text-muted">No comments yet. Go on.</p>
          )}
          <ul className="flex flex-col gap-2">
            {comments.map((c) => {
              const author = byId.get(c.player_id)
              const canDelete = c.player_id === me.id || me.is_host
              return (
                <li key={c.id} className="flex items-start gap-2">
                  <Avatar
                    name={author?.name ?? '?'}
                    colour={author?.colour ?? 'paper'}
                    photo={author?.avatar_path}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug break-words">
                      <b>{author?.name ?? 'Someone'}</b> {c.body}
                    </p>
                    <p className="label-mono text-muted">
                      <time dateTime={c.created_at}>{timeAgo(c.created_at)}</time>
                      {canDelete && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            className="min-h-11 underline"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(c.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
          <form onSubmit={onSubmit} className="flex gap-2">
            <label className="sr-only" htmlFor={`${threadId}-input`}>
              Add a comment
            </label>
            <input
              id={`${threadId}-input`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={200}
              placeholder="Say something…"
              className="min-h-11 min-w-0 flex-1 rounded-lg brut bg-paper px-3 text-base font-medium focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || add.isPending}
              className="min-h-11 rounded-lg brut bg-yellow px-3 font-display text-sm uppercase shadow-hard-sm disabled:opacity-50"
            >
              Send
            </button>
          </form>
          {add.isError && (
            <p role="alert" className="text-sm font-bold text-red-ink">
              {errorMessage(add.error)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
