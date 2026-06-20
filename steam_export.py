#!/usr/bin/env python3
"""
Steam playtime exporter -> JSON + CSV (no external deps, stdlib only).

Usage:
    python steam_export.py --key YOUR_API_KEY --vanity tensorneverflow
    python steam_export.py --key YOUR_API_KEY --steamid 7656119...

Outputs (next to this script):
    games.json   full structured data
    games.csv    sorted by total playtime, human-readable

Requires the target account's "Game details" privacy to be PUBLIC.
"""
import argparse
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API = "https://api.steampowered.com"


def _get(path, params):
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "steam-export/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def resolve_vanity(key, vanity):
    data = _get("/ISteamUser/ResolveVanityURL/v1/",
                {"key": key, "vanityurl": vanity})
    resp = data.get("response", {})
    if resp.get("success") == 1:
        return resp["steamid"]
    raise SystemExit(f"Could not resolve vanity '{vanity}': {resp}")


def get_owned_games(key, steamid):
    data = _get("/IPlayerService/GetOwnedGames/v1/", {
        "key": key,
        "steamid": steamid,
        "include_appinfo": 1,
        "include_played_free_games": 1,
        "include_extended_appinfo": 1,
        "format": "json",
    })
    return data.get("response", {})


def fmt_ts(ts):
    if not ts:
        return ""
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True)
    ap.add_argument("--vanity")
    ap.add_argument("--steamid")
    args = ap.parse_args()

    if not args.steamid:
        if not args.vanity:
            raise SystemExit("Provide --steamid or --vanity")
        args.steamid = resolve_vanity(args.key, args.vanity)
        print(f"Resolved steamID64: {args.steamid}", file=sys.stderr)

    resp = get_owned_games(args.key, args.steamid)
    games = resp.get("games")
    if not games:
        raise SystemExit(
            "No games returned. Likely 'Game details' privacy is not Public, "
            f"or the account owns no games. Raw response: {resp}")

    rows = []
    for g in games:
        rows.append({
            "appid": g.get("appid"),
            "name": g.get("name", ""),
            "playtime_minutes": g.get("playtime_forever", 0),
            "playtime_hours": round(g.get("playtime_forever", 0) / 60, 1),
            "playtime_2weeks_min": g.get("playtime_2weeks", 0),
            "last_played": fmt_ts(g.get("rtime_last_played")),
            "last_played_ts": g.get("rtime_last_played", 0),
            "win_min": g.get("playtime_windows_forever", 0),
            "mac_min": g.get("playtime_mac_forever", 0),
            "linux_min": g.get("playtime_linux_forever", 0),
            "deck_min": g.get("playtime_deck_forever", 0),
        })

    rows.sort(key=lambda r: r["playtime_minutes"], reverse=True)

    total_min = sum(r["playtime_minutes"] for r in rows)
    played = [r for r in rows if r["playtime_minutes"] > 0]
    never = [r for r in rows if r["playtime_minutes"] == 0]

    out = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "steamid64": args.steamid,
        "summary": {
            "games_owned": len(rows),
            "games_played": len(played),
            "games_never_played": len(never),
            "total_playtime_hours": round(total_min / 60, 1),
        },
        "games": rows,
    }

    with open("games.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    with open("games.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["name", "playtime_hours", "last_played",
                    "playtime_2weeks_min", "appid"])
        for r in rows:
            w.writerow([r["name"], r["playtime_hours"], r["last_played"],
                        r["playtime_2weeks_min"], r["appid"]])

    s = out["summary"]
    print(f"OK: {s['games_owned']} owned, {s['games_played']} played, "
          f"{s['total_playtime_hours']}h total -> games.json, games.csv",
          file=sys.stderr)


if __name__ == "__main__":
    main()
