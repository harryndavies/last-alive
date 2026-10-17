import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { gameKeys } from '@/features/game/keys'
import { toGameError } from '@/lib/errors'
import { safeStorage } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

const CardText = z.object({ text: z.string() })

export const MissionSchema = z.object({
  id: z.uuid(),
  hunter_id: z.uuid(),
  target_id: z.uuid(),
  is_active: z.boolean(),
  inherited_from: z.uuid().nullable(),
  created_at: z.string(),
  weapon: CardText,
  place: CardText,
  phrase: CardText,
})
export type Mission = z.infer<typeof MissionSchema>

const SELECT = `id, hunter_id, target_id, is_active, inherited_from, created_at,
  weapon:cards!missions_weapon_card_id_fkey(text),
  place:cards!missions_place_card_id_fkey(text),
  phrase:cards!missions_phrase_card_id_fkey(text)`

/** Your missions, newest first. RLS only ever returns missions where you are the hunter. */
export const missionHistoryQuery = (gameId: string) =>
  queryOptions({
    queryKey: gameKeys.missionHistory(gameId),
    queryFn: async (): Promise<Mission[]> => {
      const { data, error } = await supabase
        .from('missions')
        .select(SELECT)
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
      if (error) throw toGameError(error)
      return z.array(MissionSchema).parse(data)
    },
  })

export const missionQuery = (gameId: string) =>
  queryOptions({
    queryKey: gameKeys.mission(gameId),
    queryFn: async (): Promise<Mission | null> => {
      const { data, error } = await supabase
        .from('missions')
        .select(SELECT)
        .eq('game_id', gameId)
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw toGameError(error)
      return data ? MissionSchema.parse(data) : null
    },
  })

const seenKey = (missionId: string) => `last-alive:seen-mission:${missionId}`

export function hasSeenMission(missionId: string): boolean {
  return safeStorage.get(seenKey(missionId)) === '1'
}

export function markMissionSeen(missionId: string): void {
  safeStorage.set(seenKey(missionId), '1')
}

/** Which parts of an inherited mission differ from the one it replaced. */
export function missionChanges(next: Mission, previous: Mission | undefined) {
  return {
    target: !previous || previous.target_id !== next.target_id,
    weapon: !previous || previous.weapon.text !== next.weapon.text,
    place: !previous || previous.place.text !== next.place.text,
    phrase: !previous || previous.phrase.text !== next.phrase.text,
  }
}
