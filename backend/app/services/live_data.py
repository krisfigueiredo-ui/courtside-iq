"""Prepare and refresh the real-data database (DATA_SOURCE=espn).

Startup: restore the committed real-data snapshot when the database is empty (fast start),
then bring every league up to date from ESPN: history for the configured number of
seasons on first run, otherwise only the days since the last completed game.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import get_settings
from ..data_mgmt import snapshot
from ..providers import espn_sync as E
from ..providers import sync as provider_sync

log = logging.getLogger(__name__)
SNAPSHOT_DIR = Path(__file__).resolve().parents[2] / "data" / "espn_snapshot"


def prepare(db: Session) -> dict:
    s = get_settings()
    out: dict = {}
    if not E.espn_game_count(db) and snapshot.available(SNAPSHOT_DIR):
        out["snapshot"] = snapshot.load(db, SNAPSHOT_DIR)
    syncer = E.Syncer(db)
    for league, seasons in (("NBA", s.espn_seasons_nba), ("CBB", s.espn_seasons_cbb)):
        last = E.last_synced_day(db, league)
        start = last - timedelta(days=3) if last else None
        try:
            out[league] = E.backfill(db, league, seasons=seasons, start=start, s=syncer)
        except Exception as exc:  # network trouble must not stop the API from starting
            log.exception("espn backfill %s failed", league)
            out[league] = f"error: {exc}"
    for name, fn in (("rosters", E.sync_rosters), ("injuries", E.sync_injuries)):
        try:
            out[name] = fn(db, syncer)
        except Exception as exc:
            log.exception("espn %s sync failed", name)
            out[name] = f"error: {exc}"
    try:
        from ..providers import espn_props

        out["props"] = espn_props.sync_props(db, espn_props.games_needing_props(db), syncer)
    except Exception as exc:  # the core API is optional; game lines and box scores do not depend on it
        log.exception("espn props sync failed")
        out["props"] = f"error: {exc}"
    out["pruned_registry_teams"] = E.prune_unmatched_registry(db)
    out["pregame_context"] = provider_sync.refresh_pregame_context(db)
    return out
