import type { MeResponse } from '../types'

// Same-origin in production (Express serves the app + /api). In dev, Vite
// proxies /api to the backend, so '' works there too. Override only if the
// backend lives on a different origin (then it must send CORS + credentials).
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

/** URL that starts the Steam OpenID login (full-page redirect). */
export const steamLoginUrl = () => `${API_BASE}/api/auth/steam/login`

/** Backend endpoints that build prompts and stream content. */
export const reportUrl = () => `${API_BASE}/api/report`
export const reviseUrl = () => `${API_BASE}/api/report/revise`
export const poemUrl = () => `${API_BASE}/api/poem`

export interface SavedReport {
  content: string
  poemModern: string
  poemClassic: string
  shareId: string
  updatedAt: string
}

export interface ShareData {
  name: string
  avatar: string
  content: string
  poemModern: string
  poemClassic: string
  updatedAt: string
}

/** The logged-in user's previously saved report (shown on re-login), or null. */
export async function fetchSavedReport(): Promise<SavedReport | null> {
  const resp = await fetch(`${API_BASE}/api/report/saved`, { credentials: 'include' })
  if (!resp.ok) return null
  const body = await resp.json().catch(() => ({}))
  return body.report ?? null
}

/** Public, read-only fetch of a shared report by its share id, or null. */
export async function fetchShare(id: string): Promise<ShareData | null> {
  const resp = await fetch(`${API_BASE}/api/share/${encodeURIComponent(id)}`)
  if (!resp.ok) return null
  return resp.json()
}

/** Absolute, shareable URL for a given share id. */
export const shareLink = (id: string) => `${window.location.origin}/s/${id}`

// --- admin console (path is a secret env var; the frontend derives it from
// the URL it was opened at, so it's never hard-coded in the bundle) ---

export interface AdminUser {
  steamid: string
  name: string
  avatar: string
  shareId: string
  hasReport: boolean
  hasPoems: boolean
  updatedAt: string
}

export interface AdminGame {
  name: string
  hours: number
  last_played: string
  w2: number
}

export interface AdminDetail {
  steamid: string
  name: string
  avatar: string
  shareId: string
  report: string
  poemModern: string
  poemClassic: string
  updatedAt: string
  games: AdminGame[]
  gamesError: string
}

/** List all stored users, or null if this path isn't the admin path (404). */
export async function adminListUsers(path: string): Promise<AdminUser[] | null> {
  const resp = await fetch(`${API_BASE}/api/${encodeURIComponent(path)}/users`)
  if (!resp.ok) return null
  const body = await resp.json().catch(() => ({}))
  return body.users ?? []
}

/** One user's full detail (report + poems + live games), or null. */
export async function adminGetUser(path: string, steamid: string): Promise<AdminDetail | null> {
  const resp = await fetch(`${API_BASE}/api/${encodeURIComponent(path)}/user/${steamid}`)
  if (!resp.ok) return null
  return resp.json()
}

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
