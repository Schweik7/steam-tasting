// Steam OpenID 2.0 login + Steam Web API helpers.
//
// OpenID gives us ONLY the user's identity (their SteamID64). To read the
// actual game library / playtime we still call the Steam Web API with the
// developer's server-side key. The two are complementary, not interchangeable.
const OPENID_LOGIN = 'https://steamcommunity.com/openid/login'
const OPENID_NS = 'http://specs.openid.net/auth/2.0'
const OPENID_IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select'
const WEB_API = 'https://api.steampowered.com'

/**
 * Build the URL we redirect the browser to so the user can sign in on Steam.
 * @param {string} realm   The site root Steam should show / trust (e.g. https://example.com)
 * @param {string} returnTo Absolute URL Steam redirects back to after login
 */
export function buildLoginUrl(realm, returnTo) {
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': OPENID_IDENTIFIER_SELECT,
    'openid.claimed_id': OPENID_IDENTIFIER_SELECT,
  })
  return `${OPENID_LOGIN}?${params.toString()}`
}

/**
 * Verify the assertion Steam sent back to our return_to URL.
 * We echo all openid.* params back to Steam with mode=check_authentication;
 * Steam answers `is_valid:true` only if it really issued them.
 * @param {Record<string,string>} query  The query params on the return request
 * @returns {Promise<string|null>} SteamID64 on success, else null
 */
export async function verifyAssertion(query) {
  if (query['openid.mode'] !== 'id_res') return null

  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('openid.')) params.append(k, String(v))
  }
  params.set('openid.mode', 'check_authentication')

  const resp = await fetch(OPENID_LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const text = await resp.text()
  if (!/is_valid\s*:\s*true/i.test(text)) return null

  // claimed_id looks like https://steamcommunity.com/openid/id/7656119XXXXXXXXXX
  const claimed = String(query['openid.claimed_id'] || '')
  const m = claimed.match(/\/openid\/id\/(\d{17})$/)
  return m ? m[1] : null
}

async function apiGet(path, params) {
  const url = `${WEB_API}${path}?${new URLSearchParams(params).toString()}`
  const resp = await fetch(url, { headers: { 'User-Agent': 'steam-tasting/1.0' } })
  if (!resp.ok) throw new Error(`Steam API ${path} -> HTTP ${resp.status}`)
  return resp.json()
}

/** Public profile basics (display name + avatar) for the logged-in user. */
export async function getPlayerSummary(key, steamid) {
  const data = await apiGet('/ISteamUser/GetPlayerSummaries/v2/', { key, steamids: steamid })
  const p = data?.response?.players?.[0] || {}
  return {
    steamid,
    name: p.personaname || '',
    avatar: p.avatarmedium || p.avatar || '',
    profileurl: p.profileurl || '',
  }
}

/**
 * Owned games + playtime, normalized to the same shape steam_export.py produces
 * so the frontend can treat API data and uploaded files identically.
 * Returns [] when the user's "Game details" privacy is not public.
 */
export async function getOwnedGames(key, steamid) {
  const data = await apiGet('/IPlayerService/GetOwnedGames/v1/', {
    key,
    steamid,
    include_appinfo: 1,
    include_played_free_games: 1,
    include_extended_appinfo: 1,
    format: 'json',
  })
  const games = data?.response?.games || []
  const rows = games.map((g) => ({
    appid: g.appid,
    name: g.name || '',
    playtime_minutes: g.playtime_forever || 0,
    playtime_hours: Math.round(((g.playtime_forever || 0) / 60) * 10) / 10,
    playtime_2weeks_min: g.playtime_2weeks || 0,
    last_played: g.rtime_last_played
      ? new Date(g.rtime_last_played * 1000).toISOString().slice(0, 10)
      : '',
    last_played_ts: g.rtime_last_played || 0,
  }))
  rows.sort((a, b) => b.playtime_minutes - a.playtime_minutes)
  return rows
}
