const CACHE_NAME = 'aak-movies-shell-v1'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/aak-icon-192.png',
  '/icons/aak-icon-512.png',
  '/images/aak-movies-logo.png',
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('aak-movies-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()))
})

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/index.html')) || Response.error()))
    return
  }

  if (!['script', 'style', 'font', 'image'].includes(request.destination)) return
  event.respondWith(fetch(request).then(response => {
    if (response.ok && response.type === 'basic' && !response.headers.has('set-cookie')) {
      const copy = response.clone()
      void caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
    }
    return response
  }).catch(async () => (await caches.match(request)) || Response.error()))
})
