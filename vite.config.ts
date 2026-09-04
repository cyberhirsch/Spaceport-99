import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
export default defineConfig({
  base,
  plugins: [react()],
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
