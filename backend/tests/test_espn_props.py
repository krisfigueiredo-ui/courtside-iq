"""ESPN core-API prop mapping on a recorded (reduced) payload; no network access."""
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app import models as m
from app.db import Base
from app.providers import espn_props as P
from app.providers import espn_sync as E

FIX = Path(__file__).parent / "fixtures" / "espn"


def test_side_prices_rules():
    # close prices are averaged: the side does not change the price materially
    assert P.side_prices("-112", "-114", None) == (P.to_american((P.implied(-112) + P.implied(-114)) / 2),) * 2
    # lopsided prices need a decisive empirical P(over); otherwise the prop is skipped
    assert P.side_prices("+147", "-196", None) is None
    assert P.side_prices("+147", "-196", 0.55) is None
    assert P.side_prices("+147", "-196", 0.25) == (147, -196)  # over is the underdog
    assert P.side_prices("+147", "-196", 0.80) == (-196, 147)  # over is the favourite
    assert P.side_prices("OFF", "-110", 0.9) is None


class FakeESPN:
    def __init__(self, items):
        self.items = items

    def prop_bets(self, league, event_id, cache=False):
        return self.items


def test_sync_game_records_open_and_close_lines():
    from app.services import seed

    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng, expire_on_commit=False)()
    seed.seed_registry(db)
    items = json.loads((FIX / "nba_props.json").read_text())["items"]
    orl = next(t for t in db.scalars(select(m.Team)) if t.abbreviation == "ORL")
    det = next(t for t in db.scalars(select(m.Team)) if t.abbreviation == "DET")
    orl.provider_ids, det.provider_ids = {"espn": "19"}, {"espn": "8"}
    start = datetime(2026, 11, 25, 0, 0, tzinfo=timezone.utc)
    g = m.Game(league="NBA", season="2026-27", start_time=start, home_team_id=orl.id, away_team_id=det.id, status="final",
               source="espn", provider_ids={"espn": "401909314"}, is_demo=False, pregame_context={})
    db.add(g)
    athletes = sorted({i["athlete"] for i in items if i.get("athlete")})
    for aid in athletes:
        db.add(m.Player(league="NBA", full_name=f"Player {aid}", first_name="P", last_name=aid, provider_ids={"espn": aid}))
    db.commit()
    s = E.Syncer(db, client=FakeESPN(items))
    out = P.PropSyncer(s).sync_game(g, now=datetime(2026, 11, 26, tzinfo=timezone.utc))
    db.commit()
    assert out["props"] > 0
    rows = db.scalars(select(m.PropLine)).all()
    assert {r.market for r in rows} <= {"pts", "reb", "fg3m"}
    closes = [r for r in rows if r.captured_at.replace(tzinfo=timezone.utc) == start - E.CLOSE_LEAD]
    opens = [r for r in rows if r.captured_at.replace(tzinfo=timezone.utc) < start - E.CLOSE_LEAD]
    assert closes and opens and all(r.captured_at.replace(tzinfo=timezone.utc) < start for r in rows)
    # first-half total and team totals come through as odds snapshots
    mk = {r.market for r in db.scalars(select(m.OddsSnapshot))}
    assert "h1_totals" in mk or "team_totals" in mk
    # idempotent
    before = db.scalar(select(func.count(m.PropLine.id)))
    P.PropSyncer(E.Syncer(db, client=FakeESPN(items))).sync_game(g, now=datetime(2026, 11, 26, tzinfo=timezone.utc))
    db.commit()
    assert db.scalar(select(func.count(m.PropLine.id))) == before
