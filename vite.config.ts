import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** תיקיית .env — תמיד ליד package.json (לא תחת src/) */
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: projectRoot,
  envDir: projectRoot,
  plugins: [react(), tailwindcss()],
})
