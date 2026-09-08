import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { injectPrecache } from './build/precache.ts'

/*
 * GitHub Pages serves a project site from https://<user>.github.io/<repo>/, so
 * the bundle needs that path prefix. The repo name comes from the Actions
 * environment rather than a hardcoded string, so renaming the repository does
 * not silently break every asset URL. Everywhere else — local dev, previews,
 * any other host — the app is served from the root.
 */
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = process.env.GITHUB_PAGES === 'true' && repo ? `/${repo}/` : '/'

// https://vite.dev/config/
/**
 * Writes the list of everything to download into the built service worker.
 * Runs after the bundle is on disk, because that is the first moment the
 * hashed filenames exist.
 */
const precache = (): Plugin => {
  let outDir = 'dist'
  return {
    name: 'spaceport-precache',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const { files, bytes, version } = injectPrecache(outDir)
      const mb = (bytes / 1024 / 1024).toFixed(2)
      console.log(`\nsw.js precaches ${files} files (${mb} MB) as spaceport99-${version}`)
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), precache()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        sw: 'src/sw.ts',
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === 'sw' ? '[name].js' : 'assets/[name]-[hash].js'
        },
      },
    },
  },
})
