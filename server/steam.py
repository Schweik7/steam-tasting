"""Steam OpenID 2.0 login + Steam Web API helpers.

OpenID gives us ONLY the user's identity (their SteamID64). To read the actual
game library / playtime we still call the Steam Web API with the developer's
server-side key. The two are complementary, not interchangeable.
"""
import re
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

OPENID_LOGIN = "https://steamcommunity.com/openid/login"
OPENID_NS = "http://specs.openid.net/auth/2.0"
OPENID_IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select"
WEB_API = "https://api.steampowered.com"

_CLAIMED_ID_RE = re.compile(r"/openid/id/(\d{17})$")
_IS_VALID_RE = re.compile(r"is_valid\s*:\s*true", re.IGNORECASE)


def build_login_url(realm: str, return_to: str) -> str:
    """URL we redirect the browser to so the user can sign in on Steam."""
    params = {
        "openid.ns": OPENID_NS,
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": realm,
        "openid.identity": OPENID_IDENTIFIER_SELECT,
        "openid.claimed_id": OPENID_IDENTIFIER_SELECT,
    }
    return f"{OPENID_LOGIN}?{urlencode(params)}"


async def verify_assertion(client: httpx.AsyncClient, query: dict[str, str]) -> str | None:
    """Verify the assertion Steam sent to our return_to URL.

    We echo all openid.* params back to Steam with mode=check_authentication;
    Steam answers ``is_valid:true`` only if it really issued them.
    Returns the SteamID64 on success, else None.
    """
    if query.get("openid.mode") != "id_res":
        return None

    data = {k: v for k, v in query.items() if k.startswith("openid.")}
    data["openid.mode"] = "check_authentication"

    resp = await client.post(OPENID_LOGIN, data=data)
    if not _IS_VALID_RE.search(resp.text):
        return None

    # claimed_id looks like https://steamcommunity.com/openid/id/7656119XXXXXXXXXX
    m = _CLAIMED_ID_RE.search(query.get("openid.claimed_id", ""))
    return m.group(1) if m else None


async def _api_get(client: httpx.AsyncClient, path: str, params: dict) -> dict:
    resp = await client.get(f"{WEB_API}{path}", params=params)
    resp.raise_for_status()
    return resp.json()


async def get_player_summary(client: httpx.AsyncClient, key: str, steamid: str) -> dict:
    """Public profile basics (display name + avatar) for the logged-in user."""
    data = await _api_get(
        client, "/ISteamUser/GetPlayerSummaries/v2/", {"key": key, "steamids": steamid}
    )
    players = data.get("response", {}).get("players", [])
    p = players[0] if players else {}
    return {
        "steamid": steamid,
        "name": p.get("personaname", ""),
        "avatar": p.get("avatarmedium") or p.get("avatar", ""),
        "profileurl": p.get("profileurl", ""),
    }


async def get_owned_games(client: httpx.AsyncClient, key: str, steamid: str) -> list[dict]:
    """Owned games + playtime, normalized to the same shape steam_export.py
    produces so the frontend can treat API data and uploaded files identically.
    Returns [] when the user's "Game details" privacy is not public.
    """
    data = await _api_get(
        client,
        "/IPlayerService/GetOwnedGames/v1/",
        {
            "key": key,
            "steamid": steamid,
            "include_appinfo": 1,
            "include_played_free_games": 1,
            "include_extended_appinfo": 1,
            "format": "json",
        },
    )
    games = data.get("response", {}).get("games", []) or []
    rows = []
    for g in games:
        minutes = g.get("playtime_forever", 0) or 0
        ts = g.get("rtime_last_played", 0) or 0
        rows.append(
            {
                "appid": g.get("appid"),
                "name": g.get("name", ""),
                "playtime_minutes": minutes,
                "playtime_hours": round(minutes / 60, 1),
                "playtime_2weeks_min": g.get("playtime_2weeks", 0) or 0,
                "last_played": (
                    datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
                    if ts
                    else ""
                ),
                "last_played_ts": ts,
            }
        )
    rows.sort(key=lambda r: r["playtime_minutes"], reverse=True)
    return rows
