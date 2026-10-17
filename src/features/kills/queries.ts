import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { gameKeys } from '@/features/game/keys'
import { toGameError } from '@/lib/errors'
import { rpc, rpcParsed } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'

export const KillStatus = z.enum(['pending', 'confirmed', 'disputed', 'rejected'])

export const KillSchema = z.object({
  id: z.uuid(),
  game_id: z.uuid(),
  mission_id: z.uuid(),
  killer_id: z.uuid(),
  victim_id: z.uuid(),
  status: KillStatus,
  used_object: z.boolean(),
  note: z.string().nullable(),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
  resolved_by: z.string().nullable(),
})
export type Kill = z.infer<typeof KillSchema>

const Who = z.object({ id: z.uuid(), name: z.string(), colour: z.string() })

export const ClaimSchema = z.object({
  id: z.uuid(),
  game_id: z.uuid(),
  status: KillStatus,
  killer: Who,
  victim: Who,
  weapon: z.string(),
  place: z.string(),
  object: z.string(),
  used_object: z.boolean(),
  note: z.string().nullable(),
  created_at: z.string(),
  auto_confirm_at: z.string(),
})
export type Claim = z.infer<typeof ClaimSchema>

/** Claims you are part of (RLS: as killer, victim, or host of a dispute). */
export const killsQuery = (gameId: string) =>
  queryOptions({
    queryKey: gameKeys.kills(gameId),
    queryFn: async (): Promise<Kill[]> => {
      const { data, error } = await supabase
        .from('kills')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
      if (error) throw toGameError(error)
      return z.array(KillSchema).parse(data)
    },
  })

export const claimQuery = (killId: string) =>
  queryOptions({
    queryKey: gameKeys.claim(killId),
    queryFn: () => rpcParsed('get_kill_claim', { p_kill_id: killId }, ClaimSchema),
  })

export function openClaimBy(kills: Kill[], playerId: string): Kill | undefined {
  return kills.find(
    (k) => k.killer_id === playerId && (k.status === 'pending' || k.status === 'disputed'),
  )
}

export function pendingClaimAgainst(kills: Kill[], playerId: string): Kill | undefined {
  return kills.find((k) => k.victim_id === playerId && k.status === 'pending')
}

export function disputesFor(kills: Kill[]): Kill[] {
  return kills.filter((k) => k.status === 'disputed')
}

function useKillAction<TArgs>(gameId: string, run: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () =>
      Promise.all(
        [
          gameKeys.kills(gameId),
          gameKeys.mission(gameId),
          gameKeys.missionHistory(gameId),
          gameKeys.players(gameId),
          gameKeys.events(gameId),
          ['game'],
          ['kill-claim'],
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      ),
  })
}

export const useReportKill = (gameId: string) =>
  useKillAction(gameId, (input: { victimId: string; usedObject: boolean; note: string }) =>
    rpc('report_kill', {
      p_game_id: gameId,
      p_victim_id: input.victimId,
      p_used_object: input.usedObject,
      p_note: input.note.trim() || undefined,
    }),
  )

export const useRespondToKill = (gameId: string) =>
  useKillAction(gameId, (input: { killId: string; confirm: boolean }) =>
    rpc('respond_to_kill', { p_kill_id: input.killId, p_confirm: input.confirm }),
  )

export const useResolveDispute = (gameId: string) =>
  useKillAction(gameId, (input: { killId: string; confirm: boolean }) =>
    rpc('resolve_dispute', { p_kill_id: input.killId, p_confirm: input.confirm }),
  )
