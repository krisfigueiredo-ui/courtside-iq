"""Streak computation and the /api/performance/streaks endpoint."""
from app.services.streaks import run_stats


def test_run_stats_current_and_longest_runs():
    r = run_stats(list("WWLWWWPL"))
    # pushes are skipped: W W L W W W L
    assert r["current"] == "L1" and r["longest_win"] == 3 and r["longest_loss"] == 1
    r = run_stats(list("LLLWPW"))
    assert r["current"] == "W2" and r["longest_loss"] == 3


def test_run_stats_custom_symbols_and_empty():
    r = run_stats(list("CCFOUU"), "C", "F")
    assert r["current"] == "F1" and r["longest_win"] == 2
    assert run_stats([])["current"] is None


def test_streaks_endpoint_by_team_and_conference(client, trained):
    r = client.get("/api/performance/streaks?by=team&league=CBB")
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert rows, "expected team rows"
    with_model = [x for x in rows if x.get("model")]
    assert with_model
    m = with_model[0]["model"]
    assert m["wins"] + m["losses"] + m["pushes"] == m["n"]
    assert m["current"][0] in "WL" and len(m["last10"]) <= 10
    res = next(x["results"] for x in rows if x.get("results"))
    assert set(res) >= {"su", "ats", "ou"} and "-" in res["su"]["record"]
    conf = client.get("/api/performance/streaks?by=conference&league=CBB&market=total").json()["rows"]
    assert all(set(c["model_by_market"]) <= {"total"} for c in conf)


def test_streaks_endpoint_players_and_validation(client, trained):
    r = client.get("/api/performance/streaks?by=player&league=NBA").json()
    assert r["by"] == "player"
    for row in r["rows"][:5]:
        if row.get("form"):
            assert {"pts", "reb", "ast"} <= set(row["form"]["stats"])
    assert client.get("/api/performance/streaks?by=market").status_code == 400
