import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { toGameError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { GameStatus } from './schemas'

/** One of your seats, with the game it's in. RLS only returns games you belong to. */
export const MySeatSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  colour: z.string(),
  status: z.enum(['alive', 'dead']),
  // Your own stats row is always visible to you.
  player_stats: z.object({ kills_count: z.number().int() }).nullable(),
  games: z.object({
    code: z.string(),
    name: z.string(),
    status: GameStatus,
    winner_player_id: z.uuid().nullable(),
    created_at: z.string(),
  }),
})
export type MySeat = z.infer<typeof MySeatSchema>

export interface MyGame {
  code: string
  gameName: string
  playerName: string
  colour: string
  finished: boolean
  dead: boolean
  /** One line saying where you stand, e.g. "Alive · 2 kills". */
  summary: string
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function summarise(seat: MySeat): string {
  const kills = plural(seat.player_stats?.kills_count ?? 0, 'kill')
  switch (seat.games.status) {
    case 'lobby':
      return 'Waiting to start'
    case 'picking':
      return 'Picking cards'
    case 'active':
      return seat.status === 'alive' ? `Alive · ${kills}` : `You're out · ${kills}`
    case 'finished':
      return seat.games.winner_player_id === seat.id ? `You won · ${kills}` : `Finished · ${kills}`
  }
}

/** Games still going first (newest first), then finished ones. */
export function toMyGames(seats: readonly MySeat[]): MyGame[] {
  return [...seats]
    .sort((a, b) => {
      const aDone = a.games.status === 'finished'
      const bDone = b.games.status === 'finished'
      if (aDone !== bDone) return aDone ? 1 : -1
      return b.games.created_at.localeCompare(a.games.created_at)
    })
    .map((seat) => ({
      code: seat.games.code,
      gameName: seat.games.name,
      playerName: seat.name,
      colour: seat.colour,
      finished: seat.games.status === 'finished',
      dead: seat.status === 'dead',
      summary: summarise(seat),
    }))
}

export const myGamesQuery = (userId: string) =>
  queryOptions({
    queryKey: ['my-games', userId] as const,
    queryFn: async (): Promise<MyGame[]> => {
      // players and games are linked more than once (host, winner), so name the link.
      const { data, error } = await supabase
        .from('players')
        .select(
          'id, name, colour, status, player_stats!player_stats_player_id_fkey(kills_count), games!players_game_id_fkey!inner(code, name, status, winner_player_id, created_at)',
        )
        .eq('user_id', userId)
      if (error) throw toGameError(error)
      return toMyGames(z.array(MySeatSchema).parse(data))
    },
  })
