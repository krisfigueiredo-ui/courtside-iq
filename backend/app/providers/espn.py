"""ESPN public site API (no API key): scoreboards, box scores, closing lines, injuries, rosters.

Endpoints (https://site.api.espn.com/apis/site/v2/sports/basketball/{league}/...):
  scoreboard?dates=YYYYMMDD     games, live status, scores by period, DraftKings lines (open/close)
                                (college: &groups=50&limit=400 for all of Division I)
  summary?event={id}            team and player box scores, pickcenter (closing line)
  injuries                      NBA injury report
  teams/{id}/roster             current NBA roster with jersey numbers

Responses are reduced to the fields the platform uses before they are kept. Past days and
final-game summaries do not change, so they are cached on disk (data/espn_cache, gzipped).
ESPN's site API is public but undocumented; field shapes are handled defensively.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import logging
import time
from datetime import date
from pathlib import Path

import httpx

from .base import ProviderError, RateLimiter

log = logging.getLogger(__name__)

BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball"
CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues"
LEAGUE_PATH = {"NBA": "nba", "CBB": "mens-college-basketball"}
CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "espn_cache"


class ESPN:
    name = "espn"

    def __init__(self, per_minute: int = 600, cache_dir: Path | None = CACHE_DIR):
        self.limiter = RateLimiter(per_minute)
        self.cache_dir = cache_dir
        self.client = httpx.Client(timeout=30, headers={"User-Agent": "courtside-iq/1.0"})
        self.requests = 0

    configured = True

    def _cache_path(self, url: str) -> Path | None:
        if not self.cache_dir:
            return None
        h = hashlib.sha1(url.encode()).hexdigest()
        return self.cache_dir / h[:2] / (h + ".json.gz")

    def get(self, path: str, params: dict | None = None, cache: bool = False, retries: int = 3, compact=None, base: str = BASE) -> dict:
        url = f"{base}/{path}" + ("?" + "&".join(f"{k}={v}" for k, v in params.items()) if params else "")
        cp = self._cache_path(url) if cache else None
        if cp and cp.exists():
            try:
                return json.loads(gzip.decompress(cp.read_bytes()))
            except (OSError, ValueError):
                cp.unlink(missing_ok=True)
        err = None
        for attempt in range(retries + 1):
            self.limiter.acquire()
            try:
                r = self.client.get(url)
                self.requests += 1
                if r.status_code == 429 or r.status_code >= 500:
                    err = ProviderError(f"espn HTTP {r.status_code}")
                    time.sleep(min(20, 2 ** attempt))
                    continue
                if r.status_code >= 400:
                    raise ProviderError(f"espn HTTP {r.status_code} for {path}")
                data = r.json()
                if compact:
                    data = compact(data)
                if cp:
                    cp.parent.mkdir(parents=True, exist_ok=True)
                    tmp = cp.with_suffix(".tmp")
                    tmp.write_bytes(gzip.compress(json.dumps(data, separators=(",", ":")).encode(), mtime=0))
                    tmp.replace(cp)
                return data
            except httpx.HTTPError as exc:
                err = exc
                time.sleep(min(20, 2 ** attempt))
        raise ProviderError(f"espn request failed: {err}")

    def scoreboard(self, league: str, day: date, cache: bool = False) -> dict:
        params = {"dates": day.strftime("%Y%m%d")}
        if league == "CBB":
            params.update(groups=50, limit=400)
        return self.get(f"{LEAGUE_PATH[league]}/scoreboard", params, cache=cache, compact=compact_scoreboard)

    def summary(self, league: str, event_id: str, cache: bool = False) -> dict:
        return self.get(f"{LEAGUE_PATH[league]}/summary", {"event": event_id}, cache=cache,
                        compact=lambda d: compact_summary(d, players=league == "NBA"))

    def teams(self, league: str) -> list[dict]:
        params = {"groups": 50, "limit": 400} if league == "CBB" else {"limit": 50}
        d = self.get(f"{LEAGUE_PATH[league]}/teams", params)
        return [t["team"] for t in d["sports"][0]["leagues"][0]["teams"]]

    def prop_bets(self, league: str, event_id: str, cache: bool = False, provider: str = "100") -> list[dict]:
        """DraftKings player and team props from ESPN's core API (provider 100 = DraftKings)."""
        path = f"{LEAGUE_PATH[league]}/events/{event_id}/competitions/{event_id}/odds/{provider}/propBets"
        d = self.get(path, {"lang": "en", "region": "us", "limit": 1000}, cache=cache, compact=compact_props, base=CORE)
        return d.get("items", [])

    def injuries(self) -> dict:
        return self.get("nba/injuries")

    def roster(self, team_id: str) -> dict:
        return self.get(f"nba/teams/{team_id}/roster")


