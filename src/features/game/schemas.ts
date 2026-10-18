import { z } from 'zod'
import { AVATAR_COLOURS } from '@/lib/colours'

export const GameStatus = z.enum(['lobby', 'picking', 'active', 'finished'])
export type GameStatus = z.infer<typeof GameStatus>

export const Colour = z.enum(AVATAR_COLOURS)

export const GameSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  host_player_id: z.uuid().nullable(),
  status: GameStatus,
  winner_player_id: z.uuid().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  rematch_code: z.string().nullable(),
})
export type Game = z.infer<typeof GameSchema>

export const PlayerSchema = z.object({
  id: z.uuid(),
  game_id: z.uuid(),
  user_id: z.uuid(),
  name: z.string(),
  colour: z.string(),
  is_host: z.boolean(),
  status: z.enum(['alive', 'dead']),
  cards_locked: z.boolean(),
  kills_count: z.number().int(),
  killed_by: z.uuid().nullable(),
  avatar_path: z.string().nullable(),
  died_at: z.string().nullable(),
  created_at: z.string(),
})
export type Player = z.infer<typeof PlayerSchema>

export const GamePreviewSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    status: GameStatus,
    player_count: z.number().int(),
    is_member: z.boolean(),
  })
  .nullable()
export type GamePreview = z.infer<typeof GamePreviewSchema>

export const CreateGameResult = z.object({
  game_id: z.uuid(),
  code: z.string(),
  player_id: z.uuid(),
  pin: z.string().regex(/^\d{4}$/),
})

export const JoinGameResult = z.object({
  game_id: z.uuid(),
  code: z.string(),
  player_id: z.uuid(),
  pin: z.string().nullable(),
  rejoined: z.boolean(),
})

export const ReclaimResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), game_id: z.uuid(), code: z.string(), player_id: z.uuid() }),
  z.object({
    ok: z.literal(false),
    error: z.enum(['wrong_pin', 'pin_locked']),
    attempts_left: z.number().int().optional(),
    locked_until: z.string().optional(),
  }),
])

/** Form input for creating or joining. */
export const NameForm = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(20, 'Keep it to 20 characters'),
  colour: Colour,
})

export const CodeForm = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3,8}-?[A-Z0-9]{2}$/, 'Codes look like CLUE-7Q'),
})

/** Accepts "clue7q", "CLUE-7Q", " clue-7q " and returns "CLUE-7Q". */
export function normaliseCode(input: string): string {
  const raw = input.trim().toUpperCase().replace(/\s+/g, '')
  if (raw.includes('-')) return raw
  return raw.length > 2 ? `${raw.slice(0, -2)}-${raw.slice(-2)}` : raw
}
