import { z } from 'zod'

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(10),
  /** Optional: without it, push notifications are hidden. */
  VITE_VAPID_PUBLIC_KEY: z.string().min(20).optional().or(z.literal('')),
})

const parsed = EnvSchema.safeParse(import.meta.env)

if (!parsed.success) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const env = parsed.data
