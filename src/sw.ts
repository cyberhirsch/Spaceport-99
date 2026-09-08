declare const self: ServiceWorkerGlobalScope

/**
 * Offline.
 *
 * An installed station has to work with the network off — not degrade, work.
 * So everything the app can ask for comes down while it is being installed:
 * the bundle, the stylesheet, the page, the manifest and icons, every crew
 * portrait and every piece of kit. Around 1.3 MB, once.
 *
 * Both constants below are written in at build time from the actual contents
 * of the built site, because the bundle's filename carries a content hash and
 * changes every build. See build/precache.ts, which throws if it cannot find
 * them rather than letting a worker ship that caches nothing.
 */
declare const __PRECACHE__: string[]
declare const __CACHE_VERSION__: string

const CACHE = `spaceport99-${__CACHE_VERSION__}`

/** The start page, as this worker's own scope resolves it. */
const START = new URL('./', self.registration.scope).href

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // One at a time rather than addAll, which discards the entire install if
      // a single file 404s. A missing portrait is not worth losing offline
      // play over, and the fetch handler picks up anything left behind.
      await Promise.all(__PRECACHE__.map((url) => cache.add(url).catch(() => undefined)))
    }),
  )
  // Take over as soon as the download finishes rather than waiting for every
  // tab to close — a station left open for days would never see a new build.
  self.skipWaiting()
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event: FetchEvent) => {
  const request = event.request
  if (request.method !== 'GET') return
  // Somebody else's server is their business.
  if (new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit
      return fetch(request)
        .then((response) => {
          // Anything the precache missed joins it, so a second visit has it.
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(async () => {
          // Offline and not in the cache. A navigation still gets the app.
          if (request.mode === 'navigate') {
            const start = await caches.match(START)
            if (start) return start
          }
          return new Response('offline', { status: 503, statusText: 'Offline' })
        })
    }),
  )
})
