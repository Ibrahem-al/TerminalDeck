/* RemoteDeck service worker — install + offline shell + push notifications. */
const CACHE = 'remotedeck-v3'
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Never touch the live API, WebSocket upgrade, or proxied preview servers
  // (previews must always hit the network so assets stay fresh / HMR works).
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws' || url.pathname.startsWith('/__preview/')) return

  // App navigations: network-first, fall back to cached shell then offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((r) => r || caches.match('/offline.html')))
    )
    return
  }

  // Static assets: cache-first, then network (and cache it for next time).
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && url.origin === location.origin) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
    )
  )
})

/* ── Push notifications (task complete) ── */
self.addEventListener('push', (event) => {
  let data = { title: 'RemoteDeck', body: '', tag: 'remotedeck' }
  try {
    data = { ...data, ...event.data.json() }
  } catch {
    /* non-JSON payload */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png'
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow ? self.clients.openWindow('/') : undefined
    })
  )
})
