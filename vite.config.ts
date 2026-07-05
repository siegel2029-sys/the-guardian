import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** תיקיית .env — תמיד ליד package.json (לא תחת src/) */
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command }) => ({
  root: projectRoot,
  envDir: projectRoot,
  plugins: [react(), tailwindcss()],
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
