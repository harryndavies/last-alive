import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { gameKeys } from '@/features/game/keys'
import type { Player } from '@/features/game/schemas'
import { toGameError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { formatDeadline } from '@/lib/deadline'
import { copyFor, type Copy } from '@/lib/themeCopy'

export const EventSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
})
export type GameEvent = z.infer<typeof EventSchema>

const DetailsSchema = z
  .object({ details: z.record(z.string(), z.unknown()) })
  .nullable()
  .default(null)

export const eventsQuery = (gameId: string) =>
  queryOptions({
    queryKey: gameKeys.events(gameId),
    queryFn: async (): Promise<GameEvent[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('id, type, payload, created_at, event_details(details)')
        .eq('game_id', gameId)
        .order('id', { ascending: false })
        .limit(200)
      if (error) throw toGameError(error)
      // Who did it sits in event_details, which the secret feed hides from
      // living players. Merge it in where we're allowed to see it.
      return z
        .array(EventSchema.extend({ event_details: DetailsSchema }))
        .parse(data)
        .map(({ event_details, ...e }) => ({
          ...e,
          payload: { ...e.payload, ...(event_details?.details ?? {}) },
        }))
    },
  })

export type FeedTone = 'red' | 'mint' | 'yellow' | 'blue' | 'pink' | 'paper'

export interface FeedItem {
  id: number
  type: string
  icon: string
  text: string
  detail?: string
  photoPath?: string
  tone: FeedTone
  at: string
}

const str = (value: unknown, fallback = 'Someone'): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback

/** The game's theme words, and how to name a player from an event's id + name. */
export interface FeedOptions {
  copy?: Copy
  nameOf?: (id: unknown, name: unknown) => string
}

/** Turns a raw event into a line for the feed. Returns null for events we do not show. */
export function describeEvent(e: GameEvent, opts: FeedOptions = {}): FeedItem | null {
  const p = e.payload
  const copy = opts.copy ?? copyFor('classic')
  const who = (id: unknown, name: unknown) => (opts.nameOf ? opts.nameOf(id, name) : str(name))
  const base = { id: e.id, type: e.type, at: e.created_at }
  switch (e.type) {
    case 'kill_confirmed': {
      const how =
        p.resolved_by === 'auto'
          ? 'No reply in 12h, so it stands.'
          : p.resolved_by === 'host'
            ? 'Upheld by the host.'
            : undefined
      const note = typeof p.note === 'string' && p.note ? `“${p.note}”` : undefined
      const victim = who(p.victim_id, p.victim_name)
      return {
        ...base,
        icon: '✕',
        tone: 'red',
        // No killer means the secret feed is hiding it from you.
        text: `${p.killer_id || p.killer_name ? `${who(p.killer_id, p.killer_name)} ${copy.killed} ${victim}` : `${victim} ${copy.isOut}`}${p.sudden_death ? ' ⚡' : ''}`,
        detail: [note, how].filter(Boolean).join(' ') || undefined,
        photoPath: typeof p.photo_path === 'string' ? p.photo_path : undefined,
      }
    }
    case 'rumbled':
      return {
        ...base,
        icon: '🕵️',
        tone: 'pink',
        text:
          p.by_id || p.by_name
            ? `${who(p.by_id, p.by_name)} ${copy.rumbled} ${who(p.hunter_id, p.hunter_name)}`
            : `${who(p.hunter_id, p.hunter_name)} ${copy.wasRumbled}`,
        detail: 'Called out their hunter. They’re out.',
      }
    case 'player_left':
      return {
        ...base,
        icon: '↩',
        tone: 'paper',
        text: p.removed ? `${str(p.name)} was removed` : `${str(p.name)} left the game`,
      }
    case 'seat_moved':
      return { ...base, icon: '🔑', tone: 'paper', text: `${str(p.name)} moved to a new phone` }
    case 'player_joined':
      return { ...base, icon: '+', tone: 'mint', text: `${str(p.name)} joined` }
    case 'game_created':
      return { ...base, icon: '★', tone: 'yellow', text: `${str(p.name)} created the game` }
    case 'picking_started':
      return { ...base, icon: '✎', tone: 'blue', text: 'Card picking started' }
    case 'game_started':
      return {
        ...base,
        icon: '▶',
        tone: 'yellow',
        text: `The hunt is on. ${typeof p.player_count === 'number' ? p.player_count : ''} players`.trim(),
      }
    case 'host_changed':
      return { ...base, icon: '♛', tone: 'pink', text: `${str(p.name)} is now the host` }
    case 'game_finished':
      return {
        ...base,
        icon: '♛',
        tone: 'yellow',
        text:
          p.reason === 'time'
            ? `Time's up! ${str(p.winner_name)} wins with the most kills`
            : `${str(p.winner_name)} is the last one alive!`,
      }
    case 'sudden_death_started':
      return {
        ...base,
        icon: '⚡',
        tone: 'red',
        text: 'Sudden death! Anyone can get anyone now',
        detail: 'Any weapon, any place. Most kills among survivors wins at the deadline.',
      }
    case 'final_hour':
      return { ...base, icon: '⏱', tone: 'yellow', text: 'One hour left' }
    case 'time_called':
      return {
        ...base,
        icon: '⏱',
        tone: 'yellow',
        text: `${str(p.by_name)} called time`,
        detail:
          typeof p.ends_at === 'string'
            ? `The game ends ${formatDeadline(p.ends_at)}. The last 24 hours are sudden death.`
            : undefined,
      }
    case 'deadline_extended':
      return { ...base, icon: '⏱', tone: 'blue', text: 'The host extended the game' }
    default:
      return null
  }
}

