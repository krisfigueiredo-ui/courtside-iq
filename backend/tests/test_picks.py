"""Pick tiers, the live ledger round trip and the picks endpoints."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app import models as m
from app.db import Base
from app.services import ledger, picks


def test_tier_rules():
    table = {("CBB", "total", "2-5%"): dict(n=166, wins=95, losses=71, roi=0.097),
             ("NBA", "props", "5-10%"): dict(n=2070, wins=1040, losses=1030, roi=-0.061),
             ("NBA", "spread", "2-5%"): dict(n=2, wins=1, losses=1, roi=0.0)}
    assert picks.tier_of("CBB", "total", 0.03, table)[0] == "bet"
    assert picks.tier_of("CBB", "total", -0.01, table)[0] == "pass"
    assert picks.tier_of("NBA", "prop_pts", 0.07, table)[0] == "pass"  # that kind of edge lost money
    assert picks.tier_of("NBA", "spread", 0.03, table)[0] == "lean"  # too little history
    assert picks.tier_of("NBA", "moneyline", 0.05, {})[0] == "lean"
    assert picks.bucket_of(0.0) == "0-2%" and picks.bucket_of(-0.001) == "<0" and picks.bucket_of(0.2) == "10%+"


def test_ledger_round_trip_is_exact_and_idempotent(tmp_path):
    from app.services import seed

    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng, expire_on_commit=False)()
    seed.seed_registry(db)
    home, away = db.scalars(select(m.Team).where(m.Team.league == "NBA").limit(2)).all()
    start = datetime(2026, 11, 27, 0, 0, tzinfo=timezone.utc)
    g = m.Game(league="NBA", season="2026-27", start_time=start, home_team_id=home.id, away_team_id=away.id, status="scheduled",
               source="espn", provider_ids={"espn": "401999999"}, is_demo=False, pregame_context={})
    mv = m.ModelVersion(league="NBA", name="game", version="nba-game-test", algorithm="x", data_source="real", is_active=True)
    db.add_all([g, mv])
    db.flush()
    frozen = start - timedelta(hours=3)
    db.add_all([
        m.Prediction(league="NBA", game_id=g.id, model_version_id=mv.id, market="spread", selection="home", line=-4.5, price_american=-110,
                     predicted_prob=0.56, predicted_value=6.1, data_as_of=frozen, created_at=frozen, details={"mode": "live", "p_push": 0.0}),
        m.Prediction(league="NBA", game_id=g.id, model_version_id=mv.id, market="total", selection="under", line=224.5, price_american=-110,
                     predicted_prob=0.51, predicted_value=222.0, data_as_of=frozen, created_at=frozen, details={"mode": "backtest", "p_push": 0.0}),
    ])
    db.commit()
    assert picks.stamp_tiers(db) == 1  # only the live forecast is tiered
    path = tmp_path / "ledger.jsonl.gz"
    out = ledger.export(db, path)
    assert out == dict(rows=1, added=1, graded=0)  # backtests never enter the ledger
    before = [(p.market, p.selection, p.line, p.price_american, p.predicted_prob, p.details["tier"]) for p in db.scalars(select(m.Prediction)) if p.details["mode"] == "live"]
    for p in db.scalars(select(m.Prediction)).all():
        db.delete(p)
    db.commit()
    assert ledger.import_(db, path)["restored"] == 1
    after = [(p.market, p.selection, p.line, p.price_american, p.predicted_prob, p.details["tier"]) for p in db.scalars(select(m.Prediction))]
    assert after == before
    assert ledger.import_(db, path)["restored"] == 0
    # grading reaches the ledger once; frozen fields never change
    p = db.scalars(select(m.Prediction)).one()
    p.result, p.actual_value = "win", 8.0
    db.commit()
    assert ledger.export(db, path)["graded"] == 1
    row = ledger.read(path)[0]
    assert row["result"] == "win" and row["line"] == -4.5 and row["details"]["tier"] in ("bet", "lean", "pass")


def test_picks_endpoints(client, trained):
    b = client.get("/api/picks/board?hours=72")
    assert b.status_code == 200 and {"rows", "rules"} <= set(b.json())
    for r in b.json()["rows"][:10]:
        assert r["tier"] in ("bet", "lean", "pass") and 0 < r["breakeven"] < 1 and r["stake"] in (0.0, 0.5, 1.0)
    rec = client.get("/api/picks/record")
    assert rec.status_code == 200 and "by_tier" in rec.json()
