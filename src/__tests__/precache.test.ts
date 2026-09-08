import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { cacheVersion, filesIn, injectPrecache, precacheList } from '../../build/precache.ts'

/**
 * The list of what an installed app downloads.
 *
 * It is generated from the built site because it cannot be written by hand:
 * the bundle's filename carries a content hash. The failure this guards
 * against is silent — a worker that installs, caches a handful of files, and
 * leaves the app broken the first time somebody opens it on a train.
 */

/** A throwaway build output: a page, a hashed bundle, some art, a worker. */
const site = (over: Record<string, string> = {}): string => {
  const dir = mkdtempSync(join(tmpdir(), 'precache-'))
  const files: Record<string, string> = {
    'index.html': '<!doctype html><title>x</title>',
    'assets/main-A1b2C3.js': 'console.log(1)',
    'assets/main-D4e5F6.css': 'body{}',
    'crew/crew-01.webp': 'not really a webp',
    'sw.js': 'const C = __CACHE_VERSION__; const P = __PRECACHE__;',
    ...over,
  }
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return dir
}

test('every file in the built site is found, nested ones included', () => {
  const dir = site()
  assert.deepEqual(filesIn(dir), [
    'assets/main-A1b2C3.js',
    'assets/main-D4e5F6.css',
    'crew/crew-01.webp',
    'index.html',
    'sw.js',
  ])
  rmSync(dir, { recursive: true })
})

test('the precache list is the whole site, relative, minus the worker itself', () => {
  const dir = site()
  const list = precacheList(dir)
  assert.ok(list.includes('./'), 'the start page, which is what a navigation asks for')
  assert.ok(list.includes('./index.html'))
  assert.ok(list.includes('./assets/main-A1b2C3.js'), 'the hashed bundle')
  assert.ok(list.includes('./crew/crew-01.webp'), 'and the art')
  assert.ok(!list.some((u) => u.endsWith('sw.js')), 'the worker does not cache itself')
  assert.ok(
    list.every((u) => u.startsWith('./')),
    'relative, so they resolve under any base path',
  )
  rmSync(dir, { recursive: true })
})

test('the cache name changes when the content does, and only then', () => {
  const a = site()
  const b = site()
  assert.equal(cacheVersion(a), cacheVersion(b), 'same content, same name')

  writeFileSync(join(b, 'index.html'), '<!doctype html><title>different</title>')
  assert.notEqual(cacheVersion(a), cacheVersion(b), 'changed content, new name')

  // The worker is excluded, or injecting the name would change the name.
  const c = site()
  writeFileSync(join(c, 'sw.js'), 'const C = __CACHE_VERSION__; const P = __PRECACHE__; // more')
  assert.equal(cacheVersion(a), cacheVersion(c))
  for (const dir of [a, b, c]) rmSync(dir, { recursive: true })
})

test('injecting fills both placeholders in the built worker', () => {
  const dir = site()
  const { files, version } = injectPrecache(dir)
  const out = readFileSync(join(dir, 'sw.js'), 'utf8')
  assert.ok(!out.includes('__PRECACHE__') && !out.includes('__CACHE_VERSION__'), 'nothing left')
  assert.equal(files, 5, 'four files plus the start page')
  assert.match(out, /"\.\/assets\/main-A1b2C3\.js"/, 'the bundle is in the list')
  assert.ok(out.includes(JSON.stringify(version)), 'and the cache name is a string')
  // What it wrote has to be valid JavaScript, not just the right text.
  const list = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1))
  assert.equal(list.length, 5)
  rmSync(dir, { recursive: true })
})

test('a worker with no placeholders stops the build rather than shipping empty', () => {
  const dir = site({ 'sw.js': 'const CACHE = "spaceport99-v1"' })
  assert.throws(() => injectPrecache(dir), /would not run offline|no __PRECACHE__/)
  rmSync(dir, { recursive: true })
})
