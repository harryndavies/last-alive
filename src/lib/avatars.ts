import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { squarePhoto } from './image'
import { rpc } from './rpc'
import { supabase } from './supabase'

const BUCKET = 'avatars'
const URL_TTL_SECONDS = 60 * 60
const STALE_MS = (URL_TTL_SECONDS - 300) * 1000
const key = (path: string | null | undefined) => ['avatar-url', path] as const

/** Uploads a square avatar for this game and makes it yours. */
export async function uploadAvatar(gameId: string, userId: string, photo: Blob): Promise<string> {
  const blob = await squarePhoto(photo)
  const path = `${gameId}/${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error('Your photo did not upload. You can add it later from the lobby.')
  await rpc('set_avatar', { p_game_id: gameId, p_path: path })
  return path
}

export async function clearAvatar(gameId: string): Promise<void> {
  await rpc('set_avatar', { p_game_id: gameId })
}

/** A short-lived URL for one avatar (usually already warmed by usePrefetchAvatars). */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: key(path),
    enabled: !!path,
    staleTime: STALE_MS,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path ?? '', URL_TTL_SECONDS)
      if (error) throw error
      return data.signedUrl
    },
  })
}

/** Signs every avatar in the game in one request and seeds each one's cache. */
export function usePrefetchAvatars(paths: Array<string | null | undefined>) {
  const qc = useQueryClient()
  const signature = [...new Set(paths.filter((p): p is string => !!p))].sort().join('|')

  useEffect(() => {
    if (!signature) return
    // Only sign the ones not already cached and fresh.
    const batch = signature.split('|').filter((p) => {
      const state = qc.getQueryState(key(p))
      return !state?.data || Date.now() - state.dataUpdatedAt > STALE_MS
    })
    if (batch.length === 0) return
    void (async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(batch, URL_TTL_SECONDS)
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) qc.setQueryData(key(item.path), item.signedUrl)
      }
    })()
  }, [signature, qc])
}
