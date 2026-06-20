import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project is served from https://<user>.github.io/steam-tasting/ on GitHub Pages,
// so production assets need that base path; dev stays at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/steam-tasting/' : '/',
  plugins: [react()],
  server: { port: 5173, open: true },
}))
