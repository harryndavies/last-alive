// Minimal service worker: makes the app installable and lets the shell load
// offline. Game data always comes from the network (never cached), because a
// stale mission or kill status would be worse than no data.
const CACHE = 'last-alive-shell-v2'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Navigations: network first, fall back to the cached shell (SPA routes).
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')))
    return
  }

  // Hashed build assets are immutable: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone()
            void caches.open(CACHE).then((c) => c.put(request, copy))
            return res
          }),
      ),
    )
  }
})

// Push notifications sent by the send-push Edge Function.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Last Alive', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Last Alive'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      tag: data.tag || undefined,
      // A replaced notification (same tag) should still buzz.
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    }),
  )
})

// Tapping a notification opens that screen, reusing an open tab if there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
