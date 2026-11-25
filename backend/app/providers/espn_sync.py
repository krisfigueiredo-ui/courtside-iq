"""Map ESPN payloads onto the canonical schema: games, live scores, DraftKings lines, team and
player box scores, injuries, rosters, logos and headshots. Used for both the historical
backfill (training data and walk-forward backtests) and the live refresh loop."""
from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models as m
from .espn import ESPN
from .sync import ALIASES, INJURY_STATUS, TeamMatcher, norm

log = logging.getLogger(__name__)
SOURCE = "espn"
ET = ZoneInfo("America/New_York")
ASSET_LICENSE = "Team and league marks belong to their owners; image served by ESPN's CDN for identification only"

# ESPN men's college basketball group ids -> (registry short name, display name, prior strength)
# Priors are pts/100 possessions vs the D-I average; they are shrunk away as games are played.
ESPN_CONF = {
    "2": ("ACC", "Atlantic Coast Conference", 8.5), "8": ("B12", "Big 12 Conference", 11.0),
    "23": ("SEC", "Southeastern Conference", 11.5), "7": ("B10", "Big Ten Conference", 10.0),
    "4": ("BE", "Big East Conference", 9.0), "29": ("WCC", "West Coast Conference", 1.5),
    "44": ("MWC", "Mountain West Conference", 3.0), "62": ("AAC", "American Athletic Conference", 2.5),
    "21": ("P12", "Pac-12 Conference", 4.5), "3": ("A10", "Atlantic 10 Conference", 2.5),
    "18": ("MVC", "Missouri Valley Conference", 0.5), "11": ("CUSA", "Conference USA", -2.0),
    "14": ("MAC", "Mid-American Conference", -2.0), "27": ("SBC", "Sun Belt Conference", -2.5),
    "10": ("CAA", "Coastal Athletic Association", -3.0), "24": ("SOCON", "Southern Conference", -3.0),
    "12": ("IVY", "Ivy League", -3.0), "45": ("HORZ", "Horizon League", -4.0), "9": ("BW", "Big West Conference", -4.0),
    "49": ("SUM", "Summit League", -4.0), "30": ("UAC", "United Athletic Conference", -4.5),
    "46": ("ASUN", "ASUN Conference", -5.0), "5": ("BSKY", "Big Sky Conference", -5.0),
    "1": ("AE", "America East Conference", -6.0), "22": ("PAT", "Patriot League", -6.0),
    "6": ("BSO", "Big South Conference", -6.0), "13": ("MAAC", "Metro Atlantic Athletic Conference", -6.5),
    "20": ("OVC", "Ohio Valley Conference", -7.0), "25": ("SLND", "Southland Conference", -7.5),
    "19": ("NEC", "Northeast Conference", -9.0), "16": ("MEAC", "Mid-Eastern Athletic Conference", -10.5),
    "26": ("SWAC", "Southwestern Athletic Conference", -11.0),
}
DEFAULT_PRIOR = -4.0
EXCLUDED_STATUS = ("STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_SUSPENDED", "STATUS_FORFEIT")
CLOSE_LEAD = timedelta(minutes=5)  # ESPN's closing line carries no timestamp; stamped just before tip
OPEN_LEAD = timedelta(hours=24)  # likewise for the opening line


def season_label(year: int) -> str:
    return f"{year - 1}-{str(year)[-2:]}"


def parse_time(s: str) -> datetime:
    s = s.replace("Z", "+00:00")
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+00:00", s):
        s = s.replace("+00:00", ":00+00:00")
    return datetime.fromisoformat(s).astimezone(timezone.utc)


def american(v) -> int | None:
    if v is None:
        return None
    s = str(v).strip().upper()
    if s in ("", "OFF", "N/A", "-", "NONE"):
        return None
    if s == "EVEN":
        return 100
    try:
        x = int(round(float(s.replace("+", ""))))
    except ValueError:
        return None
    return x if abs(x) >= 100 else None


