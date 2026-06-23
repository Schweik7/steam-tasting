"""Steam Tasting backend (FastAPI): Steam OpenID login + Steam Web API proxy.

Why a backend at all? Two hard requirements a static site can't meet:
  1. The Steam Web API has no CORS headers, so the browser can't call it.
  2. The Steam Web API key must stay secret (server-side only).
OpenID login also needs a server-side callback to verify the assertion.

Sessions are stateless signed cookies (Starlette SessionMiddleware) — no DB
needed. Add SQLModel + SQLite only if/when we start persisting data.
"""
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import (
    FileResponse,
    JSONResponse,
    RedirectResponse,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import config, prompt, steam

config.validate()

DIST_DIR = Path(__file__).resolve().parent.parent / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # One shared client; honors PROXY_URL for networks that block Steam.
    app.state.http = httpx.AsyncClient(
        proxy=config.PROXY_URL,
        timeout=30.0,
        headers={"User-Agent": "steam-tasting/1.0"},
    )
    yield
    await app.state.http.aclose()


app = FastAPI(title="Steam Tasting", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=config.SESSION_SECRET,
    https_only=config.COOKIE_SECURE,
    same_site="lax",
    max_age=7 * 24 * 3600,
)


@app.get("/api/health")
async def health():
    return {"ok": True}


# 1) Kick off login: redirect the browser to Steam.
@app.get("/api/auth/steam/login")
async def steam_login():
    return_to = f"{config.PUBLIC_URL}/api/auth/steam/return"
    return RedirectResponse(steam.build_login_url(config.PUBLIC_URL, return_to))


# 2) Steam redirects back here; verify, then store the session.
@app.get("/api/auth/steam/return")
async def steam_return(request: Request):
    params = dict(request.query_params)
    steamid = await steam.verify_assertion(request.app.state.http, params)
    if not steamid:
        return JSONResponse({"error": "verification_failed"}, status_code=401)
    request.session["steamid"] = steamid
    return RedirectResponse(config.FRONTEND_URL)


# 3) Who am I + my games (or 401 if not logged in).
@app.get("/api/me")
async def me(request: Request):
    steamid = request.session.get("steamid")
    if not steamid:
        return JSONResponse({"error": "not_authenticated"}, status_code=401)
    client = request.app.state.http
    try:
        profile = await steam.get_player_summary(client, config.STEAM_API_KEY, steamid)
        games = await steam.get_owned_games(client, config.STEAM_API_KEY, steamid)
    except httpx.HTTPError as e:
        return JSONResponse(
            {"error": "steam_api_failed", "message": str(e)}, status_code=502
        )
    return {"profile": profile, "games": games, "gamesPrivate": len(games) == 0}


@app.post("/api/logout")
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}


# Validate an invite code server-side (the accepted value lives only in config,
# never shipped to the browser). A valid code lets the user generate a report
# with the developer's own LLM instead of bringing their own API key.
@app.post("/api/invite")
async def invite(request: Request):
    payload = await request.json()
    return {"valid": config.magic_ok(payload.get("code", ""))}


# 4) Generate the tasting report. The system/user prompt is built server-side
# (see prompt.py); the LLM call is proxied so the browser never hits the LLM
# directly (no CORS headaches) and can also benefit from PROXY_URL.
@app.post("/api/report")
async def report(request: Request):
    payload = await request.json()
    client = request.app.state.http

    games = payload.get("games")
    if not games:
        steamid = request.session.get("steamid")
        if not steamid:
            return JSONResponse({"error": "no_games"}, status_code=400)
        raw = await steam.get_owned_games(client, config.STEAM_API_KEY, steamid)
        games = [
            {
                "name": g["name"],
                "hours": g["playtime_hours"],
                "last_played": g["last_played"],
                "w2": g["playtime_2weeks_min"],
            }
            for g in raw
        ]

    # MagicVal unlocks the developer's own LLM, so the user needn't bring one.
    if config.magic_ok(payload.get("magicVal", "")):
        base = config.LLM_API_BASE.strip().rstrip("/")
        model = config.LLM_MODEL.strip()
        key = config.LLM_API_KEY.strip()
        if not base or not model or not key:
            return JSONResponse({"error": "server_llm_unconfigured"}, status_code=503)
    else:
        base = (payload.get("base") or "").strip().rstrip("/")
        model = (payload.get("model") or "").strip()
        key = (payload.get("key") or "").strip()
        if not base or not model or not key:
            return JSONResponse({"error": "missing_llm_settings"}, status_code=400)
    url = base if base.endswith("/chat/completions") else base + "/chat/completions"

    body = {
        "model": model,
        "temperature": payload.get("temp") or 0.8,
        "stream": True,
        "messages": [
            {"role": "system", "content": prompt.SYSTEM_PROMPT},
            {"role": "user", "content": prompt.build_user_message(games, payload)},
        ],
    }

    req = client.build_request(
        "POST",
        url,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=body,
    )
    upstream = await client.send(req, stream=True)
    if upstream.status_code != 200:
        detail = (await upstream.aread()).decode(errors="ignore")[:300]
        await upstream.aclose()
        return JSONResponse(
            {"error": "llm_failed", "message": f"HTTP {upstream.status_code} {detail}"},
            status_code=502,
        )

    async def relay():
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            await upstream.aclose()

    return StreamingResponse(relay(), media_type="text/event-stream")


# --- serve the built frontend in production (single origin = no CORS) ---
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"error": "not_found"}, status_code=404)
        return FileResponse(DIST_DIR / "index.html")
