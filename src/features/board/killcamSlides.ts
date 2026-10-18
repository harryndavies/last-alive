import type { Game, Player } from '@/features/game/schemas'
import type { GameEvent } from './feed'

export interface Who {
  id: string | null
  name: string
  colour: string
  photo: string | null
}

export type Slide =
  | { kind: 'intro'; key: string; gameName: string; kills: number; players: number }
  | {
      kind: 'kill'
      key: string
      number: number
      killer: Who
      victim: Who
      photoPath: string | null
      weapon: string | null
      place: string | null
      phrase: string | null
      note: string | null
      resolvedBy: string | null
      at: string
    }
  | { kind: 'winner'; key: string; winner: Who | null; kills: number }

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

function who(players: Map<string, Player>, id: unknown, name: unknown): Who {
  const player = typeof id === 'string' ? players.get(id) : undefined
  return {
    id: player?.id ?? (typeof id === 'string' ? id : null),
    name: player?.name ?? text(name) ?? 'Someone',
    colour: player?.colour ?? 'paper',
    photo: player?.avatar_path ?? null,
  }
}

/**
 * The replay, in the order things happened: an intro, one slide per confirmed
 * kill, and the winner once the game is over. Events arrive newest first.
 */
export function buildKillCam(events: GameEvent[], players: Player[], game: Game): Slide[] {
  const byId = new Map(players.map((p) => [p.id, p]))
  const kills = events
    .filter((e) => e.type === 'kill_confirmed')
    .sort((a, b) => a.id - b.id)
    .map((e, i): Slide => {
      const p = e.payload
      return {
        kind: 'kill',
        key: `kill-${e.id}`,
        number: i + 1,
        killer: who(byId, p.killer_id, p.killer_name),
        victim: who(byId, p.victim_id, p.victim_name),
        photoPath: text(p.photo_path),
        weapon: text(p.weapon),
        place: text(p.place),
        phrase: text(p.phrase),
        note: text(p.note),
        resolvedBy: text(p.resolved_by),
        at: e.created_at,
      }
    })

  const slides: Slide[] = [
    {
      kind: 'intro',
      key: 'intro',
      gameName: game.name,
      kills: kills.length,
      players: players.length,
    },
    ...kills,
  ]

  if (game.status === 'finished') {
    const winner = game.winner_player_id ? byId.get(game.winner_player_id) : undefined
    slides.push({
      kind: 'winner',
      key: 'winner',
      winner: winner
        ? { id: winner.id, name: winner.name, colour: winner.colour, photo: winner.avatar_path }
        : null,
      kills: winner?.kills_count ?? 0,
    })
  }
  return slides
}

/** "Day 2 · 14:05", counted from the start of the game. */
export function whenInGame(at: string, startedAt: string | null): string {
  const time = new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (!startedAt) return time
  const day = Math.floor((new Date(at).getTime() - new Date(startedAt).getTime()) / 86_400_000) + 1
  return `Day ${Math.max(1, day)} · ${time}`
}
