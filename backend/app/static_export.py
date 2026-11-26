"""Static preview export: renders every API response the web app needs into JSON files so the
frontend can be built as a static site (GitHub Pages) with no running backend.

    python -m app.cli bootstrap
    python -m app.cli export-static --out ../frontend/public/data

File names follow `static_key`, which must stay identical to `staticKey` in frontend/lib/api.ts.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qsl

from sqlalchemy import select

from . import models as m

log = logging.getLogger(__name__)

GAME_WINDOW_DAYS = 3


def static_key(path: str) -> str:
    p, _, q = path.removeprefix("/api/").partition("?")
    params = parse_qsl(q, keep_blank_values=True)
    if re.fullmatch(r"games/\d+", p):
        params = [kv for kv in params if kv[0] != "n_sims"]
    if re.fullmatch(r"simulate/\d+", p):
        params = [kv for kv in params if kv[0] != "n"]
    qs = "&".join(f"{k}={v}" for k, v in sorted(params, key=lambda kv: kv[0]))
    return re.sub(r"[^A-Za-z0-9._-]", "_", p + (f"?{qs}" if qs else "")) + ".json"


def _leagues(path: str, sep: str = "?") -> list[str]:
    return [path, f"{path}{sep}league=NBA", f"{path}{sep}league=CBB"]


def static_paths() -> list[str]:
    paths = ["/api/status", "/api/conferences", "/api/teams", "/api/teams?league=NBA", "/api/teams?league=CBB",
             "/api/players", "/api/players?league=NBA", "/api/games?days=3", "/api/games?league=NBA&days=2",
             "/api/games?league=CBB&days=2", "/api/models", "/api/data/imports", "/api/data/quality", "/api/assets",
             "/api/picks", "/api/ai/status", "/api/ai/search?q=model methodology&k=6",
             "/api/props?league=NBA", "/api/props?league=NBA&hours=30"]
    paths += _leagues("/api/ticker") + _leagues("/api/board")
    for hours in (6, 40):
        paths += _leagues(f"/api/board?hours={hours}", "&")
    for p in ("/api/performance/summary", "/api/performance/clv", "/api/diagnostics", "/api/performance/residuals"):
        paths += _leagues(p)
    for by in ("market", "team", "player", "conference"):
        paths += _leagues(f"/api/performance/breakdown?by={by}", "&")
    for by in ("team", "player", "conference"):
        for mk in ("all", "moneyline", "spread", "total"):
            paths += _leagues(f"/api/performance/streaks?by={by}&market={mk}", "&")
    paths += _leagues("/api/predictions?limit=60&settled=true&games_only=true", "&")
    paths += _leagues("/api/predictions?limit=1500", "&")
    for lg in ("NBA", "CBB"):
        paths += [f"/api/trends/league/{lg}", f"/api/trends/correlations/{lg}"]
        for name in ("game", "props"):
            paths.append(f"/api/models/compare?league={lg}&name={name}")
    return paths


def export(out_dir: Path | str, window_days: int = GAME_WINDOW_DAYS) -> dict:
    """Write all responses to `out_dir`. Requires a bootstrapped database (models trained)."""
    from fastapi.testclient import TestClient

    from . import main
    from .db import SessionLocal

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    main.bootstrap = lambda: {}  # the database is already prepared; do not re-run startup work
    written, failed = 0, []

    def save(client, path: str):
        nonlocal written
        r = client.get(path)
        if r.status_code != 200:
            failed.append((path, r.status_code))
            return None
        (out / static_key(path)).write_bytes(r.content)
        written += 1
        return r.json()

    with TestClient(main.app) as client, SessionLocal() as db:
        for p in static_paths():
            save(client, p)
        now = datetime.now(timezone.utc)
        games = db.scalars(select(m.Game.id).where(m.Game.is_historical_sim.is_(False),
                                                   m.Game.start_time >= now - timedelta(days=window_days),
                                                   m.Game.start_time <= now + timedelta(days=window_days))).all()
        game_ids = set(games)
        teams = db.scalars(select(m.Team.id)).all()
        # players on a current roster (the pages the site links to)
        players = sorted(set(db.scalars(select(m.RosterMembership.player_id).where(m.RosterMembership.end_date.is_(None)))))
        for tid in teams:
            detail = save(client, f"/api/teams/{tid}")
            save(client, f"/api/trends/team/{tid}")
            # every game a team page links to must exist in the preview
            game_ids |= {g["id"] for g in (detail or {}).get("upcoming", [])}
        for pid in players:
            detail = save(client, f"/api/players/{pid}")
            if (detail or {}).get("next_game"):
                game_ids.add(detail["next_game"]["id"])
            save(client, f"/api/trends/player/{pid}")
            save(client, f"/api/predictions?player_id={pid}&limit=300&settled=true")
        for gid in sorted(game_ids):
            save(client, f"/api/games/{gid}?n_sims=10000")
            save(client, f"/api/games/{gid}/props")
            save(client, f"/api/odds/{gid}/movement")
            save(client, f"/api/simulate/{gid}?n=10000")
            save(client, f"/api/games/{gid}/h2h")
    index = dict(generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"), games=sorted(game_ids),
                 players=sorted(players), teams=sorted(teams), files=written, failed=[f"{p} ({c})" for p, c in failed])
    (out / "_index.json").write_text(json.dumps(index))
    if failed:
        log.warning("static export: %d requests failed: %s", len(failed), failed[:10])
    return dict(files=written, games=len(game_ids), failed=len(failed))
