"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * ESPN game summary (public, CORS-enabled): play-by-play with shot coordinates, ESPN's
 * per-play win probability, box scores and team totals. Fetched in the browser so live games
 * update without a backend. Field shapes are handled defensively; ESPN's API is unofficial.
 */
const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball";
const PATH: Record<string, string> = { NBA: "nba", CBB: "mens-college-basketball" };

export interface Play {
  id: string;
  seq: number;
  period: number;
  clock: string;
  elapsed: number; // game minutes elapsed at this play
  text: string;
  type: string;
  teamId: string | null;
  scoring: boolean;
  points: number;
  shooting: boolean;
  freeThrow: boolean;
  made: boolean;
  x: number | null; // feet, 0-50 sideline to sideline
  y: number | null; // feet from the rim line (rim at y = 1)
  home: number;
  away: number;
  athleteId: string | null;
  wp: number | null; // ESPN home win probability after the play
}

export interface SideInfo {
  id: string;
  abbr: string;
  name: string;
  color: string;
  logo: string | null;
  score: number | null;
  periods: (number | null)[];
}

export interface BoxPlayer {
  id: string;
  name: string;
  short: string;
  pos: string;
  starter: boolean;
  dnp: boolean;
  stats: Record<string, string>;
}

export interface EspnGame {
  id: string;
  league: string;
  state: "pre" | "in" | "post";
  period: number;
  clock: string;
  detail: string;
  periodMinutes: number;
  regulationPeriods: number;
  home: SideInfo;
  away: SideInfo;
  plays: Play[];
  teamStats: Record<string, Record<string, string>>; // teamId -> stat name -> value
  players: Record<string, { labels: string[]; keys: string[]; athletes: BoxPlayer[] }>;
  possession: { teamId: string; basis: string } | null;
  venue: string | null;
  attendance: number | null;
}

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function clockMinutes(clock: string): number {
  const [m, s] = String(clock || "0").split(":");
  return s === undefined ? Number(m) / 60 || 0 : (Number(m) || 0) + (Number(s) || 0) / 60;
}

function elapsedAt(period: number, clock: string, periodMin: number, regPeriods: number) {
  const before = Array.from({ length: Math.max(0, period - 1) }, (_, i) => (i + 1 <= regPeriods ? periodMin : 5)).reduce((a, b) => a + b, 0);
  const len = period <= regPeriods ? periodMin : 5;
  return before + Math.max(0, len - clockMinutes(clock));
}

/** Who has the ball, inferred from the most recent decisive play (ESPN publishes no possession flag). */
export function inferPossession(plays: Play[], homeId: string, awayId: string): { teamId: string; basis: string } | null {
  const other = (t: string | null) => (t === homeId ? awayId : t === awayId ? homeId : null);
  for (let i = plays.length - 1; i >= Math.max(0, plays.length - 12); i--) {
    const p = plays[i];
    const t = p.type.toLowerCase();
    if (/end of|end period|end game|end of game/.test(t) || /^end /.test(p.text.toLowerCase())) return null;
    if (/defensive rebound|offensive rebound/.test(t) && p.teamId) return { teamId: p.teamId, basis: p.text };
    if (/turnover|bad pass|lost ball|traveling|offensive foul|out of bounds/.test(t) && p.teamId) {
      const o = other(p.teamId);
      return o ? { teamId: o, basis: p.text } : null;
    }
    if (p.freeThrow && p.made) {
      const m = p.text.match(/(\d) of (\d)/);
      if (m && m[1] === m[2] && p.teamId) {
        const o = other(p.teamId);
        return o ? { teamId: o, basis: p.text } : null;
      }
      continue;
    }
    if (p.shooting && p.made && !p.freeThrow && p.teamId) {
      const o = other(p.teamId);
      return o ? { teamId: o, basis: p.text } : null;
    }
    if (p.shooting && !p.made) return null; // ball loose until the rebound
  }
  return null;
}

function side(c: any): SideInfo {
  const t = c?.team ?? {};
  return {
    id: String(t.id ?? ""),
    abbr: t.abbreviation ?? "",
    name: t.displayName ?? t.name ?? "",
    color: t.color ? `#${t.color}` : "#888888",
    logo: t.logos?.[0]?.href ?? t.logo ?? null,
    score: toNum(c?.score),
    periods: (c?.linescores ?? []).map((l: any) => toNum(l.displayValue ?? l.value)),
  };
}

