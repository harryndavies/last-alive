import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { gameKeys } from './keys'

/**
 * One channel per game. Realtime applies RLS per subscriber, so the victim's
 * phone receives the new pending kill and nobody else does. We never trust the
 * payload: each change just invalidates the matching queries.
 */
export function useGameRealtime(gameId: string, code: string): void {
  const qc = useQueryClient()

  useEffect(() => {
    const filter = `game_id=eq.${gameId}`
    const invalidate = (...keys: ReadonlyArray<readonly unknown[]>) => {
      for (const queryKey of keys) void qc.invalidateQueries({ queryKey })
    }

    // A unique topic per mount: React may mount twice in dev, and reusing a topic
    // that is still being torn down can silently drop the new subscription.
    const channel = supabase
      .channel(`game:${gameId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter }, () =>
        invalidate(gameKeys.players(gameId)),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_stats', filter }, () =>
        invalidate(gameKeys.players(gameId)),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_details', filter },
        () => invalidate(gameKeys.events(gameId)),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prize_ideas', filter }, () =>
        invalidate(gameKeys.prizes(gameId)),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prize_votes', filter }, () =>
        invalidate(gameKeys.prizes(gameId)),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kills', filter }, () =>
        invalidate(gameKeys.kills(gameId), gameKeys.mission(gameId), ['kill-claim']),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kill_reactions', filter },
        () => invalidate(gameKeys.reactions(gameId)),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kill_comments', filter },
        () => invalidate(gameKeys.comments(gameId)),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter }, () =>
        invalidate(
          gameKeys.events(gameId),
          gameKeys.game(code),
          gameKeys.players(gameId),
          gameKeys.mission(gameId),
          gameKeys.missionHistory(gameId),
          gameKeys.kills(gameId),
        ),
      )
      .subscribe((status) => {
        // After a reconnect we may have missed changes: refetch everything.
        if (status === 'SUBSCRIBED') {
          invalidate(gameKeys.game(code), gameKeys.players(gameId), gameKeys.kills(gameId))
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameId, code, qc])
}
