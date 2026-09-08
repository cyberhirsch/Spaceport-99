declare const self: ServiceWorkerGlobalScope

const CACHE = 'spaceport99-v2'

/**
 * Relative, so they resolve against wherever this worker is served from. The
 * app sits at the origin root locally and under /<repo>/ on GitHub Pages, and
 * an absolute '/' would cache the wrong page in the second case — or nothing
 * at all, which is what it did.
 */
const assets = ['./', './manifest.webmanifest', './favicon.svg', './icon-192.png']

/** The start page, as this worker's own base resolves it. */
const START = new URL('./', self.registration.scope).href

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(assets).catch(() => {
        // If any asset fails to cache, continue anyway — the app can fall back to network.
      })
    }),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    }),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response
      return fetch(event.request).catch(async () => {
        const fallback = await caches.match(START)
        return fallback || new Response('offline', { status: 503 })
      })
    }),
  )
})
