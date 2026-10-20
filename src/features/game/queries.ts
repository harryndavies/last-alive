import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { toGameError } from '@/lib/errors'
import { rpc, rpcParsed } from '@/lib/rpc'
import { supabase } from '@/lib/supabase'
import { gameKeys } from './keys'
import {
  CreateGameResult,
  GamePreviewSchema,
  GameSchema,
  JoinGameResult,
  ReclaimResult,
  ResetPinResult,
  toPlayer,
  type Game,
  type Player,
} from './schemas'

/** The game, or null when the code is unknown or you are not a member (RLS hides it). */
export const gameQuery = (code: string) =>
  queryOptions({
    queryKey: gameKeys.game(code),
    queryFn: async (): Promise<Game | null> => {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('code', code)
        .maybeSingle()
      if (error) throw toGameError(error)
      return data ? GameSchema.parse(data) : null
    },
  })

export const previewQuery = (code: string) =>
  queryOptions({
    queryKey: gameKeys.preview(code),
    queryFn: () => rpcParsed('game_preview', { p_code: code }, GamePreviewSchema),
  })

export const playersQuery = (gameId: string) =>
  queryOptions({
    queryKey: gameKeys.players(gameId),
    queryFn: async (): Promise<Player[]> => {
      const { data, error } = await supabase
        .from('players')
        .select('*, player_stats!player_stats_player_id_fkey(kills_count, killed_by)')
        .eq('game_id', gameId)
        .order('created_at')
      if (error) throw toGameError(error)
      return z.array(z.unknown()).parse(data).map(toPlayer)
    },
  })

export interface GameContext {
  game: Game
  players: Player[]
  me: Player
}

/** Game + players + your seat. Only for use under /g/$code, where the guard guarantees them. */
/** Safety net in case a Realtime message is missed (flaky network, sleeping phone). */
const BACKGROUND_REFRESH_MS = 20_000

export function useGameContext(code: string, userId: string): GameContext {
  const { data: game } = useSuspenseQuery({
    ...gameQuery(code),
    refetchInterval: BACKGROUND_REFRESH_MS,
  })
  if (!game) throw new Error('Game not found')
  const { data: players } = useSuspenseQuery({
    ...playersQuery(game.id),
    refetchInterval: BACKGROUND_REFRESH_MS,
  })
  const me = players.find((p) => p.user_id === userId)
  if (!me) throw new Error('You are not in this game')
  return { game, players, me }
}

export function useCreateGame() {
  return useMutation({
    mutationFn: (input: { gameName: string; name: string; colour: string }) =>
      rpcParsed(
        'create_game',
        { p_game_name: input.gameName, p_player_name: input.name, p_colour: input.colour },
        CreateGameResult,
      ),
  })
}

export function useJoinGame() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { code: string; name: string; colour: string }) =>
      rpcParsed(
        'join_game',
        { p_code: input.code, p_name: input.name, p_colour: input.colour },
        JoinGameResult,
      ),
    onSuccess: (res) => qc.invalidateQueries({ queryKey: gameKeys.game(res.code) }),
  })
}

export function useReclaimPlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { code: string; name: string; pin: string }) =>
      rpcParsed(
        'reclaim_player',
        { p_code: input.code, p_name: input.name, p_pin: input.pin },
        ReclaimResult,
      ),
    onSuccess: (res, input) => {
      if (res.ok) void qc.invalidateQueries({ queryKey: gameKeys.game(input.code) })
    },
  })
}

/** Forgot your PIN: a fresh one, and the seat moves to this device. */
export function useResetPin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { code: string; name: string }) =>
      rpcParsed('reset_pin', { p_code: input.code, p_name: input.name }, ResetPinResult),
    onSuccess: (res) => qc.invalidateQueries({ queryKey: gameKeys.game(res.code) }),
  })
}

function useGameAction<TArgs>(gameId: string, run: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['game'] }),
        qc.invalidateQueries({ queryKey: gameKeys.players(gameId) }),
        qc.invalidateQueries({ queryKey: gameKeys.events(gameId) }),
      ])
    },
  })
}

export const useStartPicking = (gameId: string) =>
  useGameAction(gameId, () => rpc('start_picking', { p_game_id: gameId }))

export const useStartGame = (gameId: string) =>
  useGameAction(gameId, () => rpc('start_game', { p_game_id: gameId }))

export const useLeaveGame = (gameId: string) =>
  useGameAction(gameId, () => rpc('leave_game', { p_game_id: gameId }))

export const useRemovePlayer = (gameId: string) =>
  useGameAction(gameId, (playerId: string) =>
    rpc('remove_player', { p_game_id: gameId, p_player_id: playerId }),
  )
