"""Steam Tasting backend (FastAPI): Steam OpenID login + Steam Web API proxy.

Why a backend at all? Two hard requirements a static site can't meet:
  1. The Steam Web API has no CORS headers, so the browser can't call it.
  2. The Steam Web API key must stay secret (server-side only).
OpenID login also needs a server-side callback to verify the assertion.

Sessions are stateless signed cookies (Starlette SessionMiddleware) — no DB
needed. Add SQLModel + SQLite only if/when we start persisting data.
"""
import json
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

from . import config, db, prompt, steam

config.validate()

DIST_DIR = Path(__file__).resolve().parent.parent / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()  # create the SQLite schema if it doesn't exist yet
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


# --- LLM plumbing shared by /api/report, /api/report/revise, /api/poem ---


def _resolve_llm(payload: dict, pro: bool = False):
    """Pick (base, model, key). MagicVal → developer's LLM (pro model for poems);
    otherwise the user's own settings. Returns (creds, error_response)."""
    if config.magic_ok(payload.get("magicVal", "")):
        base = config.LLM_API_BASE.strip().rstrip("/")
        key = config.LLM_API_KEY.strip()
        model = (config.LLM_MODEL_PRO if pro else config.LLM_MODEL).strip()
        if not base or not model or not key:
            return None, JSONResponse({"error": "server_llm_unconfigured"}, status_code=503)
    else:
        base = (payload.get("base") or "").strip().rstrip("/")
        model = (payload.get("model") or "").strip()
        key = (payload.get("key") or "").strip()
        if not base or not model or not key:
            return None, JSONResponse({"error": "missing_llm_settings"}, status_code=400)
    return (base, model, key), None


async def _stream_llm(client, creds, messages, temp, on_complete=None):
    """Proxy an OpenAI-style streaming chat completion straight to the browser.
    If on_complete is given, the assembled assistant text is passed to it once
    the stream finishes (used to persist reports / poems)."""
    base, model, key = creds
    url = base if base.endswith("/chat/completions") else base + "/chat/completions"
    body = {"model": model, "temperature": temp, "stream": True, "messages": messages}

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
        collected: list[str] = []
        buffer = ""
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
                if on_complete is None:
                    continue
                # Sniff the SSE for assistant content so we can persist it.
                buffer += chunk.decode("utf-8", "ignore")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        continue
                    try:
                        j = json.loads(data)
                        d = (j.get("choices") or [{}])[0].get("delta", {}).get("content") or ""
                        if d:
                            collected.append(d)
                    except Exception:
                        pass
        finally:
            await upstream.aclose()
            if on_complete is not None:
                text = "".join(collected)
                if text.strip():
                    try:
                        on_complete(text)
                    except Exception:
                        pass

    return StreamingResponse(relay(), media_type="text/event-stream")


# 4) Generate the game-career report. The prompt is built server-side
# (see prompt.py); the LLM call is proxied so the browser never hits the LLM
# directly. Logged-in users get their finished report persisted by SteamID.
@app.post("/api/report")
async def report(request: Request):
    payload = await request.json()
    client = request.app.state.http
    steamid = request.session.get("steamid")

    games = payload.get("games")
    if not games:
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

    creds, err = _resolve_llm(payload)
    if err:
        return err

    messages = [
        {"role": "system", "content": prompt.SYSTEM_PROMPT},
        {"role": "user", "content": prompt.build_user_message(games, payload)},
    ]
    on_complete = None
    if steamid:
        name = (payload.get("playerName") or "").strip()
        avatar = (payload.get("playerAvatar") or "").strip()
        on_complete = lambda text: db.save_report(steamid, text, name, avatar)  # noqa: E731
    return await _stream_llm(client, creds, messages, payload.get("temp") or 0.8, on_complete)


# 5) Refine the report: take the current report + the player's feedback and
# rewrite the whole thing. This is the "keep talking to it" path.
@app.post("/api/report/revise")
async def report_revise(request: Request):
    payload = await request.json()
    steamid = request.session.get("steamid")
    current = (payload.get("current") or "").strip()
    instruction = (payload.get("instruction") or "").strip()[:140]
    if not current or not instruction:
        return JSONResponse({"error": "missing_input"}, status_code=400)

    creds, err = _resolve_llm(payload)
    if err:
        return err

    messages = [
        {"role": "system", "content": prompt.SYSTEM_PROMPT},
        {"role": "assistant", "content": current},
        {
            "role": "user",
            "content": (
                f"以上是你之前为我写的游戏生涯报告。我的修改意见(≤140字):{instruction}\n"
                "请据此**重写整篇报告**,保持同样的结构、真实性与文风,直接输出新的完整报告,不要解释改动。"
            ),
        },
    ]
    on_complete = (lambda text: db.save_report(steamid, text)) if steamid else None  # noqa: E731
    return await _stream_llm(
        request.app.state.http, creds, messages, payload.get("temp") or 0.8, on_complete
    )


# 6) Write a poem (modern or classical) from the report — a separate
# "conversation". On the MagicVal path poems use the higher-tier pro model.
@app.post("/api/poem")
async def poem(request: Request):
    payload = await request.json()
    steamid = request.session.get("steamid")
    kind = "modern" if payload.get("kind") == "modern" else "classic"
    instruction = (payload.get("instruction") or "").strip()[:140]

    report_md = (payload.get("report") or "").strip()
    if not report_md and steamid:
        row = db.get_report(steamid)
        report_md = row.report_md if row else ""
    if not report_md:
        return JSONResponse({"error": "no_report"}, status_code=400)

    creds, err = _resolve_llm(payload, pro=True)
    if err:
        return err

    messages = [
        {"role": "system", "content": prompt.POEM_SYSTEM[kind]},
        {"role": "user", "content": prompt.poem_user_message(report_md, instruction)},
    ]
    on_complete = (lambda text: db.save_poem(steamid, kind, text)) if steamid else None  # noqa: E731
    return await _stream_llm(
        request.app.state.http, creds, messages, payload.get("temp") or 0.9, on_complete
    )


# 7) Fetch the logged-in user's saved report + poems (shown on re-login).
@app.get("/api/report/saved")
async def saved_report(request: Request):
    steamid = request.session.get("steamid")
    if not steamid:
        return JSONResponse({"error": "not_authenticated"}, status_code=401)
    row = db.get_report(steamid)
    if not row or not row.report_md:
        return {"report": None}
    return {
        "report": {
            "content": row.report_md,
            "poemModern": row.poem_modern,
            "poemClassic": row.poem_classic,
            "shareId": row.share_id,
            "updatedAt": row.updated_at.isoformat(),
        }
    }


# 8) Public, read-only view of a shared report (anyone with the link).
@app.get("/api/share/{share_id}")
async def share_view(share_id: str):
    row = db.get_by_share(share_id)
    if not row or not row.report_md:
        return JSONResponse({"error": "not_found"}, status_code=404)
    return {
        "name": row.name,
        "avatar": row.avatar,
        "content": row.report_md,
        "poemModern": row.poem_modern,
        "poemClassic": row.poem_classic,
        "updatedAt": row.updated_at.isoformat(),
    }


# --- serve the built frontend in production (single origin = no CORS) ---
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"error": "not_found"}, status_code=404)
        return FileResponse(DIST_DIR / "index.html")
