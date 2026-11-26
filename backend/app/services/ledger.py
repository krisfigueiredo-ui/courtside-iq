"""Append-only ledger of live forecasts (frozen in real time before tip-off).

The static site rebuilds its database from the snapshot on every run, so forecasts made in
earlier runs would otherwise be lost and replaced by backtests. The ledger keeps them: each
run imports the ledger, freezes new forecasts, grades finished games and exports the ledger
again (the Pages workflow stores it on the `ledger` branch).

Rows are keyed by ESPN ids (event, athlete) so they survive database rebuilds, and identified by
(event, market, selection, player, created_at). Existing rows are never modified except to add
the result once the game is graded.
"""
from __future__ import annotations

import gzip
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m

log = logging.getLogger(__name__)
LEDGER_PATH = Path(__file__).resolve().parents[2] / "data" / "ledger" / "live_predictions.jsonl.gz"
FIELDS = ("created_at", "data_as_of", "league", "market", "selection", "line", "price", "prob", "value", "model_version", "details",
          "result", "actual", "settled_at")


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def _key(r: dict) -> tuple:
    return (r["event"], r["market"], r["selection"], r.get("athlete"), r["created_at"])


def read(path: Path = LEDGER_PATH) -> list[dict]:
    if not path.exists():
        return []
    with gzip.open(path, "rt") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def export(db: Session, path: Path = LEDGER_PATH) -> dict:
    """Merge the database's live forecasts into the ledger file (first write wins)."""
    existing = {_key(r): r for r in read(path)}
    games = {g.id: g for g in db.scalars(select(m.Game))}
    players = {p.id: p for p in db.scalars(select(m.Player))}
    added = updated = 0
    for p in db.scalars(select(m.Prediction)):
        d = p.details or {}
        if d.get("mode") != "live":
            continue
        g = games.get(p.game_id)
        eid = (g.provider_ids or {}).get("espn") if g else None
        if not eid:
            continue
        st = g.start_time if g.start_time.tzinfo else g.start_time.replace(tzinfo=timezone.utc)
        da = p.data_as_of if p.data_as_of.tzinfo else p.data_as_of.replace(tzinfo=timezone.utc)
        if da > st:
            continue  # only pre-game forecasts
        pl = players.get(p.player_id) if p.player_id else None
        row = dict(event=str(eid), athlete=(pl.provider_ids or {}).get("espn") if pl else None, player=pl.full_name if pl else None,
                   created_at=_iso(p.created_at), data_as_of=_iso(p.data_as_of), league=p.league, market=p.market, selection=p.selection,
                   line=p.line, price=p.price_american, prob=p.predicted_prob, value=p.predicted_value,
                   model_version=p.model_version.version if p.model_version else None, details=d, result=p.result,
                   actual=p.actual_value, settled_at=_iso(p.settled_at), start_time=_iso(g.start_time),
                   matchup=f"{g.away_team.abbreviation} @ {g.home_team.abbreviation}")
        k = _key(row)
        if k not in existing:
            existing[k] = row
            added += 1
        elif existing[k].get("result") == "pending" and row["result"] != "pending":
            existing[k].update(result=row["result"], actual=row["actual"], settled_at=row["settled_at"])
            updated += 1
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = sorted(existing.values(), key=lambda r: (r["created_at"], r["event"], r["market"], r.get("athlete") or ""))
    with open(path, "wb") as fh, gzip.GzipFile(filename="", mode="wb", fileobj=fh, mtime=0) as gz:
        for r in rows:
            gz.write((json.dumps(r, sort_keys=True, default=str) + "\n").encode())
    return dict(rows=len(rows), added=added, graded=updated)


def import_(db: Session, path: Path = LEDGER_PATH) -> dict:
    """Restore ledger rows into an empty prediction archive (before new forecasts are made)."""
    rows = read(path)
    if not rows:
        return dict(rows=0, restored=0)
    games = {}
    for g in db.scalars(select(m.Game).where(m.Game.source == "espn")):
        if (g.provider_ids or {}).get("espn"):
            games[(g.league, str(g.provider_ids["espn"]))] = g
    players = {str((p.provider_ids or {}).get("espn")): p for p in db.scalars(select(m.Player)) if (p.provider_ids or {}).get("espn")}
    versions = {v.version: v for v in db.scalars(select(m.ModelVersion))}
    seen = {(p.game_id, p.market, p.selection, p.player_id, _iso(p.created_at)) for p in db.scalars(select(m.Prediction))}
    restored = skipped = 0
    for r in rows:
        g = games.get((r["league"], r["event"]))
        pl = players.get(str(r["athlete"])) if r.get("athlete") else None
        if g is None or (r.get("athlete") and pl is None):
            skipped += 1
            continue
        mv = versions.get(r.get("model_version") or "")
        if mv is None:
            mv = m.ModelVersion(league=r["league"], name="props" if r["market"].startswith("prop_") else "game", version=r.get("model_version") or "ledger",
                                algorithm="restored from the live ledger", data_source="real", is_active=False, metrics={}, params={}, features=[])
            db.add(mv)
            db.flush()
            versions[mv.version] = mv
        k = (g.id, r["market"], r["selection"], pl.id if pl else None, r["created_at"])
        if k in seen:
            continue
        db.add(m.Prediction(created_at=datetime.fromisoformat(r["created_at"]), data_as_of=datetime.fromisoformat(r["data_as_of"]),
                            league=r["league"], game_id=g.id, player_id=pl.id if pl else None, model_version_id=mv.id, market=r["market"],
                            selection=r["selection"], line=r["line"], price_american=r["price"], predicted_prob=r["prob"],
                            predicted_value=r["value"], details=r.get("details") or {"mode": "live"}, is_demo=False,
                            result="pending"))
        seen.add(k)
        restored += 1
    db.commit()
    log.info("ledger restored %d rows (%d skipped)", restored, skipped)
    return dict(rows=len(rows), restored=restored, skipped=skipped)