def number(v) -> float | None:
    if v is None:
        return None
    s = re.sub(r"^[ou]", "", str(v).strip().lower())
    if s in ("pk", "pick", "even"):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return None


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class Syncer:
    """One sync pass. Keeps lookups (teams, games, latest odds, players) in memory so a season
    backfill does not issue a query per row."""

    def __init__(self, db: Session, client: ESPN | None = None, around: datetime | None = None, window_days: int = 30):
        """`around` limits the preloaded games and lines to +/- `window_days` (live refresh)."""
        self.db = db
        self.c = client or ESPN()
        self.teams: dict[tuple[str, str], m.Team] = {}
        for t in db.scalars(select(m.Team)):
            if (t.provider_ids or {}).get("espn"):
                self.teams[(t.league, str(t.provider_ids["espn"]))] = t
        self.confs = {c.short_name: c for c in db.scalars(select(m.Conference).where(m.Conference.league == "CBB"))}
        self.books = {b.key: b for b in db.scalars(select(m.Sportsbook))}
        self.games: dict[tuple[str, str], m.Game] = {}
        gq = select(m.Game).where(m.Game.source == SOURCE)
        if around is not None:
            gq = gq.where(m.Game.start_time >= around - timedelta(days=window_days), m.Game.start_time <= around + timedelta(days=window_days))
        for g in db.scalars(gq):
            if (g.provider_ids or {}).get("espn"):
                self.games[(g.league, str(g.provider_ids["espn"]))] = g
        self.boxed = set(db.scalars(select(m.TeamGameStat.game_id).distinct()))
        self.last_odds: dict[tuple, tuple] = {}
        q = (select(m.OddsSnapshot.game_id, m.OddsSnapshot.sportsbook_id, m.OddsSnapshot.market, m.OddsSnapshot.outcome,
                    m.OddsSnapshot.line, m.OddsSnapshot.price_american, m.OddsSnapshot.captured_at)
             .where(m.OddsSnapshot.source == SOURCE).order_by(m.OddsSnapshot.captured_at))
        if around is not None:
            q = q.where(m.OddsSnapshot.game_id.in_([g.id for g in self.games.values()] or [-1]))
        for gid, bid, mk, oc, line, price, ts in db.execute(q):
            self.last_odds[(gid, bid, mk, oc)] = (line, price, _aware(ts))
        self.players: dict[str, m.Player] = {}
        self.players_by_name: dict[str, m.Player] = {}
        for p in db.scalars(select(m.Player)):
            if (p.provider_ids or {}).get("espn"):
                self.players[str(p.provider_ids["espn"])] = p
            self.players_by_name.setdefault(p.full_name.lower(), p)
        self.assets = {(a.entity_type, a.entity_id, a.kind) for a in db.scalars(select(m.Asset).where(m.Asset.source == SOURCE))}
        self._d1: set[str] | None = None
        self._nba_matcher: TeamMatcher | None = None
        self._cbb_index: dict[str, m.Team] | None = None

    # ---------- registry ----------
    def d1_ids(self) -> set[str]:
        if self._d1 is None:
            self._d1 = {str(t["id"]) for t in self.c.teams("CBB")}
        return self._d1

    def _cbb_lookup(self, tj: dict) -> m.Team | None:
        """Registry schools are matched on exact school + nickname (never on a prefix, which would
        map e.g. Georgia Southern onto Georgia)."""
        if self._cbb_index is None:
            self._cbb_index = {}
            for t in self.db.scalars(select(m.Team).where(m.Team.league == "CBB")):
                if not (t.provider_ids or {}).get("espn"):
                    self._cbb_index[norm(f"{t.location} {t.nickname}")] = t
            for a, b in ALIASES.items():
                if norm(b) in self._cbb_index:
                    self._cbb_index[norm(a)] = self._cbb_index[norm(b)]
        t = self._cbb_index.pop(norm(tj.get("displayName") or ""), None)
        if t is not None:
            for k in [k for k, v in self._cbb_index.items() if v is t]:
                self._cbb_index.pop(k)
        return t

    def conference(self, espn_id: str | None) -> m.Conference | None:
        if not espn_id:
            return None
        short, name, prior = ESPN_CONF.get(str(espn_id), (f"C{espn_id}", f"Division I conference {espn_id}", DEFAULT_PRIOR))
        conf = self.confs.get(short)
        if conf is None:
            conf = m.Conference(league="CBB", short_name=short, name=name, strength=prior)
            self.db.add(conf)
            self.db.flush()
            self.confs[short] = conf
        return conf

    def team(self, league: str, tj: dict) -> m.Team | None:
        eid = str(tj["id"])
        t = self.teams.get((league, eid))
        if t is None:
            if league == "NBA":
                if self._nba_matcher is None:
                    self._nba_matcher = TeamMatcher(self.db, "NBA")
                t = self._nba_matcher.match(tj.get("displayName"))
                if t is None:
                    return None  # All-Star teams, international exhibition opponents
            else:
                if eid not in self.d1_ids():
                    return None  # non-Division I opponent
                t = self._cbb_lookup(tj)
                if t is None:
                    slug = re.sub(r"[^a-z0-9]+", "-", (tj.get("location") or eid).lower()).strip("-")
                    t = m.Team(league="CBB", slug=f"cbb-{slug}-{eid}", abbreviation=(tj.get("abbreviation") or eid)[:8].upper(),
                               location=tj.get("location") or tj.get("displayName", ""), nickname=tj.get("name") or "",
                               primary_color=f"#{tj.get('color') or '2F7BFF'}"[:9],
                               secondary_color=f"#{tj.get('alternateColor') or 'FFFFFF'}"[:9], provider_ids={})
                    self.db.add(t)
                    self.db.flush()
            t.provider_ids = {**(t.provider_ids or {}), "espn": eid}
            self.teams[(league, eid)] = t
        if league == "CBB" and tj.get("conferenceId"):
            conf = self.conference(tj["conferenceId"])
            if conf is not None and t.conference_id != conf.id:
                t.conference_id = conf.id  # latest season wins (conference realignment)
        if tj.get("logo") and ("team", t.id, "logo") not in self.assets:
            self.db.add(m.Asset(entity_type="team", entity_id=t.id, kind="logo", url=tj["logo"], license=ASSET_LICENSE,
                                source=SOURCE, verified=True))
            self.assets.add(("team", t.id, "logo"))
        return t

    def book(self, provider: dict) -> m.Sportsbook:
        name = provider.get("displayName") or provider.get("name") or "Consensus"
        key = re.sub(r"[^a-z0-9]+", "", name.lower()) or "consensus"
        key = {"williamhill": "williamhill_us", "caesars": "williamhill_us"}.get(key, key)
        b = self.books.get(key)
        if b is None:
            b = m.Sportsbook(key=key, name=name, region="us")
            self.db.add(b)
            self.db.flush()
            self.books[key] = b
        return b

    def player(self, aj: dict, team: m.Team | None = None) -> m.Player:
        eid = str(aj.get("id") or "")
        p = self.players.get(eid) if eid else None
        if p is None:
            name = aj.get("displayName") or f"{aj.get('firstName', '')} {aj.get('lastName', '')}".strip()
            p = self.players_by_name.get(name.lower())
            if p is not None and (p.provider_ids or {}).get("espn") not in (None, eid):
                p = None  # same name, different person
            if p is None:
                first, _, last = name.partition(" ")
                p = m.Player(league="NBA", full_name=name, first_name=aj.get("firstName") or first, last_name=aj.get("lastName") or last,
                             position=(aj.get("position") or {}).get("abbreviation"), provider_ids={})
                self.db.add(p)
                self.db.flush()
                self.players_by_name.setdefault(name.lower(), p)
            if eid:
                p.provider_ids = {**(p.provider_ids or {}), "espn": eid}
                self.players[eid] = p
        pos = (aj.get("position") or {}).get("abbreviation")
        if pos and not p.position:
            p.position = pos
        href = (aj.get("headshot") or {}).get("href") or (f"https://a.espncdn.com/i/headshots/nba/players/full/{eid}.png" if eid.isdigit() else None)
        if href and ("player", p.id, "portrait") not in self.assets:
            self.db.add(m.Asset(entity_type="player", entity_id=p.id, kind="portrait", url=href, license=ASSET_LICENSE,
                                source=SOURCE, verified=True))
            self.assets.add(("player", p.id, "portrait"))
        return p

    # ---------- games ----------
    def game(self, league: str, ev: dict) -> m.Game | None:
        if (ev.get("season") or {}).get("type") == 1:
            return None  # preseason
        comp = ev["competitions"][0]
        sides = {c.get("homeAway"): c for c in comp.get("competitors", [])}
        if "home" not in sides or "away" not in sides:
            return None
        home, away = self.team(league, sides["home"]["team"]), self.team(league, sides["away"]["team"])
        if home is None or away is None:
            return None
        eid = str(ev["id"])
        start = parse_time(ev["date"])
        g = self.games.get((league, eid))
        if g is None:
            g = m.Game(league=league, season=season_label(int((ev.get("season") or {}).get("year") or start.year)), start_time=start,
                       home_team_id=home.id, away_team_id=away.id, source=SOURCE, provider_ids={"espn": eid}, is_demo=False,
                       is_historical_sim=False, pregame_context={}, status="scheduled")
            self.db.add(g)
            self.games[(league, eid)] = g
        st = ev.get("status") or {}
        stype = st.get("type") or {}
        status = {"pre": "scheduled", "in": "live", "post": "final"}.get(stype.get("state"), "scheduled")
        if stype.get("name") in EXCLUDED_STATUS:
            status = "postponed"
        g.status = status
        if status in ("scheduled", "postponed"):
            g.start_time = start
        g.neutral_site = bool(comp.get("neutralSite"))
        g.period = int(st.get("period") or 0) or None
        g.clock = (st.get("displayClock") or "")[:8] if status == "live" else ("FINAL" if status == "final" else None)
        if status in ("live", "final"):
            g.home_score = _int(sides["home"].get("score"))
            g.away_score = _int(sides["away"].get("score"))
            n_h1 = 2 if league == "NBA" else 1
            if status == "final" or (g.period or 0) > n_h1:
                hh = _half(sides["home"].get("linescores"), n_h1)
                ah = _half(sides["away"].get("linescores"), n_h1)
                if hh is not None and ah is not None:
                    g.home_h1, g.away_h1 = hh, ah
        return g

    def odds(self, g: m.Game, o: dict | None, now: datetime, final: bool = False) -> int:
        """Record the opening line once and the current (or closing) line whenever it changes."""
        if not o:
            return 0
        book = self.book(o.get("provider") or {})
        start = _aware(g.start_time)
        ps, tot, ml = o.get("pointSpread") or {}, o.get("total") or {}, o.get("moneyline") or {}

        def leg(d: dict, side: str, when: str):
            x = (d.get(side) or {}).get(when) or {}
            return number(x.get("line")), american(x.get("odds"))

        rows = []
        for when in ("open", "close"):
            sh, sh_p = leg(ps, "home", when)
            sa, sa_p = leg(ps, "away", when)
            to, to_p = leg(tot, "over", when)
            tu, tu_p = leg(tot, "under", when)
            mh = american(((ml.get("home") or {}).get(when) or {}).get("odds"))
            ma = american(((ml.get("away") or {}).get(when) or {}).get("odds"))
            if when == "close":  # flat fields (pickcenter, older payloads)
                if sh is None:
                    sh = number(o.get("spread"))
                if sa is None and sh is not None:
                    sa = -sh
                if to is None:
                    to = number(o.get("overUnder"))
                if tu is None:
                    tu = to
                sh_p = sh_p or american((o.get("homeTeamOdds") or {}).get("spreadOdds")) or (-110 if sh is not None else None)
                sa_p = sa_p or american((o.get("awayTeamOdds") or {}).get("spreadOdds")) or (-110 if sa is not None else None)
                to_p = to_p or american(o.get("overOdds")) or (-110 if to is not None else None)
                tu_p = tu_p or american(o.get("underOdds")) or (-110 if tu is not None else None)
                mh = mh or american((o.get("homeTeamOdds") or {}).get("moneyLine"))
                ma = ma or american((o.get("awayTeamOdds") or {}).get("moneyLine"))
            if when == "open":
                ts = min(start - OPEN_LEAD, now)
            else:
                ts = start - CLOSE_LEAD if (final or now >= start - CLOSE_LEAD) else now
            for market, outcome, line, price in (("spreads", "home", sh, sh_p), ("spreads", "away", sa, sa_p),
                                                 ("totals", "over", to, to_p), ("totals", "under", tu, tu_p),
                                                 ("h2h", "home", None, mh), ("h2h", "away", None, ma)):
                if price is None or (market != "h2h" and line is None):
                    continue
                rows.append((when, market, outcome, line, price, ts))
        n = 0
        for when, market, outcome, line, price, ts in rows:
            key = (g.id, book.id, market, outcome)
            last = self.last_odds.get(key)
            if when == "open" and last is not None:
                continue
            if last is not None and last[0] == line and last[1] == price:
                continue
            if last is not None and ts <= last[2]:
                ts = last[2] + timedelta(seconds=1)
            self.db.add(m.OddsSnapshot(game_id=g.id, sportsbook_id=book.id, market=market, outcome=outcome, line=line,
                                       price_american=price, captured_at=ts, source=SOURCE, is_demo=False))
            self.last_odds[key] = (line, price, ts)
            n += 1
        return n

    def box(self, league: str, g: m.Game, summary: dict) -> int:
        """Team (and, for the NBA, player) box scores from a final game's summary."""
        if g.id in self.boxed:
            return 0
        bs = summary.get("boxscore") or {}
        totals = {}
        for bt in bs.get("teams") or []:
            t = self.team(league, bt["team"])
            if t is None:
                return 0
            s = {x.get("name"): x.get("displayValue") for x in bt.get("statistics", [])}
            fgm, fga = _pair(s.get("fieldGoalsMade-fieldGoalsAttempted"))
            f3m, f3a = _pair(s.get("threePointFieldGoalsMade-threePointFieldGoalsAttempted"))
            ftm, fta = _pair(s.get("freeThrowsMade-freeThrowsAttempted"))
            if not fga:
                return 0
            oreb, dreb = _int(s.get("offensiveRebounds")) or 0, _int(s.get("defensiveRebounds")) or 0
            tov = _int(s.get("totalTurnovers"))
            tov = tov if tov is not None else (_int(s.get("turnovers")) or 0)
            totals[t.id] = dict(fgm=fgm or 0, fga=fga, fg3m=f3m or 0, fg3a=f3a or 0, ftm=ftm or 0, fta=fta or 0, oreb=oreb,
                                dreb=dreb, tov=tov, ast=_int(s.get("assists")))
        if set(totals) != {g.home_team_id, g.away_team_id} or g.home_score is None:
            return 0
        for tid, tt in totals.items():
            home = tid == g.home_team_id
            poss = tt["fga"] - tt["oreb"] + tt["tov"] + 0.44 * tt["fta"]
            self.db.add(m.TeamGameStat(game_id=g.id, team_id=tid, is_home=home, points=(g.home_score if home else g.away_score) or 0,
                                       h1_points=g.home_h1 if home else g.away_h1, possessions=poss, **tt))
        self.boxed.add(g.id)
        n = 0
        if league == "NBA":
            for bp in bs.get("players") or []:
                t = self.team(league, bp["team"])
                if t is None:
                    continue
                for grp in bp.get("statistics", []):
                    keys = grp.get("keys") or []
                    for a in grp.get("athletes", []):
                        if a.get("didNotPlay") or not a.get("stats"):
                            continue
                        st = dict(zip(keys, a["stats"]))
                        mins = _minutes(st.get("minutes"))
                        if mins <= 0:
                            continue
                        pl = self.player(a.get("athlete") or {}, t)
                        fgm, fga = _pair(st.get("fieldGoalsMade-fieldGoalsAttempted"))
                        f3m, f3a = _pair(st.get("threePointFieldGoalsMade-threePointFieldGoalsAttempted"))
                        ftm, fta = _pair(st.get("freeThrowsMade-freeThrowsAttempted"))
                        self.db.add(m.PlayerGameStat(game_id=g.id, player_id=pl.id, team_id=t.id, started=bool(a.get("starter")),
                                                     minutes=round(mins, 2), pts=_int(st.get("points")) or 0,
                                                     reb=_int(st.get("rebounds")) or 0, ast=_int(st.get("assists")) or 0,
                                                     fg3m=f3m or 0, fg3a=f3a or 0, fga=fga or 0, fta=fta or 0,
                                                     stl=_int(st.get("steals")) or 0, blk=_int(st.get("blocks")) or 0,
                                                     tov=_int(st.get("turnovers")) or 0))
                        n += 1
        return n + 2


