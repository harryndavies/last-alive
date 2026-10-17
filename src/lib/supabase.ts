import { createClient, type Session } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { env } from './env'

export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'last-alive-auth' },
})

let pending: Promise<Session> | null = null

/**
 * Every visitor gets an anonymous Supabase user on first visit. The session lives in
 * localStorage, so the same device is recognised on return.
 */
export function ensureSession(): Promise<Session> {
  pending ??= (async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) return data.session
    const { data: signedIn, error } = await supabase.auth.signInAnonymously()
    if (error || !signedIn.session) {
      pending = null
      throw error ?? new Error('Could not start an anonymous session')
    }
    return signedIn.session
  })()
  return pending
}