const KILL_FEED_TYPES = new Set([
  'kill_confirmed',
  'rumbled',
  'player_left',
  'game_started',
  'game_finished',
  'sudden_death_started',
  'final_hour',
  'time_called',
])

/** The board's kill feed: deaths (kills and rumbles), leavers, start and finish. */
export function killFeed(events: GameEvent[], opts: FeedOptions = {}): FeedItem[] {
  return gameFeed(events, opts).filter((item) => KILL_FEED_TYPES.has(item.type))
}

/** Only what happened once the game was running. */
export function gameFeed(events: GameEvent[], opts: FeedOptions = {}): FeedItem[] {
  const startIdx = events.findIndex((e) => e.type === 'game_started')
  const relevant = startIdx === -1 ? events : events.slice(0, startIdx + 1)
  return relevant.map((e) => describeEvent(e, opts)).filter((x): x is FeedItem => x !== null)
}

export interface Standing {
  player: Player
  rank: number
  killedBy: Player | null
}

/**
 * Alive first (most kills, then name), then the dead by how long they lasted
 * (most recent death ranks higher).
 */
export function standings(players: Player[], winnerId?: string | null): Standing[] {
  const byId = new Map(players.map((p) => [p.id, p]))
  const sorted = [...players].sort((a, b) => {
    if (winnerId) {
      if (a.id === winnerId) return -1
      if (b.id === winnerId) return 1
    }
    if (a.status !== b.status) return a.status === 'alive' ? -1 : 1
    if (a.status === 'dead' && b.status === 'dead') {
      const diff = (b.died_at ?? '').localeCompare(a.died_at ?? '')
      if (diff !== 0) return diff
    }
    const kills = (b.kills_count ?? 0) - (a.kills_count ?? 0)
    if (kills !== 0) return kills
    return a.name.localeCompare(b.name)
  })
  return sorted.map((player, i) => ({
    player,
    rank: i + 1,
    killedBy: player.killed_by ? (byId.get(player.killed_by) ?? null) : null,
  }))
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/** "3d" once past a day, otherwise "5h". */
export function survivedFor(
  startedAt: string | null,
  diedAt: string | null,
  now = Date.now(),
): string {
  if (!startedAt) return '0h'
  const end = diedAt ? new Date(diedAt).getTime() : now
  const hours = Math.max(0, (end - new Date(startedAt).getTime()) / 3_600_000)
  return hours >= 24 ? `${Math.floor(hours / 24)}d` : `${Math.floor(hours)}h`
}
