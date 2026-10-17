import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { gameKeys } from '@/features/game/keys'
import type { Player } from '@/features/game/schemas'
import { toGameError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export const EventSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
})
export type GameEvent = z.infer<typeof EventSchema>

export const eventsQuery = (gameId: string) =>
  queryOptions({
    queryKey: gameKeys.events(gameId),
    queryFn: async (): Promise<GameEvent[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('id, type, payload, created_at')
        .eq('game_id', gameId)
        .order('id', { ascending: false })
        .limit(200)
      if (error) throw toGameError(error)
      return z.array(EventSchema).parse(data)
    },
  })

export type FeedTone = 'red' | 'mint' | 'yellow' | 'blue' | 'pink' | 'paper'

export interface FeedItem {
  id: number
  type: string
  icon: string
  text: string
  detail?: string
  tone: FeedTone
  at: string
}

const str = (value: unknown, fallback = 'Someone'): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback

/** Turns a raw event into a line for the feed. Returns null for events we do not show. */
export function describeEvent(e: GameEvent): FeedItem | null {
  const p = e.payload
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
      return {
        ...base,
        icon: '✕',
        tone: 'red',
        text: `${str(p.killer_name)} got ${str(p.victim_name)}`,
        detail: [note, how].filter(Boolean).join(' ') || undefined,
      }
    }
    case 'player_left':
      return {
        ...base,
        icon: '↩',
        tone: 'paper',
        text: p.removed ? `${str(p.name)} was removed` : `${str(p.name)} left the game`,
      }
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
        text: `${str(p.winner_name)} is the last one alive!`,
      }
    default:
      return null
  }
}

const KILL_FEED_TYPES = new Set(['kill_confirmed', 'player_left', 'game_started', 'game_finished'])

/** The board's kill feed: deaths, leavers, start and finish. */
export function killFeed(events: GameEvent[]): FeedItem[] {
  return gameFeed(events).filter((item) => KILL_FEED_TYPES.has(item.type))
}

/** Only what happened once the game was running. */
export function gameFeed(events: GameEvent[]): FeedItem[] {
  const startIdx = events.findIndex((e) => e.type === 'game_started')
  const relevant = startIdx === -1 ? events : events.slice(0, startIdx + 1)
  return relevant.map(describeEvent).filter((x): x is FeedItem => x !== null)
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
    if (a.kills_count !== b.kills_count) return b.kills_count - a.kills_count
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
