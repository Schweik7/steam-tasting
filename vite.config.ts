import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Python backend serves the built app from its root, so assets live at '/'.
// Dev server proxies /api to the backend so the browser sees a single origin
// (keeps the session cookie and Steam OpenID return_to working).
const API_TARGET = process.env.VITE_DEV_API || 'http://localhost:8787'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } },
  },
})
