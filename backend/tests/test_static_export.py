"""The static preview depends on backend and frontend agreeing on response file names.
The same cases are asserted in frontend/tests/static-key.test.ts."""
from app.static_export import static_key, static_paths

CASES = {
    "/api/board?hours=40&league=NBA": "board_hours_40_league_NBA.json",
    "/api/board?league=NBA&hours=40": "board_hours_40_league_NBA.json",
    "/api/games/123?n_sims=20000": "games_123.json",
    "/api/simulate/77?n=50000": "simulate_77.json",
    "/api/ai/search?q=model%20methodology&k=6": "ai_search_k_6_q_model_methodology.json",
    "/api/predictions?player_id=5&limit=300&settled=true": "predictions_limit_300_player_id_5_settled_true.json",
    "/api/status": "status.json",
}


def test_static_key_cases():
    for path, key in CASES.items():
        assert static_key(path) == key, path


def test_static_paths_unique_and_cover_core_views():
    keys = [static_key(p) for p in static_paths()]
    assert len(keys) == len(set(keys))
    for k in ("status.json", "ticker.json", "board.json", "performance_summary.json", "models.json", "props_hours_30_league_NBA.json"):
        assert k in keys
