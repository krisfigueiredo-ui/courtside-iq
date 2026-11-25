"""Streak and split analysis.

Prediction streaks: the record of the model's official (pre-tip) forecasts grouped by team,
player or conference, per market, with the current streak, the longest winning and losing runs
and the last ten results. Pushes neither extend nor break a streak.

Results streaks (teams): what actually happened against the closing line this season: straight
up, against the spread and over/under. Stat streaks (players): consecutive games above the
player's season average. All figures come from settled records; nothing is simulated.
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from .dataset import market_lines
from .odds_math import profit_units
from .performance import official_predictions

MARKETS = ("moneyline", "spread", "total", "prop")


def run_stats(seq: list[str], win: str = "W", loss: str = "L") -> dict:
    """Current streak and longest runs for a chronological sequence; other symbols are skipped."""
    s = [x for x in seq if x in (win, loss)]
    cur_kind, cur_n = (s[-1], 0) if s else (None, 0)
    for x in reversed(s):
        if x != cur_kind:
            break
        cur_n += 1
    best = {win: 0, loss: 0}
    run_kind, run_n = None, 0
    for x in s:
        run_n = run_n + 1 if x == run_kind else 1
        run_kind = x
        best[x] = max(best[x], run_n)
    return dict(current=f"{cur_kind}{cur_n}" if cur_kind else None, current_kind=cur_kind, current_n=cur_n,
                longest_win=best[win], longest_loss=best[loss])


def _record(d: pd.DataFrame) -> dict:
    d = d.assign(_m=d["market"].astype(str)).sort_values(["start_time", "game_id", "_m"], kind="stable")
    res = d["result"].map({"win": "W", "loss": "L", "push": "P"}).fillna("-").tolist()
    w, l, p = res.count("W"), res.count("L"), res.count("P")
    priced = d[d["price"].notna()]
    units = float(sum(profit_units(r, int(pr)) for r, pr in zip(priced["result"], priced["price"]))) if len(priced) else None
    last = d.tail(10)
    return dict(
        n=len(d), wins=w, losses=l, pushes=p, hit_rate=w / (w + l) if w + l else None,
        units=units, roi=units / len(priced) if units is not None and len(priced) else None,
        **run_stats(res),
        last10=[dict(r=x, game_id=int(gid), date=st.isoformat(), market=mk, selection=sel, line=ln,
                     pick_team=pt, prob=float(pp) if pp == pp else None)
                for x, gid, st, mk, sel, ln, pt, pp in zip(res[-10:], last["game_id"], last["start_time"], last["market"],
                                                            last["selection"], last["line"].astype(object).where(last["line"].notna(), None),
                                                            last["selection_team"].astype(object).where(last["selection_team"].notna(), None),
                                                            last["predicted_prob"])],
    )


def _ou_split(d: pd.DataFrame) -> dict:
    t = d[d["selection"].isin(["over", "under"])]
    return {sel: dict(n=len(x), wins=int((x["result"] == "win").sum()), losses=int((x["result"] == "loss").sum()))
            for sel, x in t.groupby("selection")}


def _team_results(db: Session, league: str | None) -> dict[int, dict]:
    """Season results against the closing line per team: straight up, ATS, over/under."""
    out: dict[int, dict] = {}
    for lg in ([league] if league else ["NBA", "CBB"]):
        latest = db.scalar(select(m.Game.season).where(m.Game.league == lg).order_by(m.Game.season.desc()).limit(1))
        if latest is None:
            continue
        games = db.scalars(select(m.Game).where(m.Game.league == lg, m.Game.season == latest, m.Game.status == "final",
                                                m.Game.is_historical_sim.is_(False)).order_by(m.Game.start_time)).all()
        lead = 55 if any(g.is_demo for g in games[:5]) else 3
        lines = market_lines(db, lg, lead_minutes=lead).set_index("id")
        seqs: dict[int, dict[str, list]] = defaultdict(lambda: defaultdict(list))
        for g in games:
            if g.home_score is None or g.away_score is None:
                continue
            sp = lines["mkt_spread_home"].get(g.id) if g.id in lines.index else None
            tot = lines["mkt_total"].get(g.id) if g.id in lines.index else None
            total = g.home_score + g.away_score
            for tid, margin, line in ((g.home_team_id, g.home_score - g.away_score, sp), (g.away_team_id, g.away_score - g.home_score, -sp if sp == sp and sp is not None else None)):
                s = seqs[tid]
                s["su"].append("W" if margin > 0 else "L")
                s["date"].append(g.start_time.isoformat())
                s["game_id"].append(g.id)
                if line is not None and line == line:
                    adj = margin + line
                    s["ats"].append("C" if adj > 0 else "F" if adj < 0 else "P")
                else:
                    s["ats"].append("-")
                if tot is not None and tot == tot:
                    s["ou"].append("O" if total > tot else "U" if total < tot else "P")
                else:
                    s["ou"].append("-")
        for tid, s in seqs.items():
            out[tid] = dict(
                season=latest,
                su=dict(record=f"{s['su'].count('W')}-{s['su'].count('L')}", **run_stats(s["su"]), last10=s["su"][-10:]),
                ats=dict(record=f"{s['ats'].count('C')}-{s['ats'].count('F')}-{s['ats'].count('P')}", **run_stats(s["ats"], "C", "F"),
                         last10=s["ats"][-10:]),
                ou=dict(record=f"{s['ou'].count('O')}-{s['ou'].count('U')}-{s['ou'].count('P')}", **run_stats(s["ou"], "O", "U"),
                        last10=s["ou"][-10:]),
                games=len(s["su"]),
            )
    return out


def _player_form(db: Session) -> dict[int, dict]:
    """Current-season stat streaks: consecutive games above the player's own season average."""
    latest = db.scalar(select(m.Game.season).where(m.Game.league == "NBA").order_by(m.Game.season.desc()).limit(1))
    if latest is None:
        return {}
    q = (select(m.PlayerGameStat.player_id, m.PlayerGameStat.pts, m.PlayerGameStat.reb, m.PlayerGameStat.ast, m.PlayerGameStat.fg3m,
                m.PlayerGameStat.minutes, m.Game.start_time)
         .join(m.Game, m.Game.id == m.PlayerGameStat.game_id).where(m.Game.league == "NBA", m.Game.season == latest))
    df = pd.DataFrame(db.execute(q).all(), columns=["player_id", "pts", "reb", "ast", "fg3m", "min", "t"])
    if df.empty:
        return {}
    df["pra"] = df["pts"] + df["reb"] + df["ast"]
    out = {}
    for pid, d in df.sort_values("t").groupby("player_id"):
        if len(d) < 3:
            continue
        stats = {}
        for k in ("pts", "reb", "ast", "fg3m", "pra"):
            avg = float(d[k].mean())
            seq = ["A" if v > avg else "B" if v < avg else "E" for v in d[k]]
            stats[k] = dict(avg=avg, last=float(d[k].iloc[-1]), last5=float(d[k].tail(5).mean()), **run_stats(seq, "A", "B"),
                            last10=[float(x) for x in d[k].tail(10)])
        out[int(pid)] = dict(games=len(d), minutes=float(d["min"].mean()), stats=stats)
    return out


