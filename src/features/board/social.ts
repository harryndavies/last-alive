import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { gameKeys } from '@/features/game/keys'
import { toGameError } from '@/lib/errors'
import { rpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'

export const REACTIONS = ['💀', '😂', '🔥', '😱', '👏'] as const
export type Reaction = (typeof REACTIONS)[number]

const ReactionSchema = z.object({
  event_id: z.number().int(),
  player_id: z.uuid(),
  emoji: z.enum(REACTIONS),
})
export type ReactionRow = z.infer<typeof ReactionSchema>

const CommentSchema = z.object({
  id: z.uuid(),
  event_id: z.number().int(),
  player_id: z.uuid(),
  body: z.string(),
  created_at: z.string(),
})
export type Comment = z.infer<typeof CommentSchema>

export const reactionsQuery = (gameId: string) =>
  queryOptions({
    queryKey: gameKeys.reactions(gameId),
    queryFn: async (): Promise<ReactionRow[]> => {
      const { data, error } = await supabase
        .from('kill_reactions')
        .select('event_id, player_id, emoji')
        .eq('game_id', gameId)
      if (error) throw toGameError(error)
      return z.array(ReactionSchema).parse(data)
    },
  })

export const commentsQuery = (gameId: string) =>
  queryOptions({
    queryKey: gameKeys.comments(gameId),
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('kill_comments')
        .select('id, event_id, player_id, body, created_at')
        .eq('game_id', gameId)
        .order('created_at')
      if (error) throw toGameError(error)
      return z.array(CommentSchema).parse(data)
    },
  })

export interface ReactionSummary {
  emoji: Reaction
  count: number
  mine: boolean
}

/** Counts per emoji for one kill, in the fixed order, including zeroes. */
export function summarise(rows: ReactionRow[], eventId: number, meId: string): ReactionSummary[] {
  return REACTIONS.map((emoji) => {
    const matching = rows.filter((r) => r.event_id === eventId && r.emoji === emoji)
    return { emoji, count: matching.length, mine: matching.some((r) => r.player_id === meId) }
  })
}

/** Toggles a reaction, updating the counts straight away and rolling back on error. */
export function useToggleReaction(gameId: string, meId: string) {
  const qc = useQueryClient()
  const key = gameKeys.reactions(gameId)
  return useMutation({
    mutationFn: (input: { eventId: number; emoji: Reaction }) =>
      rpc('toggle_reaction', { p_event_id: input.eventId, p_emoji: input.emoji }),
    onMutate: async ({ eventId, emoji }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<ReactionRow[]>(key)
      qc.setQueryData<ReactionRow[]>(key, (rows = []) => {
        const had = rows.some(
          (r) => r.event_id === eventId && r.player_id === meId && r.emoji === emoji,
        )
        return had
          ? rows.filter(
              (r) => !(r.event_id === eventId && r.player_id === meId && r.emoji === emoji),
            )
          : [...rows, { event_id: eventId, player_id: meId, emoji }]
      })
      return { previous }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useAddComment(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { eventId: number; body: string }) =>
      rpc('add_comment', { p_event_id: input.eventId, p_body: input.body }),
    onSettled: () => qc.invalidateQueries({ queryKey: gameKeys.comments(gameId) }),
  })
}

export function useDeleteComment(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => rpc('delete_comment', { p_comment_id: commentId }),
    onSettled: () => qc.invalidateQueries({ queryKey: gameKeys.comments(gameId) }),
  })
}
