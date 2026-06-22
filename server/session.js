// Stateless, signed session cookie (HMAC-SHA256). No database needed:
// the cookie itself carries { steamid, iat }, signed so it can't be forged.
import crypto from 'node:crypto'

export const COOKIE_NAME = 'gt_session'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url')
}

/** Build a signed token string for the given payload. */
export function createSession(payload, secret) {
  const body = { ...payload, iat: Date.now() }
  const data = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${data}.${sign(data, secret)}`
}

/** Verify a token and return its payload, or null if invalid/expired. */
export function readSession(token, secret) {
  if (!token || typeof token !== 'string') return null
  const [data, sig] = token.split('.')
  if (!data || !sig) return null

  const expected = sign(data, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'))
    if (!payload.iat || Date.now() - payload.iat > MAX_AGE_MS) return null
    return payload
  } catch {
    return null
  }
}

/** Cookie options shared by set/clear. `secure` should be true behind HTTPS. */
export function cookieOptions(secure) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: MAX_AGE_MS,
  }
}
