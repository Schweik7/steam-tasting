import type { MeResponse } from '../types'

// Same-origin in production (Express serves the app + /api). In dev, Vite
// proxies /api to the backend, so '' works there too. Override only if the
// backend lives on a different origin (then it must send CORS + credentials).
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

/** URL that starts the Steam OpenID login (full-page redirect). */
export const steamLoginUrl = () => `${API_BASE}/api/auth/steam/login`

/** Backend endpoint that builds the prompt and streams the report. */
export const reportUrl = () => `${API_BASE}/api/report`

/** Fetch the logged-in user + their games, or null if not authenticated. */
export async function fetchMe(): Promise<MeResponse | null> {
  const resp = await fetch(`${API_BASE}/api/me`, { credentials: 'include' })
  if (resp.status === 401) return null
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.message || `加载失败 (HTTP ${resp.status})`)
  }
  return resp.json()
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' })
}

/**
 * Ask the backend whether an invite code is valid. The accepted value lives
 * only in the backend config — the frontend never knows it.
 */
export async function checkInvite(code: string): Promise<boolean> {
  if (!code.trim()) return false
  try {
    const resp = await fetch(`${API_BASE}/api/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (!resp.ok) return false
    const body = await resp.json()
    return Boolean(body.valid)
  } catch {
    return false
  }
}
