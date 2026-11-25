import { describe, expect, it } from "vitest";

import { staticKey } from "@/lib/api";

// Must match backend/tests/test_static_export.py (backend/app/static_export.py:static_key).
const CASES: Record<string, string> = {
  "/api/board?hours=40&league=NBA": "board_hours_40_league_NBA.json",
  "/api/board?league=NBA&hours=40": "board_hours_40_league_NBA.json",
  "/api/games/123?n_sims=20000": "games_123.json",
  "/api/simulate/77?n=50000": "simulate_77.json",
  "/api/ai/search?q=model%20methodology&k=6": "ai_search_k_6_q_model_methodology.json",
  "/api/predictions?player_id=5&limit=300&settled=true": "predictions_limit_300_player_id_5_settled_true.json",
  "/api/status": "status.json",
};

describe("staticKey", () => {
  it("matches the backend exporter's file names", () => {
    for (const [path, key] of Object.entries(CASES)) expect(staticKey(path)).toBe(key);
  });
});
