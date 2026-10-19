import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { gameKeys } from '@/features/game/keys'
import { toGameError } from '@/lib/errors'
import { rpcParsed } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'

export const CALLOUT_COOLDOWN_MS = 24 * 60 * 60 * 1000

const CallOutResult = z.object({ correct: z.boolean(), retry_at: z.string().optional() })
export type CallOutResult = z.infer<typeof CallOutResult>

/** When your last wrong call-out was, if any (you can only see your own). */
export const lastMissQuery = (gameId: string, playerId: string) =>
  queryOptions({
    queryKey: ['callout-miss', gameId, playerId] as const,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('callouts')
        .select('created_at')
        .eq('accuser_id', playerId)
        .eq('correct', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw toGameError(error)
      return data?.created_at ?? null
    },
  })

/** When you may call someone out again, or null if you can now. */
export function nextCallOutAt(lastMiss: string | null, now = Date.now()): Date | null {
  if (!lastMiss) return null
  const at = new Date(lastMiss).getTime() + CALLOUT_COOLDOWN_MS
  return at > now ? new Date(at) : null
}

export function useCallOut(gameId: string, playerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (suspectId: string) =>
      rpcParsed('call_out_hunter', { p_game_id: gameId, p_suspect_id: suspectId }, CallOutResult),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['callout-miss', gameId, playerId] })
      void queryClient.invalidateQueries({ queryKey: gameKeys.players(gameId) })
      void queryClient.invalidateQueries({ queryKey: gameKeys.events(gameId) })
    },
  })
}
