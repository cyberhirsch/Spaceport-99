import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * What the service worker downloads when the app is installed.
 *
 * It cannot be a hand-written list. The bundle and the stylesheet carry a
 * content hash in their names and get new ones every build, so a list written
 * in the worker's source is stale the moment anything changes — which is how
 * the worker came to precache four files and none of the app. This reads the
 * built site instead, after Vite has finished with it.
 */

/** Every file in a built site, as paths relative to its root, sorted. */
export const filesIn = (dir: string): string[] => {
  const out: string[] = []
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.push(relative(dir, full).split(sep).join('/'))
    }
  }
  walk(dir)
  return out.sort()
}

/**
 * The whole site bar the worker itself, as URLs relative to the worker's own
 * scope — so they resolve at the origin root and under /<repo>/ alike. `./` is
 * the start page: a navigation asks for the directory, not for index.html.
 */
export const precacheList = (dir: string): string[] => [
  './',
  ...filesIn(dir)
    .filter((f) => f !== 'sw.js')
    .map((f) => `./${f}`),
]

/**
 * A cache name that changes when any of the content does, so a new deployment
 * replaces the old cache rather than serving yesterday's bundle forever. The
 * worker is left out of the reckoning: its own contents depend on this.
 */
export const cacheVersion = (dir: string): string => {
  const h = createHash('sha256')
  for (const file of filesIn(dir)) {
    if (file === 'sw.js') continue
    h.update(file)
    h.update(readFileSync(join(dir, file)))
  }
  return h.digest('hex').slice(0, 12)
}

/**
 * Writes both into the built worker. Throws rather than shipping a worker that
 * caches nothing: an app that silently stops working offline is worse than a
 * build that stops.
 */
export const injectPrecache = (dir: string): { files: number; bytes: number; version: string } => {
  const swPath = join(dir, 'sw.js')
  const src = readFileSync(swPath, 'utf8')
  for (const token of ['__PRECACHE__', '__CACHE_VERSION__']) {
    if (!src.includes(token)) {
      throw new Error(
        `${swPath} has no ${token} to replace. The service worker would install with an empty cache and the app would not run offline.`,
      )
    }
  }
  const list = precacheList(dir)
  const version = cacheVersion(dir)
  writeFileSync(
    swPath,
    src
      .replace('__PRECACHE__', JSON.stringify(list))
      .replace('__CACHE_VERSION__', JSON.stringify(version)),
  )
  const bytes = filesIn(dir).reduce((n, f) => n + statSync(join(dir, f)).size, 0)
  return { files: list.length, bytes, version }
}
