/**
 * In-browser live score overlay for the static build.
 *
 * The static site is rebuilt from ESPN data on a schedule. Between rebuilds, any game in a
 * response that is live, or due to tip within a few minutes, is refreshed straight from ESPN's
 * public scoreboard (CORS enabled, no key): status, period, clock and score. Model forecasts
 * stay as archived before tip-off; only the scoreboard fields change.
 */

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball";
const PATH: Record<string, string> = { NBA: "nba", CBB: "mens-college-basketball" };
const TTL_MS = 25_000;

export interface LiveState {
  status: "scheduled" | "live" | "final" | "postponed";
  period: number | null;
  clock: string | null;
  home_score: number | null;
  away_score: number | null;
  detail: string | null;
}

type Board = Record<string, LiveState>;
const cache = new Map<string, { at: number; data: Promise<Board> }>();

/** ESPN schedules by US Eastern calendar date. */
export function easternDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

async function fetchBoard(league: string, ymd: string): Promise<Board> {
  const qs = league === "CBB" ? `dates=${ymd}&groups=50&limit=400` : `dates=${ymd}`;
  const res = await fetch(`${ESPN}/${PATH[league]}/scoreboard?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const j = await res.json();
  const out: Board = {};
  for (const ev of j.events ?? []) {
    const c = ev.competitions?.[0];
    if (!c) continue;
    const st = ev.status ?? c.status ?? {};
    const state = st.type?.state;
    const name: string = st.type?.name ?? "";
    const home = c.competitors?.find((x: any) => x.homeAway === "home");
    const away = c.competitors?.find((x: any) => x.homeAway === "away");
    const status: LiveState["status"] = /POSTPONED|CANCELED|SUSPENDED/.test(name) ? "postponed" : state === "in" ? "live" : state === "post" ? "final" : "scheduled";
    out[String(ev.id)] = {
      status,
      period: st.period || null,
      clock: status === "live" ? st.displayClock ?? null : status === "final" ? "FINAL" : null,
      home_score: status === "scheduled" ? null : home?.score != null ? Number(home.score) : null,
      away_score: status === "scheduled" ? null : away?.score != null ? Number(away.score) : null,
      detail: st.type?.shortDetail ?? null,
    };
  }
  return out;
}

function board(league: string, ymd: string): Promise<Board> {
  const key = `${league}:${ymd}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = fetchBoard(league, ymd).catch(() => ({}) as Board);
  cache.set(key, { at: Date.now(), data });
  return data;
}

function isGame(x: any): boolean {
  return x && typeof x === "object" && typeof x.espn_id === "string" && typeof x.status === "string" && "home" in x && "start_time" in x;
}

function collect(x: any, acc: any[], depth = 0) {
  if (!x || typeof x !== "object" || depth > 6) return;
  if (Array.isArray(x)) {
    for (const v of x) collect(v, acc, depth + 1);
    return;
  }
  if (isGame(x)) acc.push(x);
  for (const v of Object.values(x)) if (v && typeof v === "object") collect(v, acc, depth + 1);
}

/** Games worth refreshing: live, or scheduled to have started / start within 15 minutes. */
function needsRefresh(g: any, now: number): boolean {
  const t = Date.parse(g.start_time);
  if (g.status === "live") return true;
  if (g.status === "scheduled") return t - now < 15 * 60_000 && now - t < 30 * 3600_000;
  return false;
}

/** Patch scoreboard fields of every game object inside `data` in place. */
export async function applyLiveScores<T>(data: T): Promise<T> {
  if (typeof window === "undefined") return data;
  const games: any[] = [];
  collect(data, games);
  const now = Date.now();
  const due = games.filter((g) => needsRefresh(g, now));
  if (!due.length) return data;
  const wanted = new Map<string, Promise<Board>>();
  for (const g of due) {
    const key = `${g.league}:${easternDate(g.start_time)}`;
    if (!wanted.has(key) && PATH[g.league]) wanted.set(key, board(g.league, easternDate(g.start_time)));
  }
  const boards = await Promise.all(Array.from(wanted.values()));
  const merged: Board = Object.assign({}, ...boards);
  for (const g of games) {
    const s = merged[g.espn_id];
    if (!s) continue;
    g.status = s.status;
    g.period = s.period;
    g.clock = s.clock;
    if (s.home_score != null) g.home_score = s.home_score;
    if (s.away_score != null) g.away_score = s.away_score;
    g.live_source = "espn";
  }
  return data;
}

/** True when a response contains a game that is live or about to start (poll it). */
export function hasLiveGames(data: unknown): boolean {
  const games: any[] = [];
  collect(data, games);
  const now = Date.now();
  return games.some((g) => needsRefresh(g, now));
}