def streaks(db: Session, by: str = "team", league: str | None = None, market: str = "all", min_n: int = 3) -> dict:
    df = official_predictions(db, league)
    if not df.empty and market != "all":
        df = df[df["market_group"] == market] if market in MARKETS else df[df["market"] == market]
    teams = {t.id: t for t in db.scalars(select(m.Team))}
    rows: list[dict] = []
    if by == "team":
        g = df[df["market_group"] != "prop"] if not df.empty else df
        idx: dict[int, list] = defaultdict(list)
        for i, r in (g.iterrows() if not g.empty else []):
            idx[int(r["home_team_id"])].append(i)
            idx[int(r["away_team_id"])].append(i)
        results = _team_results(db, league)
        for tid in set(idx) | set(results):
            t = teams.get(tid)
            if t is None:
                continue
            d = g.loc[idx[tid]] if idx.get(tid) else g.iloc[0:0]
            row = dict(key=str(tid), team_id=tid, label=t.display_name, abbr=t.abbreviation, league=t.league,
                       conference=t.conference.short_name if t.conference else None, results=results.get(tid))
            if len(d) >= min_n:
                row["model"] = _record(d)
                row["model_by_market"] = {mk: _record(x) for mk, x in d.groupby("market_group") if len(x) >= 1}
                row["model_ou"] = _ou_split(d)
                # picks on this team (ML / spread) versus picks against it
                on = d[d["selection_team"] == t.abbreviation]
                row["picks_on_team"] = dict(n=len(on), wins=int((on["result"] == "win").sum()), losses=int((on["result"] == "loss").sum()))
            if row.get("model") or row.get("results"):
                rows.append(row)
    elif by == "player":
        form = _player_form(db) if league in (None, "NBA") else {}
        pdf = df[df["player_id"].notna()] if not df.empty else df
        players = {p.id: p for p in db.scalars(select(m.Player).where(m.Player.id.in_(set(form) | set(pdf["player_id"].dropna().astype(int)) if not pdf.empty else set(form))))}
        current = {rm.player_id: rm for rm in db.scalars(select(m.RosterMembership).where(m.RosterMembership.end_date.is_(None)))}
        by_player = dict(tuple(pdf.groupby(pdf["player_id"].astype(int)))) if not pdf.empty else {}
        for pid in set(form) | set(by_player):
            p = players.get(pid)
            if p is None:
                continue
            rm = current.get(pid)
            t = teams.get(rm.team_id) if rm else None
            row = dict(key=str(pid), player_id=pid, label=p.full_name, team_id=t.id if t else None, abbr=t.abbreviation if t else None,
                       league="NBA", conference=t.conference.short_name if t and t.conference else None, form=form.get(pid))
            d = by_player.get(pid)
            if d is not None and len(d) >= min_n:
                row["model"] = _record(d)
                row["model_by_market"] = {mk: _record(x) for mk, x in d.groupby("market")}
                row["model_ou"] = _ou_split(d)
            rows.append(row)
    elif by == "conference":
        g = df[df["league"] == "CBB"] if not df.empty else df
        idx = defaultdict(list)
        for i, r in (g.iterrows() if not g.empty else []):
            for c in {r["home_conf"], r["away_conf"]}:
                if c:
                    idx[c].append(i)
        for c, ii in idx.items():
            d = g.loc[ii]
            if len(d) >= min_n:
                rows.append(dict(key=c, label=c, league="CBB", model=_record(d),
                                 model_by_market={mk: _record(x) for mk, x in d.groupby("market_group")}, model_ou=_ou_split(d)))
    else:
        raise ValueError("by must be team|player|conference")
    rows.sort(key=lambda r: (-(r.get("model") or {}).get("n", 0), r["label"]))
    return dict(by=by, market=market, league=league, rows=rows,
                note=None if by != "player" or (not df.empty and df["player_id"].notna().any())
                else "Player prop forecasts are graded only against a sportsbook prop line. ESPN publishes none, so player rows show "
                     "stat streaks from box scores; prediction streaks appear once The Odds API is connected.")
