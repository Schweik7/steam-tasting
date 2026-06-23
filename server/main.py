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
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import config, steam

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


# --- serve the built frontend in production (single origin = no CORS) ---
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"error": "not_found"}, status_code=404)
        return FileResponse(DIST_DIR / "index.html")