def _int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _pair(v):
    if not v or "-" not in str(v):
        return None, None
    a, b = str(v).split("-", 1)
    return _int(a), _int(b)


def _minutes(v) -> float:
    if v in (None, "", "--"):
        return 0.0
    s = str(v)
    if ":" in s:
        mm, ss = s.split(":", 1)
        return (_int(mm) or 0) + (_int(ss) or 0) / 60
    try:
        return float(s)
    except ValueError:
        return 0.0


def _half(lines, n: int):
    if not lines:
        return None
    if all("period" in x for x in lines):
        vals = [x.get("value") for x in lines if (x.get("period") or 0) <= n]
    else:
        vals = [x.get("value") for x in lines[:n]]
    if len(vals) < n or any(v is None for v in vals):
        return None
    return int(sum(vals))


# ---------- orchestration ----------

def sync_day(league: str, day: date, s: Syncer, now: datetime, cache: bool = False, summaries: bool = True) -> dict:
    sb = s.c.scoreboard(league, day, cache=cache)
    out = dict(games=0, odds=0, box=0)
    finals = []
    for ev in sb.get("events", []):
        g = s.game(league, ev)
        if g is None:
            continue
        s.db.flush()
        out["games"] += 1
        odds = (ev["competitions"][0].get("odds") or [None])[0]
        if g.status in ("scheduled", "live") and odds:
            out["odds"] += s.odds(g, odds, now)
        if g.status == "final" and g.id not in s.boxed:
            finals.append(g)
    if summaries and finals:
        ids = [(g, (g.provider_ids or {}).get("espn")) for g in finals]
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda x: _safe_summary(s.c, league, x[1]), ids))
        for (g, _), summ in zip(ids, results):
            if not summ:
                continue
            out["box"] += s.box(league, g, summ)
            pc = (summ.get("pickcenter") or [None])[0]
            if pc:
                out["odds"] += s.odds(g, pc, now, final=True)
    s.db.commit()
    return out


