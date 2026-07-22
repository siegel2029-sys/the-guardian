/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** תיקיית .env — תמיד ליד package.json (לא תחת src/) */
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/**
 * Plugins resolve against top-level Vite. Cast keeps `tsc -b` green if plugin
 * packages briefly disagree on Plugin metadata shapes.
 */
const appPlugins = [react(), tailwindcss()] as PluginOption[]

export default defineConfig(({ command }) => ({
  root: projectRoot,
  envDir: projectRoot,
  plugins: appPlugins,
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: false,
  },
  build: {
    rollupOptions: {
      // Debug logs can leak clinical payload metadata to DevTools in production —
      // mark them pure so DCE strips them. console.warn / console.error are kept
      // for operational diagnostics.
      treeshake: {
        manualPureFunctions:
          command === 'build' ? ['console.log', 'console.debug', 'console.table'] : [],
      },
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](three|@react-three|postprocessing)[\\/]/.test(id)) return 'three'
          if (/[\\/]node_modules[\\/]recharts[\\/]/.test(id)) return 'charts'
          return undefined
        },
      },
    },
  },
}))
