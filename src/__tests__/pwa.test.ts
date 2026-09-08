import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * The installed app.
 *
 * Everything here is one bug wearing four hats: the app is served from the
 * origin root locally and from /<repo>/ on GitHub Pages, so any URL written
 * as '/thing' points at the wrong place in the second case. An icon that
 * 404s is the expensive one — the browser then declines to install a web app
 * and drops a plain shortcut instead, which opens in a tab with the whole
 * browser interface, which is the thing the manifest existed to avoid.
 */

interface Icon {
  src: string
  sizes: string
  type: string
  purpose: string
}

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  name: string
  short_name: string
  display: string
  start_url: string
  scope: string
  icons: Icon[]
}
const html = readFileSync('index.html', 'utf8')
const worker = readFileSync('src/sw.ts', 'utf8')

test('the manifest asks for an app window, not a browser tab', () => {
  assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.name && manifest.short_name, 'named, or it cannot be installed')
})

test('every path in the manifest is relative, so it survives a base path', () => {
  const urls = [manifest.start_url, manifest.scope, ...manifest.icons.map((i: Icon) => i.src)]
  for (const url of urls) {
    assert.ok(url.startsWith('./'), `${url} is absolute and breaks under /<repo>/`)
  }
  // And they resolve where they should from either place it is served.
  for (const base of ['https://x.dev/manifest.webmanifest', 'https://x.dev/Spaceport-99/manifest.webmanifest']) {
    assert.equal(new URL(manifest.start_url, base).href, base.replace('manifest.webmanifest', ''))
  }
})

test('the icons the manifest promises are actually there', () => {
  for (const icon of manifest.icons) {
    assert.ok(existsSync(`public/${icon.src.slice(2)}`), `${icon.src} is not in public/`)
  }
  // Chrome wants 192 and 512 to offer an install; a maskable one keeps the
  // art out of the corners the launcher crops off.
  const sizes = new Set(manifest.icons.map((i: Icon) => i.sizes))
  assert.ok(sizes.has('192x192') && sizes.has('512x512'))
  assert.ok(manifest.icons.some((i: Icon) => i.purpose === 'maskable'))
  assert.ok(manifest.icons.some((i: Icon) => i.purpose === 'any'), 'and one that is not cropped')
})

test('the page links the manifest and an icon iOS will use', () => {
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest"/)
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/apple-touch-icon\.png"/)
  assert.ok(existsSync('public/apple-touch-icon.png'))
  // iOS reads this rather than the manifest to decide on a standalone window.
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/)
})

test('the service worker takes the whole site down, not a handful of files', () => {
  // The list is written in at build time; what the source must carry is the
  // placeholders for it. build/precache.ts fails the build if they are gone,
  // and precache.test.ts covers what it writes.
  assert.match(worker, /declare const __PRECACHE__: string\[\]/)
  assert.match(worker, /declare const __CACHE_VERSION__: string/)
  assert.match(worker, /cache\.add\(url\)/, 'every entry is fetched on install')
  assert.match(worker, /event\.waitUntil\(/, 'and installing waits for them')
})

test('the worker resolves everything against its own scope, never the origin root', () => {
  assert.match(worker, /new URL\('\.\/', self\.registration\.scope\)/)
  const paths = worker.match(/'\/[^']*'/g) ?? []
  assert.deepEqual(paths, [], `absolute path in the worker: ${paths.join(', ')}`)
})

test('a miss joins the cache, so nothing stays uncached after one visit', () => {
  assert.match(worker, /cache\.put\(request, copy\)/)
  // And a navigation with nothing cached still gets the app rather than a 404.
  assert.match(worker, /request\.mode === 'navigate'/)
})

test('the build wires the generator in', () => {
  const vite = readFileSync('vite.config.ts', 'utf8')
  assert.match(vite, /injectPrecache/)
  assert.match(vite, /plugins: \[react\(\), precache\(\)\]/)
})
