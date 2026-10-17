import { useQuery } from '@tanstack/react-query'
import { shrinkPhoto } from '@/lib/image'
import { supabase } from '@/lib/supabase'

const BUCKET = 'kill-photos'
const URL_TTL_SECONDS = 60 * 60

/** Uploads a kill photo to <game>/<your uid>/<random>.jpg and returns its path. */
export async function uploadKillPhoto(gameId: string, userId: string, file: File): Promise<string> {
  const blob = await shrinkPhoto(file)
  const path = `${gameId}/${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error('The photo did not upload. Try again, or send the claim without it.')
  return path
}

/**
 * A short-lived URL for a photo. Storage RLS decides whether you get one: the
 * claim's killer and victim straight away, everyone in the game after confirmation.
 */
export function useKillPhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['kill-photo', path],
    enabled: !!path,
    staleTime: (URL_TTL_SECONDS - 300) * 1000,
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