# ---------- payload reduction ----------

def _pick(d: dict | None, keys) -> dict:
    return {k: d[k] for k in keys if d and k in d}


TEAM_KEYS = ("id", "abbreviation", "displayName", "location", "name", "color", "alternateColor", "conferenceId", "logo")
ODDS_KEYS = ("details", "spread", "overUnder", "overOdds", "underOdds", "moneyline", "pointSpread", "total")


def compact_odds(o: dict | None) -> dict | None:
    if not o:
        return None
    out = _pick(o, ODDS_KEYS)
    out["provider"] = _pick(o.get("provider"), ("id", "name", "displayName"))
    for side in ("homeTeamOdds", "awayTeamOdds"):
        if o.get(side):
            out[side] = _pick(o[side], ("moneyLine", "spreadOdds", "teamId"))
    for k in ("moneyline", "pointSpread", "total"):  # drop deep links
        if isinstance(out.get(k), dict):
            out[k] = {side: {when: _pick(v.get(when), ("line", "odds")) for when in ("open", "close") if isinstance(v.get(when), dict)}
                      for side, v in out[k].items() if isinstance(v, dict)}
    return out


def compact_scoreboard(d: dict) -> dict:
    events = []
    for ev in d.get("events", []):
        comps = ev.get("competitions") or []
        if not comps:
            continue
        c = comps[0]
        st = ev.get("status") or c.get("status") or {}
        events.append(dict(
            id=ev["id"], date=ev.get("date") or c.get("date"), season=_pick(ev.get("season"), ("year", "type")),
            status=dict(period=st.get("period"), displayClock=st.get("displayClock"),
                        type=_pick(st.get("type"), ("state", "name", "completed", "shortDetail"))),
            competitions=[dict(
                neutralSite=c.get("neutralSite"), conferenceCompetition=c.get("conferenceCompetition"),
                competitors=[dict(homeAway=x.get("homeAway"), score=x.get("score"),
                                  linescores=[_pick(ls, ("value", "period")) for ls in x.get("linescores") or []],
                                  team=_pick(x.get("team"), TEAM_KEYS)) for x in c.get("competitors", [])],
                odds=[compact_odds(o) for o in (c.get("odds") or [])[:1]])],
        ))
    return dict(events=events)


def _ref_id(ref: dict | None, key: str) -> str | None:
    href = (ref or {}).get("$ref", "")
    if f"/{key}/" not in href:
        return None
    return href.split(f"/{key}/", 1)[1].split("?", 1)[0].split("/", 1)[0]


def compact_props(d: dict) -> dict:
    items = []
    for it in d.get("items", []):
        odds = it.get("odds") or {}
        items.append(dict(
            athlete=_ref_id(it.get("athlete"), "athletes"), team=_ref_id(it.get("team"), "teams"),
            type=(it.get("type") or {}).get("name"),
            line=(it.get("current") or {}).get("target", {}).get("value"), line_open=(it.get("open") or {}).get("target", {}).get("value"),
            price=(odds.get("american") or {}).get("value"), price_open=(odds.get("american") or {}).get("open"),
            last=it.get("lastUpdated"),
        ))
    return dict(items=items)


def compact_summary(d: dict, players: bool = True) -> dict:
    box = d.get("boxscore") or {}
    out = dict(boxscore=dict(teams=[dict(team=_pick(t.get("team"), TEAM_KEYS),
                                         statistics=[_pick(s, ("name", "displayValue")) for s in t.get("statistics", [])])
                                    for t in box.get("teams", [])]),
               pickcenter=[compact_odds(o) for o in (d.get("pickcenter") or [])[:1]],
               header=dict(competitions=[_pick(c, ("neutralSite",)) for c in (d.get("header") or {}).get("competitions", [])[:1]]))
    if players:
        out["boxscore"]["players"] = [
            dict(team=_pick(bp.get("team"), TEAM_KEYS), statistics=[
                dict(keys=g.get("keys"), athletes=[
                    dict(athlete=dict(_pick(a.get("athlete"), ("id", "displayName", "firstName", "lastName", "jersey")),
                                      position=_pick((a.get("athlete") or {}).get("position"), ("abbreviation",)),
                                      headshot=_pick((a.get("athlete") or {}).get("headshot"), ("href",))),
                         stats=a.get("stats"), starter=a.get("starter"), didNotPlay=a.get("didNotPlay"))
                    for a in g.get("athletes", [])]) for g in bp.get("statistics", [])])
            for bp in box.get("players", [])]
    return out
