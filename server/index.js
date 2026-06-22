// Steam Tasting backend: Steam OpenID login + Steam Web API proxy.
//
// Why a backend at all? Two hard requirements that a static site can't meet:
//   1. The Steam Web API has no CORS headers, so the browser can't call it.
//   2. The Steam Web API key must stay secret (server-side only).
// OpenID login also needs a server-side callback to verify the assertion.
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import express from 'express'
import { buildLoginUrl, verifyAssertion, getPlayerSummary, getOwnedGames } from './steam.js'
import { COOKIE_NAME, createSession, readSession, cookieOptions } from './session.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const {
  STEAM_API_KEY,
  SESSION_SECRET,
  PORT = '8787',
  // Externally reachable base URL of THIS server (used to build the OpenID
  // realm + return_to). In dev with the Vite proxy this is the Vite origin.
  PUBLIC_URL = 'http://localhost:5173',
  // Where to send the user after a successful login.
  FRONTEND_URL = '/',
} = process.env

if (!STEAM_API_KEY) {
  console.error('FATAL: STEAM_API_KEY is not set. Copy .env.example to .env and fill it in.')
  process.exit(1)
}
if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  console.error('FATAL: SESSION_SECRET must be set to a long random string (>= 16 chars).')
  process.exit(1)
}

const isSecure = PUBLIC_URL.startsWith('https://')
const app = express()
app.set('trust proxy', 1) // honor X-Forwarded-* when behind a reverse proxy

// --- tiny cookie reader (avoids an extra dependency) ---
function getCookie(req, name) {
  const raw = req.headers.cookie
  if (!raw) return null
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}
function currentUser(req) {
  return readSession(getCookie(req, COOKIE_NAME), SESSION_SECRET)
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// 1) Kick off login: redirect the browser to Steam.
app.get('/api/auth/steam/login', (_req, res) => {
  const returnTo = `${PUBLIC_URL}/api/auth/steam/return`
  res.redirect(buildLoginUrl(PUBLIC_URL, returnTo))
})

// 2) Steam redirects back here; verify, then set the session cookie.
app.get('/api/auth/steam/return', async (req, res) => {
  try {
    const steamid = await verifyAssertion(req.query)
    if (!steamid) return res.status(401).send('Steam login verification failed.')
    const token = createSession({ steamid }, SESSION_SECRET)
    res.cookie(COOKIE_NAME, token, cookieOptions(isSecure))
    res.redirect(FRONTEND_URL)
  } catch (e) {
    console.error('auth/return error:', e)
    res.status(500).send('Login error.')
  }
})

// 3) Who am I + my games (or 401 if not logged in).
app.get('/api/me', async (req, res) => {
  const user = currentUser(req)
  if (!user) return res.status(401).json({ error: 'not_authenticated' })
  try {
    const [profile, games] = await Promise.all([
      getPlayerSummary(STEAM_API_KEY, user.steamid),
      getOwnedGames(STEAM_API_KEY, user.steamid),
    ])
    res.json({ profile, games, gamesPrivate: games.length === 0 })
  } catch (e) {
    console.error('/api/me error:', e)
    res.status(502).json({ error: 'steam_api_failed', message: String(e.message || e) })
  }
})

app.post('/api/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions(isSecure))
  res.json({ ok: true })
})

// --- serve the built frontend in production (single-origin = no CORS) ---
const distDir = path.resolve(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

app.listen(Number(PORT), () => {
  console.log(`steam-tasting backend on http://localhost:${PORT}  (public: ${PUBLIC_URL})`)
})
