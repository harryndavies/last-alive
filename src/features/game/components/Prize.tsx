import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Button, Card, TextField } from '@/components'
import { cn } from '@/lib/cn'
import { errorMessage, toGameError } from '@/lib/errors'
import { rpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'
import { gameKeys } from '../keys'
import type { Game, Player } from '../schemas'

const IdeaSchema = z.object({ id: z.uuid(), text: z.string(), player_id: z.uuid() })
const VoteSchema = z.object({ voter_id: z.uuid(), idea_id: z.uuid() })

export const prizeQuery = (gameId: string) =>
  queryOptions({
    queryKey: gameKeys.prizes(gameId),
    queryFn: async () => {
      const [ideas, votes] = await Promise.all([
        supabase
          .from('prize_ideas')
          .select('id, text, player_id')
          .eq('game_id', gameId)
          .order('created_at'),
        supabase.from('prize_votes').select('voter_id, idea_id').eq('game_id', gameId),
      ])
      if (ideas.error) throw toGameError(ideas.error)
      if (votes.error) throw toGameError(votes.error)
      return {
        ideas: z.array(IdeaSchema).parse(ideas.data),
        votes: z.array(VoteSchema).parse(votes.data),
      }
    },
  })

/**
 * Before the start: suggest a prize and vote for one. The most-voted idea
 * becomes the prize when the game starts (a tie is a coin flip).
 */
export function PrizeVote({ game, me, players }: { game: Game; me: Player; players: Player[] }) {
  const qc = useQueryClient()
  const { data } = useQuery(prizeQuery(game.id))
  const ideas = data?.ideas ?? []
  const votes = data?.votes ?? []
  const mine = ideas.find((i) => i.player_id === me.id)
  const myVote = votes.find((v) => v.voter_id === me.id)?.idea_id
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? mine?.text ?? ''
  const refresh = () => qc.invalidateQueries({ queryKey: gameKeys.prizes(game.id) })

  const suggest = useMutation({
    mutationFn: (t: string) => rpc('suggest_prize', { p_game_id: game.id, p_text: t }),
    onSuccess: () => {
      setDraft(null)
      void refresh()
    },
  })
  const vote = useMutation({
    mutationFn: (ideaId: string | null) =>
      rpc('vote_prize', { p_game_id: game.id, ...(ideaId ? { p_idea_id: ideaId } : {}) }),
    onSuccess: () => void refresh(),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    suggest.mutate(text)
  }

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone'
  const error = suggest.error ?? vote.error

  return (
    <Card tone="yellow" className="flex flex-col gap-3">
      <div>
        <h2 className="text-2xl">🏆 Play for a prize?</h2>
        <p className="text-sm font-medium">
          Suggest one and vote. Most votes when the game starts wins, and a tie is a coin flip.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2" noValidate>
        <div className="flex-1">
          <TextField
            label={mine ? 'Your idea' : 'Suggest a prize'}
            placeholder="Loser buys pizza"
            maxLength={60}
            value={text}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="ink"
          loading={suggest.isPending}
          disabled={text.trim() === (mine?.text ?? '')}
        >
          {mine && !text.trim() ? 'Remove' : 'Save'}
        </Button>
      </form>

      {ideas.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Prize ideas">
          {ideas.map((idea) => {
            const count = votes.filter((v) => v.idea_id === idea.id).length
            const picked = myVote === idea.id
            return (
              <li key={idea.id}>
                <button
                  type="button"
                  aria-pressed={picked}
                  disabled={vote.isPending}
                  onClick={() => vote.mutate(picked ? null : idea.id)}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 rounded-xl brut px-3 py-2 text-left shadow-hard-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
                    picked ? 'bg-ink text-paper' : 'bg-paper',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold break-words">{idea.text}</span>
                    <span className="label-mono opacity-70">{nameOf(idea.player_id)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-xl leading-none">{count}</span>
                    <span className="label-mono">{count === 1 ? 'vote' : 'votes'}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="font-bold text-red-ink">
          {errorMessage(error)}
        </p>
      )}
    </Card>
  )
}
