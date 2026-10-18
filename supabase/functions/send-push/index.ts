// Delivers a Web Push notification to every device of the given users.
// Called by the database (private.notify_players via pg_net) with the shared
// x-cron-secret header; never by clients.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface Message {
  user_ids: string[]
  title: string
  body: string
  url: string
  tag?: string
}

interface Subscription {
  endpoint: string
  p256dh: string
  auth: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'https://last-alive-site.vercel.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'forbidden' }, 403)
  }

  const msg = (await req.json()) as Message
  if (!Array.isArray(msg.user_ids) || msg.user_ids.length === 0 || !msg.title) {
    return json({ error: 'bad request' }, 400)
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false },
    },
  )
  const { data, error } = await sb
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', msg.user_ids)
  if (error) return json({ error: error.message }, 500)

  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, tag: msg.tag })
  const gone: string[] = []
  let sent = 0
  let failed = 0

  await Promise.all(
    ((data ?? []) as Subscription[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          // Claims expire in 12 hours, so there is no point delivering later.
          { TTL: 60 * 60 * 12, urgency: 'high' },
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 404/410: the device unsubscribed or the subscription expired.
        if (status === 404 || status === 410) gone.push(s.endpoint)
        else {
          failed++
          console.error('push failed', status, (err as Error).message)
        }
      }
    }),
  )

  if (gone.length) await sb.rpc('drop_push_subscriptions', { p_endpoints: gone })
  return json({ sent, failed, removed: gone.length })
})
