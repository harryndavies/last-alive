import { z } from 'zod'
import { AVATAR_COLOURS, type AvatarColour } from './colours'
import { safeStorage } from './storage'

/**
 * Your name, colour and photo, remembered on this device so the next join is
 * one tap. The photo is a small JPEG data URL (about 20 KB).
 */
const KEY = 'last-alive:profile'

const ProfileSchema = z.object({
  name: z.string().max(20),
  colour: z.enum(AVATAR_COLOURS),
  photo: z.string().startsWith('data:image/').max(200_000).nullable(),
})
export type Profile = z.infer<typeof ProfileSchema>

export function loadProfile(): Profile | null {
  const raw = safeStorage.get(KEY)
  if (!raw) return null
  try {
    const parsed = ProfileSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveProfile(profile: Profile): void {
  safeStorage.set(KEY, JSON.stringify(profile))
}

export function defaultColour(fallback: AvatarColour): AvatarColour {
  return loadProfile()?.colour ?? fallback
}
