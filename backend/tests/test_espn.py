"""ESPN mapping tests on recorded (reduced) payloads; no network access."""
import json
from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app import models as m
from app.db import Base
from app.providers import espn_sync as E

FIX = Path(__file__).parent / "fixtures" / "espn"


def fx(name: str) -> dict:
    return json.loads((FIX / f"{name}.json").read_text())


class FakeESPN:
    requests = 0

    def scoreboard(self, league, day, cache=False):
        if league == "NBA":
            return fx("nba_scoreboard_20261124") if day == date(2026, 11, 24) else fx("nba_scoreboard_today")
        return fx("cbb_scoreboard_20261124") if day == date(2026, 11, 24) else {"events": []}

    def summary(self, league, event_id, cache=False):
        s = fx("nba_summary")
        return s if event_id == "401909314" else {"boxscore": {}, "pickcenter": []}

    def teams(self, league):
        return [t["team"] for t in fx("cbb_teams")["sports"][0]["leagues"][0]["teams"]]

    def injuries(self):
        return fx("nba_injuries")


@pytest.fixture()
def edb():
    from app.services import seed

    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    s = sessionmaker(bind=eng, expire_on_commit=False)()
    seed.seed_registry(s)
    yield s
    s.close()


NOW = datetime(2026, 11, 25, 18, 0, tzinfo=timezone.utc)


def test_scoreboard_maps_finals_box_scores_and_closing_lines(edb):
    s = E.Syncer(edb, client=FakeESPN())
    r = E.sync_day("NBA", date(2026, 11, 24), s, NOW)
    assert r["games"] == 3
    g = next(x for x in edb.scalars(select(m.Game)) if x.provider_ids.get("espn") == "401909314")
    assert g.status == "final" and not g.is_demo and g.source == "espn" and g.season == "2026-27"
    assert g.home_score is not None and g.away_score is not None and g.home_h1 is not None
    stats = edb.scalars(select(m.TeamGameStat).where(m.TeamGameStat.game_id == g.id)).all()
    assert len(stats) == 2 and all(st.possessions > 70 for st in stats)
    assert {st.points for st in stats} == {g.home_score, g.away_score}
    players = edb.scalars(select(m.PlayerGameStat).where(m.PlayerGameStat.game_id == g.id)).all()
    assert len(players) >= 16 and sum(p.pts for p in players) == g.home_score + g.away_score
    snaps = edb.scalars(select(m.OddsSnapshot).where(m.OddsSnapshot.game_id == g.id)).all()
    close = [o for o in snaps if o.market == "spreads" and o.outcome == "home"]
    assert close and all(o.captured_at.replace(tzinfo=timezone.utc) < g.start_time.replace(tzinfo=timezone.utc) for o in snaps)
    # idempotent: a second pass adds nothing
    before = edb.scalar(select(func.count(m.OddsSnapshot.id)))
    E.sync_day("NBA", date(2026, 11, 24), E.Syncer(edb, client=FakeESPN()), NOW)
    assert edb.scalar(select(func.count(m.OddsSnapshot.id))) == before
    assert edb.scalar(select(func.count(m.Game.id))) == 3


def test_upcoming_games_get_open_and_current_lines(edb):
    s = E.Syncer(edb, client=FakeESPN())
    E.sync_day("NBA", date(2026, 11, 25), s, NOW)
    g = next(x for x in edb.scalars(select(m.Game)) if x.status == "scheduled")
    snaps = edb.scalars(select(m.OddsSnapshot).where(m.OddsSnapshot.game_id == g.id, m.OddsSnapshot.market == "totals",
                                                     m.OddsSnapshot.outcome == "over")).all()
    assert 1 <= len(snaps) <= 2 and all(o.line > 150 for o in snaps)
    assert edb.scalar(select(func.count(m.Asset.id)).where(m.Asset.entity_type == "team", m.Asset.source == "espn")) >= 4


def test_college_games_only_between_division_i_teams(edb):
    s = E.Syncer(edb, client=FakeESPN())
    r = E.sync_day("CBB", date(2026, 11, 24), s, NOW, summaries=False)
    d1 = s.d1_ids()
    for g in edb.scalars(select(m.Game).where(m.Game.league == "CBB")):
        assert g.home_team.provider_ids["espn"] in d1 and g.away_team.provider_ids["espn"] in d1
        assert g.home_team.conference is not None
    assert r["games"] == edb.scalar(select(func.count(m.Game.id)).where(m.Game.league == "CBB"))


def test_injuries_are_recorded_and_cleared(edb):
    s = E.Syncer(edb, client=FakeESPN())
    out = E.sync_injuries(edb, s)
    assert out["reports"] >= 3
    active = edb.scalars(select(m.Injury).where(m.Injury.cleared_at.is_(None))).all()
    assert active and all(i.source == "espn" for i in active)


@pytest.mark.parametrize("raw,expected", [("-110", -110), ("+145", 145), ("EVEN", 100), ("OFF", None), (None, None), ("-0.5", None)])
def test_american_odds_parsing(raw, expected):
    assert E.american(raw) == expected


def test_line_parsing():
    assert E.number("o237.5") == 237.5 and E.number("u237.5") == 237.5 and E.number("-1.5") == -1.5 and E.number("PK") == 0.0
