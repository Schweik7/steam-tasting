import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path:
//   - Self-hosted (Express serves dist at root): leave VITE_BASE unset -> '/'.
//   - GitHub Pages (static, upload-mode only): set VITE_BASE=/steam-tasting/.
// Dev server proxies /api to the Node backend so the browser sees a single
// origin (keeps the session cookie and Steam OpenID return_to working).
const API_TARGET = process.env.VITE_DEV_API || 'http://localhost:8787'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? process.env.VITE_BASE || '/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } },
  },
}))
