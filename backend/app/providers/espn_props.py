"""DraftKings player props, first-half totals and team totals from ESPN's core API.

ESPN publishes each over/under as a pair of prices with the same line but does not label which
price is the over. The line is exact, so grading over/under forecasts is exact. Prices are
assigned as follows:
  - when the two prices are close (implied probabilities within 8 points), both sides get the
    average price (the side does not change the price materially);
  - when they are lopsided, the favourite goes to the side the player's own recent game log
    clearly favours (empirical P(over) at least 12 points from 50%); otherwise the prop is skipped.
Closing lines carry no reliable timestamp; ESPN's lastUpdated is stamped after tip-off, but the
values are pre-game (they are no closer to the final stat than the opening line). They are
recorded five minutes before tip-off, opening lines 24 hours before.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from .espn_sync import CLOSE_LEAD, OPEN_LEAD, Syncer, _aware, american

log = logging.getLogger(__name__)
SOURCE = "espn"

PLAYER_MARKETS = {
    "Total Points": "pts", "Total Rebounds": "reb", "Total Assists": "ast",
    "Total 3-Point Field Goals": "fg3m", "Total Points, Rebounds, and Assists": "pra",
}
SYMMETRIC = 0.08  # implied-probability gap under which the two prices are averaged
DECISIVE = 0.12  # empirical P(over) must be this far from 50% to assign lopsided prices


def implied(a: int) -> float:
    return -a / (-a + 100) if a < 0 else 100 / (a + 100)


def to_american(p: float) -> int:
    p = min(max(p, 0.01), 0.99)
    return int(round(-100 * p / (1 - p))) if p >= 0.5 else int(round(100 * (1 - p) / p))


def side_prices(a_raw, b_raw, p_over: float | None) -> tuple[int, int] | None:
    """(over_price, under_price) for an unlabeled pair, or None when it cannot be told apart."""
    a, b = american(a_raw), american(b_raw)
    if a is None or b is None:
        return None
    ia, ib = implied(a), implied(b)
    if abs(ia - ib) < SYMMETRIC:
        avg = to_american((ia + ib) / 2)
        return avg, avg
    if p_over is None or abs(p_over - 0.5) < DECISIVE:
        return None
    fav, dog = (a, b) if ia > ib else (b, a)
    return (fav, dog) if p_over > 0.5 else (dog, fav)


def _pairs(items: list[dict], key: str) -> dict[tuple, list[dict]]:
    out: dict[tuple, list[dict]] = {}
    for it in items:
        k = (it.get(key), it.get("type"))
        out.setdefault(k, []).append(it)
    return {k: v for k, v in out.items() if len(v) == 2 and v[0].get("line") is not None}


class PropSyncer:
    def __init__(self, s: Syncer):
        self.s = s
        self.db = s.db
        self.book = s.book({"name": "DraftKings", "displayName": "DraftKings"})
        self.last: dict[tuple, tuple] = {}
        for gid, pid, mk, line, op, up, ts in self.db.execute(
            select(m.PropLine.game_id, m.PropLine.player_id, m.PropLine.market, m.PropLine.line, m.PropLine.over_price,
                   m.PropLine.under_price, m.PropLine.captured_at).where(m.PropLine.source == SOURCE).order_by(m.PropLine.captured_at)):
            self.last[(gid, pid, mk)] = (line, op, up, _aware(ts))
        self._logs: pd.DataFrame | None = None

    def logs(self) -> pd.DataFrame:
        if self._logs is None:
            from ..services.modeling import player_logs

            df = player_logs(self.db, "NBA")
            if not df.empty:
                df = df.assign(pra=df["pts"] + df["reb"] + df["ast"])
            self._logs = df
        return self._logs

    def p_over(self, player_id: int, stat: str, line: float, before: datetime) -> float | None:
        df = self.logs()
        if df.empty:
            return None
        d = df[(df["player_id"] == player_id) & (df["start_time"] < pd.Timestamp(before))].sort_values("start_time").tail(30)
        if len(d) < 8:
            return None
        return float((d[stat] > line).mean())

    def _add(self, game: m.Game, player_id: int, market: str, line: float, op: int, up: int, ts: datetime, opening: bool = False) -> int:
        key = (game.id, player_id, market)
        last = self.last.get(key)
        if opening and last is not None:
            return 0  # the opening line is recorded once
        if last is not None and last[0] == line and last[1] == op and last[2] == up:
            return 0
        if last is not None and ts <= last[3]:
            ts = last[3] + timedelta(seconds=1)
        self.db.add(m.PropLine(game_id=game.id, player_id=player_id, sportsbook_id=self.book.id, market=market, line=line,
                               over_price=op, under_price=up, captured_at=ts, source=SOURCE, is_demo=False))
        self.last[key] = (line, op, up, ts)
        return 1

    def _snap(self, game: m.Game, market: str, over_oc: str, under_oc: str, line: float, price: int, ts: datetime, opening: bool = False) -> int:
        n = 0
        for oc in (over_oc, under_oc):
            key = (game.id, self.book.id, market, oc)
            last = self.s.last_odds.get(key)
            if opening and last is not None:
                continue
            if last is not None and last[0] == line and last[1] == price:
                continue
            t = ts if last is None or ts > last[2] else last[2] + timedelta(seconds=1)
            self.db.add(m.OddsSnapshot(game_id=game.id, sportsbook_id=self.book.id, market=market, outcome=oc, line=line,
                                       price_american=price, captured_at=t, source=SOURCE, is_demo=False))
            self.s.last_odds[key] = (line, price, t)
            n += 1
        return n

    def sync_game(self, game: m.Game, now: datetime) -> dict:
        eid = (game.provider_ids or {}).get("espn")
        if not eid or game.league != "NBA":
            return dict(props=0, lines=0)
        final = game.status == "final"
        try:
            items = self.s.c.prop_bets("NBA", eid, cache=final)
        except Exception as exc:  # pragma: no cover - network
            log.warning("espn props %s failed: %s", eid, exc)
            return dict(props=0, lines=0, error=str(exc))
        start = _aware(game.start_time)
        t_open = min(start - OPEN_LEAD, now)
        t_close = start - CLOSE_LEAD if (final or now >= start - CLOSE_LEAD) else now
        out = dict(props=0, lines=0, skipped=0)
        for (aid, typ), pair in _pairs([i for i in items if i.get("athlete")], "athlete").items():
            stat = PLAYER_MARKETS.get(typ)
            pl = self.s.players.get(str(aid))
            if stat is None or pl is None:
                continue
            a, b = pair
            p_over = self.p_over(pl.id, stat, float(a["line"]), start)
            close = side_prices(a.get("price"), b.get("price"), p_over)
            if close is None:
                out["skipped"] += 1
                continue
            # orientation for the opening prices follows the same items
            swap = close != (american(a.get("price")), american(b.get("price")))
            if a.get("line_open") is not None:
                oa, ob = american(a.get("price_open")), american(b.get("price_open"))
                if oa is not None and ob is not None:
                    if close[0] == close[1]:
                        o = side_prices(a.get("price_open"), b.get("price_open"), None) or (to_american((implied(oa) + implied(ob)) / 2),) * 2
                    else:
                        o = (ob, oa) if swap else (oa, ob)
                    out["props"] += self._add(game, pl.id, stat, float(a["line_open"]), o[0], o[1], t_open, opening=True)
            out["props"] += self._add(game, pl.id, stat, float(a["line"]), close[0], close[1], t_close)
        # first-half total (game level) and team totals; prices averaged when symmetric
        game_items = [i for i in items if not i.get("athlete") and not i.get("team") and i.get("type") == "1st Half Total"]
        team_items = [i for i in items if i.get("team") and i.get("type") == "Team Total Points"]
        home_eid, away_eid = (game.home_team.provider_ids or {}).get("espn"), (game.away_team.provider_ids or {}).get("espn")
        groups = [("h1_totals", "over", "under", game_items)]
        for tid, side in ((home_eid, "home"), (away_eid, "away")):
            groups.append(("team_totals", f"{side}_over", f"{side}_under", [i for i in team_items if i.get("team") == str(tid)]))
        for market, oo, uo, its in groups:
            if len(its) != 2 or its[0].get("line") is None:
                continue
            sp = side_prices(its[0].get("price"), its[1].get("price"), None)
            if sp is None or sp[0] != sp[1]:
                continue
            if its[0].get("line_open") is not None and its[0].get("price_open") is not None:
                so = side_prices(its[0].get("price_open"), its[1].get("price_open"), None)
                if so and so[0] == so[1]:
                    out["lines"] += self._snap(game, market, oo, uo, float(its[0]["line_open"]), so[0], t_open, opening=True)
            out["lines"] += self._snap(game, market, oo, uo, float(its[0]["line"]), sp[0], t_close)
        return out


def sync_props(db: Session, games: list[m.Game], s: Syncer | None = None, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    s = s or Syncer(db)
    ps = PropSyncer(s)
    tot = dict(games=0, props=0, lines=0, skipped=0)
    for g in games:
        r = ps.sync_game(g, now)
        tot["games"] += 1
        for k in ("props", "lines", "skipped"):
            tot[k] += r.get(k, 0)
        if tot["games"] % 25 == 0:
            db.commit()
    db.commit()
    return tot


def games_needing_props(db: Session, now: datetime | None = None, horizon_hours: int = 36) -> list[m.Game]:
    """Current-season NBA finals without a closing prop line yet, plus games tipping off soon."""
    now = now or datetime.now(timezone.utc)
    latest = db.scalar(select(m.Game.season).where(m.Game.league == "NBA").order_by(m.Game.season.desc()).limit(1))
    if latest is None:
        return []
    have = set(db.scalars(select(m.PropLine.game_id).where(m.PropLine.source == SOURCE).distinct()))
    finals = db.scalars(select(m.Game).where(m.Game.league == "NBA", m.Game.season == latest, m.Game.status == "final",
                                             m.Game.source == "espn")).all()
    upcoming = db.scalars(select(m.Game).where(m.Game.league == "NBA", m.Game.status == "scheduled", m.Game.start_time > now,
                                               m.Game.start_time <= now + timedelta(hours=horizon_hours))).all()
    return [g for g in finals if g.id not in have] + list(upcoming)
