import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { gameKeys } from '@/features/game/keys'
import { toGameError } from '@/lib/errors'
import { rpc } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'
import { CARD_KINDS } from './suggestions'

export const CardSchema = z.object({
  id: z.uuid(),
  kind: z.enum(CARD_KINDS),
  text: z.string(),
  submitted_by: z.uuid(),
})
export type Card = z.infer<typeof CardSchema>

export const CardsForm = z.object({
  weapon: z.string().trim().min(2, 'At least 2 characters').max(60, 'Up to 60 characters'),
  place: z.string().trim().min(2, 'At least 2 characters').max(60, 'Up to 60 characters'),
  object: z.string().trim().min(2, 'At least 2 characters').max(60, 'Up to 60 characters'),
})
export type CardsForm = z.infer<typeof CardsForm>

/** Cards you submitted (RLS lets you read your own). */
export const myCardsQuery = (gameId: string, playerId: string) =>
  queryOptions({
    queryKey: gameKeys.myCards(gameId),
    queryFn: async (): Promise<Card[]> => {
      const { data, error } = await supabase
        .from('cards')
        .select('id, kind, text, submitted_by')
        .eq('game_id', gameId)
        .eq('submitted_by', playerId)
      if (error) throw toGameError(error)
      return z.array(CardSchema).parse(data)
    },
  })

export function useSubmitCards(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cards: CardsForm) =>
      rpc('submit_cards', {
        p_game_id: gameId,
        p_weapon: cards.weapon,
        p_place: cards.place,
        p_object: cards.object,
      }),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: gameKeys.myCards(gameId) }),
        qc.invalidateQueries({ queryKey: gameKeys.players(gameId) }),
      ]),
  })
}