export function parseSummary(league: string, eventId: string, d: any): EspnGame {
  const comp = d?.header?.competitions?.[0] ?? {};
  const st = comp.status ?? {};
  const regPeriods = league === "CBB" ? 2 : 4;
  const periodMin = league === "CBB" ? 20 : 12;
  const comps = comp.competitors ?? [];
  const home = side(comps.find((c: any) => c.homeAway === "home"));
  const away = side(comps.find((c: any) => c.homeAway === "away"));
  const wpById = new Map<string, number>();
  for (const w of d?.winprobability ?? []) if (w.playId) wpById.set(String(w.playId), Number(w.homeWinPercentage));
  const plays: Play[] = (d?.plays ?? []).map((p: any, i: number) => {
    const period = Number(p.period?.number ?? 1);
    const clock = p.clock?.displayValue ?? "0:00";
    const c = p.coordinate;
    const valid = c && Math.abs(c.x) < 100 && Math.abs(c.y) < 100;
    const type = p.type?.text ?? "";
    const ft = /free throw/i.test(type);
    return {
      id: String(p.id),
      seq: Number(p.sequenceNumber ?? i),
      period,
      clock,
      elapsed: elapsedAt(period, clock, periodMin, regPeriods),
      text: p.text ?? "",
      type,
      teamId: p.team?.id ? String(p.team.id) : null,
      scoring: !!p.scoringPlay,
      points: Number(p.scoreValue ?? 0),
      shooting: !!p.shootingPlay,
      freeThrow: ft,
      made: !!p.scoringPlay,
      x: valid && !ft ? Number(c.x) : null,
      y: valid && !ft ? Number(c.y) : null,
      home: Number(p.homeScore ?? 0),
      away: Number(p.awayScore ?? 0),
      athleteId: p.participants?.[0]?.athlete?.id ? String(p.participants[0].athlete.id) : null,
      wp: wpById.has(String(p.id)) ? wpById.get(String(p.id))! : null,
    };
  });
  const teamStats: EspnGame["teamStats"] = {};
  for (const t of d?.boxscore?.teams ?? []) {
    const id = String(t.team?.id ?? "");
    teamStats[id] = Object.fromEntries((t.statistics ?? []).map((s: any) => [s.name, String(s.displayValue ?? "")]));
  }
  const players: EspnGame["players"] = {};
  for (const bp of d?.boxscore?.players ?? []) {
    const id = String(bp.team?.id ?? "");
    const g = bp.statistics?.[0];
    if (!g) continue;
    const keys: string[] = g.keys ?? [];
    players[id] = {
      labels: g.labels ?? keys,
      keys,
      athletes: (g.athletes ?? []).map((a: any) => ({
        id: String(a.athlete?.id ?? ""),
        name: a.athlete?.displayName ?? "",
        short: a.athlete?.shortName ?? a.athlete?.displayName ?? "",
        pos: a.athlete?.position?.abbreviation ?? "",
        starter: !!a.starter,
        dnp: !!a.didNotPlay || !(a.stats ?? []).length,
        stats: Object.fromEntries(keys.map((k: string, i: number) => [k, String(a.stats?.[i] ?? "")])),
      })),
    };
  }
  const state = (st.type?.state ?? "pre") as EspnGame["state"];
  return {
    id: eventId,
    league,
    state,
    period: Number(st.period ?? 0),
    clock: st.displayClock ?? "",
    detail: st.type?.shortDetail ?? st.type?.detail ?? "",
    periodMinutes: periodMin,
    regulationPeriods: regPeriods,
    home,
    away,
    plays,
    teamStats,
    players,
    possession: state === "in" ? inferPossession(plays, home.id, away.id) : null,
    venue: d?.gameInfo?.venue?.fullName ?? null,
    attendance: toNum(d?.gameInfo?.attendance),
  };
}

export function useEspnGame(league: string | undefined, eventId: string | null | undefined, live = false) {
  return useQuery<EspnGame>({
    queryKey: ["espn-summary", league, eventId],
    enabled: !!league && !!eventId && !!PATH[league],
    queryFn: async () => {
      const r = await fetch(`${BASE}/${PATH[league!]}/summary?event=${eventId}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`ESPN returned ${r.status}`);
      return parseSummary(league!, eventId!, await r.json());
    },
    refetchInterval: (q) => (live || q.state.data?.state === "in" ? 20_000 : false),
    staleTime: 10_000,
  });
}

/** Possessions so far (FGA - OREB + TOV + 0.44 FTA, averaged over both teams) and the pace they imply. */
export function livePace(g: EspnGame): { possessions: number; minutes: number; pace: number | null } | null {
  const ids = [g.home.id, g.away.id];
  const poss = ids.map((id) => {
    const s = g.teamStats[id] ?? {};
    const [, fga] = (s["fieldGoalsMade-fieldGoalsAttempted"] ?? "0-0").split("-").map(Number);
    const [, fta] = (s["freeThrowsMade-freeThrowsAttempted"] ?? "0-0").split("-").map(Number);
    const oreb = Number(s.offensiveRebounds ?? 0);
    const tov = Number(s.totalTurnovers ?? s.turnovers ?? 0);
    return (fga || 0) - oreb + tov + 0.44 * (fta || 0);
  });
  const possessions = (poss[0] + poss[1]) / 2;
  const last = g.plays[g.plays.length - 1];
  const minutes = g.state === "post" ? Math.max(g.regulationPeriods * g.periodMinutes, last?.elapsed ?? 0) : (last?.elapsed ?? 0);
  if (!possessions || minutes < 1) return null;
  const full = g.regulationPeriods * g.periodMinutes;
  return { possessions, minutes, pace: (possessions / minutes) * full };
}