def _safe_summary(c: ESPN, league: str, eid: str):
    try:
        return c.summary(league, eid, cache=True)
    except Exception as exc:  # pragma: no cover - network
        log.warning("espn summary %s failed: %s", eid, exc)
        return None


SEASON_WINDOWS = {"NBA": ((10, 1), (6, 30)), "CBB": ((11, 1), (4, 10))}
SCHEDULE_DAYS = 7  # upcoming schedule loaded ahead of today


def season_start_year(league: str, d: date) -> int:
    (sm, sd), _ = SEASON_WINDOWS[league]
    return d.year if (d.month, d.day) >= (sm, sd) else d.year - 1


def backfill(db: Session, league: str, seasons: int = 2, start: date | None = None, end: date | None = None,
             s: Syncer | None = None) -> dict:
    """Load the current season to date plus `seasons - 1` earlier seasons (or only the days from
    `start`). Scoreboards for past days and final-game summaries are cached on disk."""
    now = datetime.now(timezone.utc)
    today = now.astimezone(ET).date()
    end = end or (today + timedelta(days=SCHEDULE_DAYS))
    (sm, sd), (em, ed) = SEASON_WINDOWS[league]
    s = s or Syncer(db)
    totals = dict(days=0, games=0, odds=0, box=0)
    cur = season_start_year(league, today)
    for y in range(cur - seasons + 1, cur + 1):
        lo, hi = date(y, sm, sd), min(date(y + 1, em, ed), end)
        if start:
            lo = max(lo, start)
        d = lo
        while d <= hi:
            r = sync_day(league, d, s, now, cache=d < today - timedelta(days=2))
            totals["days"] += 1
            for k in ("games", "odds", "box"):
                totals[k] += r[k]
            d += timedelta(days=1)
        log.info("espn backfill %s %s: %s", league, season_label(y + 1), totals)
    totals["requests"] = s.c.requests
    return totals


