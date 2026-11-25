import type { Play, SideInfo } from "@/lib/espn-game";
import type { Team } from "@/lib/types";

/* Small, static fixtures for stories. Shapes match the API and the ESPN parser; values are
   illustrative and are used only inside Storybook. */
export const okc: Team = { id: 1, league: "NBA", slug: "nba-okc", abbr: "OKC", location: "Oklahoma City", nickname: "Thunder", name: "Oklahoma City Thunder", primary: "#007AC1", secondary: "#EF3B24", conference: "West", logo: null };
export const den: Team = { id: 2, league: "NBA", slug: "nba-den", abbr: "DEN", location: "Denver", nickname: "Nuggets", name: "Denver Nuggets", primary: "#0E2240", secondary: "#FEC524", conference: "West", logo: null };
export const homeSide: SideInfo = { id: "25", abbr: "OKC", name: "Oklahoma City Thunder", color: "#007AC1", logo: null, score: 112, periods: [28, 30, 26, 28] };
export const awaySide: SideInfo = { id: "7", abbr: "DEN", name: "Denver Nuggets", color: "#FEC524", logo: null, score: 106, periods: [24, 29, 27, 26] };

/** Deterministic pseudo-random shot set for the shot chart story. */
export function shots(n = 80): Play[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => {
    const ang = (rnd() - 0.5) * Math.PI;
    const r = rnd() < 0.35 ? rnd() * 5 : rnd() < 0.5 ? 8 + rnd() * 12 : 23 + rnd() * 3;
    const x = 25 + Math.sin(ang) * r;
    const y = 1 + Math.cos(ang) * r;
    const three = r > 22.5;
    const made = rnd() < (r < 5 ? 0.62 : three ? 0.36 : 0.42);
    return {
      id: String(i), seq: i, period: 1 + Math.floor(i / 20), clock: "6:00", elapsed: i * 0.6, text: `${three ? "three point" : "two point"} shot`,
      type: "Jump Shot", teamId: i % 2 ? "25" : "7", scoring: made, points: made ? (three ? 3 : 2) : 0, shooting: true, freeThrow: false, made,
      x, y, home: 0, away: 0, athleteId: null, wp: null,
    };
  });
}
