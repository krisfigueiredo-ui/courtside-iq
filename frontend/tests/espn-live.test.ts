import { afterEach, describe, expect, it, vi } from "vitest";

import { applyLiveScores, easternDate, hasLiveGames } from "@/lib/espn-live";

const game = (over: Record<string, unknown> = {}) => ({
  id: 1,
  league: "NBA",
  espn_id: "401909320",
  status: "scheduled",
  start_time: new Date(Date.now() - 30 * 60_000).toISOString(),
  period: null,
  clock: null,
  home: { abbr: "PHI" },
  away: { abbr: "MIA" },
  home_score: null,
  away_score: null,
  ...over,
});

const scoreboard = {
  events: [
    {
      id: "401909320",
      status: { period: 2, displayClock: "4:12", type: { state: "in", name: "STATUS_IN_PROGRESS", shortDetail: "4:12 - 2nd" } },
      competitions: [
        {
          competitors: [
            { homeAway: "home", score: "58" },
            { homeAway: "away", score: "51" },
          ],
        },
      ],
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("live score overlay", () => {
  it("converts to the ESPN (US Eastern) schedule date", () => {
    expect(easternDate("2026-11-26T03:30:00Z")).toBe("20261125");
    expect(easternDate("2026-11-25T18:00:00Z")).toBe("20261125");
  });

  it("patches games that have tipped off from the ESPN scoreboard", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(scoreboard), { status: 200 }));
    const data = { games: [{ game: game() }] };
    expect(hasLiveGames(data)).toBe(true);
    await applyLiveScores(data);
    const g = data.games[0].game as any;
    expect(g.status).toBe("live");
    expect(g.period).toBe(2);
    expect(g.clock).toBe("4:12");
    expect([g.home_score, g.away_score]).toEqual([58, 51]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/nba/scoreboard?dates=");
  });

  it("does not call ESPN when nothing is live or about to start", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const later = game({ espn_id: "1", start_time: new Date(Date.now() + 5 * 3600_000).toISOString() });
    const done = game({ espn_id: "2", status: "final", home_score: 101, away_score: 99 });
    const data = [later, done];
    expect(hasLiveGames(data)).toBe(false);
    await applyLiveScores(data);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(done.home_score).toBe(101);
  });
});