def sync_live(db: Session, leagues=("NBA", "CBB"), now: datetime | None = None, s: Syncer | None = None,
              schedule: bool = False) -> dict:
    """Refresh yesterday, today and tomorrow (US Eastern dates): status, scores, lines, box scores.
    With `schedule`, also the following days up to SCHEDULE_DAYS ahead (new games, opening lines)."""
    now = now or datetime.now(timezone.utc)
    s = s or Syncer(db, around=now)
    today = now.astimezone(ET).date()
    days = range(-1, (SCHEDULE_DAYS if schedule else 1) + 1)
    out = {}
    for league in leagues:
        agg = dict(games=0, odds=0, box=0)
        for d in (today + timedelta(days=k) for k in days):
            r = sync_day(league, d, s, now)
            for k in agg:
                agg[k] += r[k]
        out[league] = agg
    return out


def sync_injuries(db: Session, s: Syncer | None = None) -> dict:
    """NBA injury report. Players no longer listed are marked cleared."""
    s = s or Syncer(db)
    data = s.c.injuries()
    now = datetime.now(timezone.utc)
    matcher = TeamMatcher(db, "NBA")
    seen, n = set(), 0
    for block in data.get("injuries", []):
        team = matcher.match(block.get("displayName"))
        if team is None:
            continue
        for inj in block.get("injuries", []):
            a = inj.get("athlete") or {}
            if not a.get("displayName"):
                continue
            mid = re.search(r"/id/(\d+)", " ".join(x.get("href", "") for x in a.get("links", [])))
            pl = s.player(dict(a, id=mid.group(1) if mid else ""), team)
            status = INJURY_STATUS.get(str(inj.get("status", "")).lower(), "questionable")
            desc = (inj.get("shortComment") or inj.get("longComment") or "")[:200] or None
            reported = parse_time(inj["date"]) if inj.get("date") else now
            cur = db.scalar(select(m.Injury).where(m.Injury.player_id == pl.id, m.Injury.cleared_at.is_(None), m.Injury.source == SOURCE))
            if cur is None or cur.status != status or cur.description != desc:
                if cur is not None:
                    cur.cleared_at = now
                db.add(m.Injury(player_id=pl.id, team_id=team.id, status=status, description=desc, reported_at=reported,
                                source=SOURCE, is_demo=False))
            seen.add(pl.id)
            n += 1
    cleared = 0
    for inj in db.scalars(select(m.Injury).where(m.Injury.cleared_at.is_(None))):
        if inj.player_id not in seen:
            inj.cleared_at = now
            cleared += 1
    db.commit()
    return dict(reports=n, cleared=cleared)


