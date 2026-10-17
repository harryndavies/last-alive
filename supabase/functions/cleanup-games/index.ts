// Deletes games past their retention (finished > 7 days, abandoned lobbies >
// 30 days) together with their kill photos. Photos can only be deleted through
// the Storage API, which is why this is a function and not plain SQL.
// Called daily by pg_cron (private.request_cleanup) with a shared secret.
import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'forbidden' }, 403)
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false },
    },
  )

  const { data: ids, error } = await sb.rpc('games_due_for_cleanup')
  if (error) return json({ error: error.message }, 500)
  const gameIds = (ids ?? []) as string[]
  if (gameIds.length === 0) return json({ games: 0, photos: 0 })

  const { data: paths, error: pathsError } = await sb.rpc('kill_photo_paths', {
    p_game_ids: gameIds,
  })
  if (pathsError) return json({ error: pathsError.message }, 500)
  const photos = (paths ?? []) as string[]

  for (let i = 0; i < photos.length; i += 100) {
    const { error: removeError } = await sb.storage
      .from('kill-photos')
      .remove(photos.slice(i, i + 100))
    // Stop before deleting the games, so the photos are retried tomorrow.
    if (removeError) return json({ error: removeError.message }, 500)
  }

  const { error: deleteError } = await sb.from('games').delete().in('id', gameIds)
  if (deleteError) return json({ error: deleteError.message }, 500)

  return json({ games: gameIds.length, photos: photos.length })
})
