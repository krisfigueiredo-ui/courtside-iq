"""Model picks: what the model would bet, graded honestly.

A pick is the model's official pre-game forecast (the side it favours) with its expected value at
the posted price. The model's own EV is not trusted on its own: each pick is tiered by how past
forecasts of the same league, market group and EV size actually did.

  bet   EV >= 2% and comparable past picks (n >= 50) made money
  lean  EV > 0 but too few comparable past picks to judge (n < 50)
  pass  EV <= 0, or comparable past picks (n >= 50) lost money

The tier is stamped on a forecast when it is frozen (before tip-off) and never changed, so the
live record by tier is a forward test. Backtest forecasts (mode "backtest") are evidence only.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..ml import metrics as M
from .odds_math import expected_value, implied_prob, profit_units
from .performance import official_predictions

BUCKETS = [-10.0, 0.0, 0.02, 0.05, 0.10, 100.0]
BUCKET_LABELS = ["<0", "0-2%", "2-5%", "5-10%", "10%+"]
MIN_EVIDENCE = 50
BET_EV = 0.02
STAKE = {"bet": 1.0, "lean": 0.5, "pass": 0.0}
MARKET_LABEL = {"moneyline": "Moneyline", "spread": "Spread", "total": "Total", "h1_total": "1st-half total", "team_total": "Team total",
                "props": "Player props"}


def group_of(market: str) -> str:
    if market.startswith("prop_"):
        return "props"
    if market.startswith("team_total"):
        return "team_total"
    return market


def bucket_of(ev: float) -> str:
    return BUCKET_LABELS[int(np.searchsorted(BUCKETS, ev, side="right")) - 1]


def _ev_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = df[df["price"].notna()].copy()
    if df.empty:
        return df.assign(ev=[], grp=[], bucket=[])
    df["ev"] = [expected_value(float(p), int(pr), float(pp)) for p, pr, pp in zip(df["predicted_prob"], df["price"], df["p_push"])]
    df["grp"] = df["market"].map(group_of)
    df["bucket"] = df["ev"].map(bucket_of)
    return df


def evidence(db: Session, league: str | None = None) -> dict[tuple, dict]:
    """Graded record of past official forecasts by (league, market group, EV bucket)."""
    df = official_predictions(db, league)
    if df.empty:
        return {}
    df = _ev_frame(df)
    out = {}
    for (lg, grp, b), d in df.groupby(["league", "grp", "bucket"]):
        w, lo = int((d["result"] == "win").sum()), int((d["result"] == "loss").sum())
        units = float(sum(profit_units(r, int(pr)) for r, pr in zip(d["result"], d["price"])))
        ci = M.wilson_interval(w, w + lo)
        out[(lg, grp, b)] = dict(n=len(d), wins=w, losses=lo, pushes=int((d["result"] == "push").sum()), hit=w / max(1, w + lo),
                                 hit_ci=list(ci), units=units, roi=units / len(d) if len(d) else None)
    return out


def tier_of(league: str, market: str, ev: float, table: dict) -> tuple[str, dict | None, str]:
    grp = group_of(market)
    ev_b = table.get((league, grp, bucket_of(ev)))
    if ev <= 0:
        return "pass", ev_b, "no positive expected value at this price"
    if ev_b is None or ev_b["n"] < MIN_EVIDENCE:
        return "lean", ev_b, f"positive EV, fewer than {MIN_EVIDENCE} comparable past picks"
    if (ev_b["roi"] or 0) <= 0:
        return "pass", ev_b, "comparable past picks lost money"
    if ev < BET_EV:
        return "lean", ev_b, "comparable past picks made money, but the edge is under 2%"
    return "bet", ev_b, "positive EV and comparable past picks made money"


def stamp_tiers(db: Session, table: dict | None = None) -> int:
    """Stamp the tier on live forecasts that do not have one yet (at freeze time, never later)."""
    rows = db.scalars(select(m.Prediction).where(m.Prediction.result == "pending")).all()
    todo = [p for p in rows if (p.details or {}).get("mode") == "live" and "tier" not in (p.details or {}) and p.price_american is not None]
    if not todo:
        return 0
    table = table if table is not None else evidence(db)
    for p in todo:
        ev = expected_value(p.predicted_prob, p.price_american, float((p.details or {}).get("p_push") or 0.0))
        tier, ev_b, why = tier_of(p.league, p.market, ev, table)
        p.details = {**(p.details or {}), "tier": tier, "ev": round(ev, 4), "tier_reason": why,
                     "evidence": {k: ev_b[k] for k in ("n", "wins", "losses", "roi")} if ev_b else None}
    db.commit()
    return len(todo)


def _pick_text(r, team_names: dict) -> str:
    mk, sel, line = r["market"], r["selection"], r["line"]
    if mk == "moneyline":
        return f"{r['home'] if sel == 'home' else r['away']} to win"
    if mk == "spread":
        return f"{r['home'] if sel == 'home' else r['away']} {'+' if line > 0 else ''}{line:g}" if line != 0 else f"{r['home'] if sel == 'home' else r['away']} PK"
    stat = {"prop_pts": "points", "prop_reb": "rebounds", "prop_ast": "assists", "prop_fg3m": "threes", "prop_pra": "pts+reb+ast"}.get(mk)
    if stat:
        return f"{r['player']} {sel} {line:g} {stat}"
    what = {"total": "", "h1_total": " 1st half", "team_total_home": f" {r['home']} team total", "team_total_away": f" {r['away']} team total"}.get(mk, "")
    return f"{sel.capitalize()} {line:g}{what}"


def board(db: Session, league: str | None = None, hours: int = 36) -> dict:
    """Current picks for games tipping off within `hours`: the latest pre-game forecast per market."""
    now = datetime.now(timezone.utc)
    df = official_predictions(db, league, include_pending=True)
    out = dict(generated_at=now.isoformat(), rows=[], rules=dict(min_evidence=MIN_EVIDENCE, bet_ev=BET_EV, stake=STAKE))
    if df.empty:
        return out
    df = df[(df["result"] == "pending") & (df["start_time"] > now - timedelta(hours=3)) & (df["start_time"] <= now + timedelta(hours=hours))]
    df = _ev_frame(df)
    if df.empty:
        return out
    table = evidence(db, league)
    games = {g.id: g for g in db.scalars(select(m.Game).where(m.Game.id.in_([int(x) for x in df["game_id"].unique()])))}
    from ..api.common import game_out

    for r in df.sort_values("ev", ascending=False).to_dict("records"):
        g = games.get(int(r["game_id"]))
        if g is None or g.status != "scheduled":
            continue
        stamped = r.get("tier")
        tier, ev_b, why = tier_of(r["league"], r["market"], r["ev"], table)
        tier = stamped or tier
        out["rows"].append(dict(
            id=r["id"], game=game_out(db, g), league=r["league"], market=r["market"], group=group_of(r["market"]), selection=r["selection"],
            pick=_pick_text(r, {}), line=r["line"], price=int(r["price"]), model_prob=float(r["predicted_prob"]),
            breakeven=implied_prob(int(r["price"])), ev=float(r["ev"]), tier=tier, reason=why, stake=STAKE[tier],
            evidence=ev_b, player_id=None if pd.isna(r["player_id"]) else int(r["player_id"]), player=r["player"],
            model_version=r["model_version"], data_as_of=pd.Timestamp(r["data_as_of"]).isoformat(), mode=r["mode"],
        ))
    out["counts"] = {t: sum(1 for x in out["rows"] if x["tier"] == t) for t in ("bet", "lean", "pass")}
    return out


def live_record(db: Session, league: str | None = None) -> dict:
    """Forward record: official forecasts frozen in real time before tip-off (not backtests)."""
    df = official_predictions(db, league, include_pending=True)
    out = dict(start=None, overall=None, by_tier={}, by_market={}, daily=[], recent=[], pending=0)
    if df.empty:
        return out
    live = df[df["mode"] == "live"]
    if live.empty:
        return out
    out["start"] = pd.Timestamp(live["data_as_of"].min()).isoformat()
    out["pending"] = int((live["result"] == "pending").sum())
    graded = _ev_frame(live[live["result"].isin(["win", "loss", "push"])])
    if graded.empty:
        return out

    def block(d: pd.DataFrame, staked: bool = False) -> dict:
        w, lo, pu = int((d["result"] == "win").sum()), int((d["result"] == "loss").sum()), int((d["result"] == "push").sum())
        stake = d["tier"].map(STAKE).fillna(1.0) if staked else pd.Series(1.0, index=d.index)
        units = float(sum(profit_units(r, int(pr), st) for r, pr, st in zip(d["result"], d["price"], stake)))
        risked = float(stake.sum())
        return dict(n=len(d), wins=w, losses=lo, pushes=pu, hit=w / max(1, w + lo), units=units, roi=units / risked if risked else None)

    out["overall"] = block(graded)
    out["by_tier"] = {t: block(d, staked=True) for t, d in graded.groupby(graded["tier"].fillna("untiered"))}
    out["by_market"] = {g: block(d) for g, d in graded.groupby("grp")}
    bets = graded[graded["tier"].isin(["bet", "lean"])].sort_values("start_time")
    daily = []
    cum = 0.0
    for day, d in bets.groupby(bets["start_time"].dt.tz_convert("America/New_York").dt.date):
        b = block(d, staked=True)
        cum += b["units"]
        daily.append(dict(date=str(day), **b, cumulative_units=cum))
    out["daily"] = daily
    rec = graded.sort_values("start_time", ascending=False).head(150)
    out["recent"] = [dict(id=r["id"], game_id=int(r["game_id"]), date=pd.Timestamp(r["start_time"]).isoformat(), league=r["league"],
                          market=r["market"], pick=_pick_text(r, {}), price=int(r["price"]), model_prob=float(r["predicted_prob"]),
                          ev=float(r["ev"]), tier=r.get("tier"), result=r["result"], actual=None if pd.isna(r["actual_value"]) else float(r["actual_value"]),
                          frozen_at=pd.Timestamp(r["data_as_of"]).isoformat())
                     for r in rec.to_dict("records")]
    return out