def sync_rosters(db: Session, s: Syncer | None = None) -> dict:
    """Current NBA rosters for all 30 teams -> verified memberships; anyone no longer listed is closed."""
    s = s or Syncer(db)
    now = datetime.now(timezone.utc)
    year = season_start_year("NBA", now.astimezone(ET).date())
    season = f"{year}-{str(year + 1)[-2:]}"
    for tj in s.c.teams("NBA"):  # make sure every franchise carries its ESPN id
        s.team("NBA", tj)
    db.flush()
    nba = [t for t in db.scalars(select(m.Team).where(m.Team.league == "NBA")) if (t.provider_ids or {}).get("espn")]
    with ThreadPoolExecutor(max_workers=6) as pool:
        payloads = list(pool.map(lambda t: (t, s.c.roster(t.provider_ids["espn"])), nba))
    seen, n = set(), 0
    current = {rm.player_id: rm for rm in db.scalars(select(m.RosterMembership).where(m.RosterMembership.end_date.is_(None)))}
    for t, data in payloads:
        for a in data.get("athletes", []):
            pl = s.player(a, t)
            pos = (a.get("position") or {}).get("abbreviation")
            if pos:
                pl.position = pos
            cur = current.get(pl.id)
            if cur is not None and cur.team_id != t.id:
                cur.end_date = now.date()
                cur = None
            if cur is None:
                cur = m.RosterMembership(player_id=pl.id, team_id=t.id, season=season, start_date=now.date(), source=SOURCE)
                db.add(cur)
                current[pl.id] = cur
            cur.jersey_number = (a.get("jersey") or cur.jersey_number or None)
            cur.season, cur.verified, cur.verified_at, cur.source = season, True, now, SOURCE
            seen.add(pl.id)
            n += 1
    closed = 0
    if seen:
        for pid, rm in current.items():
            if pid not in seen and rm.end_date is None:
                rm.end_date = now.date()
                closed += 1
    db.commit()
    return dict(memberships=n, closed=closed)


def prune_unmatched_registry(db: Session) -> int:
    """Drop seeded college teams ESPN never reported (no ESPN id, no games)."""
    used = set(db.scalars(select(m.Game.home_team_id))) | set(db.scalars(select(m.Game.away_team_id)))
    n = 0
    for t in db.scalars(select(m.Team).where(m.Team.league == "CBB")).all():
        if not (t.provider_ids or {}).get("espn") and t.id not in used:
            db.delete(t)
            n += 1
    db.commit()
    return n


def espn_game_count(db: Session) -> int:
    return db.scalar(select(func.count(m.Game.id)).where(m.Game.source == SOURCE)) or 0


def last_synced_day(db: Session, league: str) -> date | None:
    t = db.scalar(select(func.max(m.Game.start_time)).where(m.Game.league == league, m.Game.source == SOURCE, m.Game.status == "final"))
    return _aware(t).astimezone(ET).date() if t else None
