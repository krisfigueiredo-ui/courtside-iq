"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import { TeamCrest } from "@/components/identity/identity";
import { BoxScore } from "@/components/live/BoxScore";
import { GameFlow } from "@/components/live/GameFlow";
import { PlayFeed } from "@/components/live/PlayFeed";
import { ShotChart } from "@/components/live/ShotChart";
import { DataTag, Empty, ErrorState, LiveDot, Panel, PanelHeader, Skeleton, Tip } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import { livePace, useEspnGame, type EspnGame } from "@/lib/espn-game";
import { cn, num, pct, periodLabel, signed, spreadLine, timeShort } from "@/lib/format";
import { useTicker } from "@/lib/hooks";
import { usePrefs, useSelection } from "@/lib/store";
import type { Game } from "@/lib/types";

const RANK: Record<string, number> = { live: 0, scheduled: 1, final: 2, postponed: 3 };

function RailRow({ g, active, onClick }: { g: Game; active: boolean; onClick: () => void }) {
  const live = g.status === "live";
  const final = g.status === "final";
  const wp = g.model?.win_prob_home;
  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-hair px-3 py-1.5 text-left text-xs hover:bg-raised", active && "bg-raised shadow-[inset_2px_0_0_rgb(var(--c-accent))]")}
    >
      <div className="grid grid-cols-[16px_minmax(0,1fr)_26px] items-center gap-x-1.5 gap-y-0.5">
        {[
          [g.away, g.away_score],
          [g.home, g.home_score],
        ].map(([t, s]: any) => (
          <div key={t.id} className="contents">
            <TeamCrest team={t} size={16} />
            <span className="truncate text-fg-2">{t.name}</span>
            <span className="num text-right text-fg">{s ?? ""}</span>
          </div>
        ))}
      </div>
      <div className="num w-14 text-right text-2xs leading-4">
        {live ? (
          <span className="inline-flex items-center gap-1 text-live">
            <LiveDot />
            {periodLabel(g.league, g.period, g.clock, g.status)}
          </span>
        ) : final ? (
          <span className="text-subtle">Final</span>
        ) : (
          <span className="text-fg-2">{timeShort(g.start_time)}</span>
        )}
        {wp != null && !final && (
          <div className="text-subtle" title="Model pre-game win probability">
            {wp >= 0.5 ? g.home.abbr : g.away.abbr} {Math.round(Math.max(wp, 1 - wp) * 100)}%
          </div>
        )}
      </div>
    </button>
  );
}

function GameRail({ games, selected, onSelect }: { games: Game[]; selected: number | null; onSelect: (id: number) => void }) {
  const groups = [
    { key: "live", label: "Live" },
    { key: "scheduled", label: "Upcoming" },
    { key: "final", label: "Final" },
  ];
  return (
    <Panel className="xl:sticky xl:top-0 xl:max-h-[calc(100dvh-140px)] xl:overflow-y-auto">
      <PanelHeader title="Games" eyebrow={`${games.length}`} />
      {games.length === 0 && <Empty title="No games in the window" />}
      {groups.map((gr) => {
        const list = games.filter((g) => (gr.key === "scheduled" ? g.status === "scheduled" || g.status === "postponed" : g.status === gr.key));
        if (!list.length) return null;
        return (
          <div key={gr.key}>
            <div className="label sticky top-0 z-[1] border-b border-hair bg-surface px-3 py-1">
              {gr.label} <span className="num">{list.length}</span>
            </div>
            {list.map((g) => (
              <RailRow key={g.id} g={g} active={g.id === selected} onClick={() => onSelect(g.id)} />
            ))}
          </div>
        );
      })}
    </Panel>
  );
}

function Scoreboard({ game, eg, model }: { game: Game; eg?: EspnGame; model: any }) {
  const live = (eg?.state ?? (game.status === "live" ? "in" : game.status === "final" ? "post" : "pre")) === "in";
  const final = eg ? eg.state === "post" : game.status === "final";
  const hs = eg?.home.score ?? game.home_score;
  const as = eg?.away.score ?? game.away_score;
  const pos = eg?.possession;
  const nP = Math.max(eg?.home.periods.length ?? 0, eg?.away.periods.length ?? 0);
  const per = (i: number) => (game.league === "CBB" ? (i < 2 ? `${i + 1}H` : `OT${i - 1}`) : i < 4 ? `Q${i + 1}` : `OT${i - 3}`);
  const side = (t: Game["home"], score: number | null | undefined, espnId: string | undefined, align: "l" | "r") => (
    <div className={cn("flex min-w-0 items-center gap-3", align === "r" && "flex-row-reverse text-right")}>
      <TeamCrest team={t} size={40} />
      <div className="min-w-0">
        <Link href={`/teams/${t.id}`} className="block truncate text-base font-semibold text-fg hover:underline">
          {t.name}
        </Link>
        <div className="text-2xs text-subtle">
          {align === "l" ? "Away" : "Home"}
          {pos && espnId && pos.teamId === espnId && (
            <Tip content={`Possession inferred from the last play: ${pos.basis}`}>
              <span className="ml-1.5 inline-flex items-center gap-1 text-accent">
                <span aria-hidden>●</span> ball
              </span>
            </Tip>
          )}
        </div>
      </div>
      <div className={cn("num ml-auto text-[34px] font-medium leading-none tracking-[-0.02em]", align === "r" && "ml-0 mr-auto", final && hs != null && as != null && (align === "l" ? as < hs : hs < as) ? "text-subtle" : "text-fg")}>
        {score ?? "–"}
      </div>
    </div>
  );
  return (
    <Panel>
      <div className="grid items-center gap-4 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {side(game.away, as, eg?.away.id, "l")}
        <div className="flex flex-col items-center gap-1 text-center">
          {live ? <DataTag kind="live" label={eg?.detail || periodLabel(game.league, game.period, game.clock, game.status) || undefined} /> : final ? <DataTag kind="final" /> : <DataTag kind="scheduled" label={timeShort(game.start_time)} />}
          <div className="num text-2xs text-subtle">
            {game.league === "CBB" ? "NCAA" : "NBA"} · {game.season}
            {game.neutral ? " · neutral" : ""}
          </div>
          {model?.market?.spread_home != null && (
            <div className="num text-2xs text-muted">
              Close {game.home.abbr} {spreadLine(model.market.spread_home)} · O/U {num(model.market.total, 1)}
            </div>
          )}
        </div>
        {side(game.home, hs, eg?.home.id, "r")}
      </div>
      {nP > 0 && (
        <div className="overflow-x-auto border-t border-hair">
          <table className="num mx-auto my-1 text-xs">
            <thead>
              <tr className="text-2xs text-subtle">
                <th className="px-2 text-left font-medium" />
                {Array.from({ length: nP }, (_, i) => (
                  <th key={i} className="w-9 px-2 text-right font-medium">
                    {per(i)}
                  </th>
                ))}
                <th className="w-10 px-2 text-right font-medium">T</th>
              </tr>
            </thead>
            <tbody>
              {[eg!.away, eg!.home].map((t) => (
                <tr key={t.id}>
                  <td className="px-2 text-fg-2">{t.abbr}</td>
                  {Array.from({ length: nP }, (_, i) => (
                    <td key={i} className="px-2 text-right text-fg-2">
                      {t.periods[i] ?? ""}
                    </td>
                  ))}
                  <td className="px-2 text-right text-fg">{t.score ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function StatePanel({ game, eg, model }: { game: Game; eg?: EspnGame; model: any }) {
  const proj = model?.projection;
  const pace = eg ? livePace(eg) : null;
  const expPace = proj?.features?.exp_pace;
  const full = game.league === "CBB" ? 40 : 48;
  const pts = (eg?.home.score ?? 0) + (eg?.away.score ?? 0);
  const rateProj = pace && eg?.state === "in" ? (pts / pace.minutes) * Math.max(full, pace.minutes) : null;
  const wp = proj?.simulation?.win_prob_home;
  const rows: [string, React.ReactNode, string?][] = [
    ["Model pre-game", wp != null ? `${game.home.abbr} ${pct(wp, 0)}` : "—", "Monte Carlo win probability, frozen before tip-off"],
    ["Model score", proj ? `${num(proj.projected.away_score, 0)}–${num(proj.projected.home_score, 0)}` : "—"],
    ["Model spread", proj ? `${game.home.abbr} ${spreadLine(proj.projected.spread_home)}` : "—"],
    ["Closing spread", proj?.market?.spread_home != null ? `${game.home.abbr} ${spreadLine(proj.market.spread_home)}` : "—", "DraftKings via ESPN"],
    ["Model total", proj ? num(proj.projected.total, 1) : "—"],
    ["Closing total", proj?.market?.total != null ? num(proj.market.total, 1) : "—"],
  ];
  const liveRows: [string, React.ReactNode, string?][] = pace
    ? [
        ["Possessions", num(pace.possessions, 1), "FGA − OREB + TOV + 0.44·FTA, averaged over both teams"],
        ["Pace (per game)", `${num(pace.pace, 1)}${expPace ? ` vs ${num(expPace, 1)} exp.` : ""}`, "Possessions per full game at the current rate, against the model's expected pace"],
        ...(rateProj ? [["Total at current rate", num(rateProj, 0), "Straight extrapolation of the scoring rate; not a model forecast"] as [string, React.ReactNode, string?]] : []),
      ]
    : [];
  return (
    <Panel>
      <PanelHeader title="Game state" eyebrow={(eg?.state ?? (game.status === "live" ? "in" : game.status === "final" ? "post" : "pre")) === "in" ? "live" : (eg?.state ?? "") === "post" || game.status === "final" ? "final" : "pre-game"} />
      <dl className="divide-y divide-hair text-sm">
        {[...liveRows, ...rows].map(([k, v, hint]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <dt className="text-muted">{hint ? <Tip content={hint}><span className="underline decoration-dotted decoration-subtle/60 underline-offset-2">{k}</span></Tip> : k}</dt>
            <dd className="num text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      {eg?.venue && (
        <div className="border-t border-hair px-3 py-1.5 text-2xs text-subtle">
          {eg.venue}
          {eg.attendance ? ` · ${eg.attendance.toLocaleString()} att.` : ""}
        </div>
      )}
    </Panel>
  );
}

export function LiveTerminal() {
  const league = usePrefs((s) => s.league);
  const { data, isLoading } = useTicker(league === "ALL" ? undefined : league);
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const select = useSelection((s) => s.select);
  const games = useMemo(
    () => [...(data?.games ?? [])].sort((a, b) => (RANK[a.status] ?? 4) - (RANK[b.status] ?? 4) || Date.parse(a.start_time) - Date.parse(b.start_time)),
    [data],
  );
  const wanted = Number(params.get("game"));
  const game = games.find((g) => g.id === wanted) ?? games[0];
  const model = useApi<any>(game ? `/api/games/${game.id}?n_sims=10000` : null);
  const eg = useEspnGame(game?.league, game?.espn_id, game?.status === "live");
  useEffect(() => {
    if (game) select({ game: { id: game.id, label: `${game.away.abbr} @ ${game.home.abbr}`, league: game.league } });
  }, [game, select]);
  const onSelect = (id: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("game", String(id));
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };
  if (isLoading) return <Skeleton className="h-[60vh]" />;
  if (!game) return <Panel><Empty title="No games in the current window">Live games appear here from tip-off; check the NBA and NCAA tabs for the full schedule.</Empty></Panel>;
  const g = eg.data;
  return (
    <div className="grid gap-3 xl:grid-cols-[272px_minmax(0,1fr)]">
      <div className="hidden xl:block">
        <GameRail games={games} selected={game.id} onSelect={onSelect} />
      </div>
      <div className="xl:hidden">
        <label className="sr-only" htmlFor="game-select">
          Game
        </label>
        <select id="game-select" value={game.id} onChange={(e) => onSelect(Number(e.target.value))} className="h-8 w-full rounded border border-hair bg-surface px-2 text-sm text-fg">
          {games.map((x) => (
            <option key={x.id} value={x.id}>
              {x.status === "live" ? "● " : ""}
              {x.away.abbr} {x.away_score ?? ""} @ {x.home.abbr} {x.home_score ?? ""} · {x.status === "scheduled" ? timeShort(x.start_time) : x.status}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0 space-y-3">
        <Scoreboard game={game} eg={g} model={model.data?.projection ? { market: model.data.projection.market } : null} />
        {eg.isError && <ErrorState error={new Error("ESPN play-by-play is unavailable right now; scores above come from the platform feed.")} />}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Panel>
            <PanelHeader
              title="Win probability and margin"
              eyebrow="ESPN live model · per play"
              right={
                <Link href={`/games/${game.id}`} className="text-xs text-muted hover:text-fg">
                  Full game analysis →
                </Link>
              }
            />
            {g && g.plays.length ? (
              <GameFlow g={g} modelPregame={model.data?.projection?.simulation?.win_prob_home} />
            ) : eg.isLoading ? (
              <Skeleton className="m-3 h-[300px]" />
            ) : (
              <Empty title={game.status === "scheduled" ? `Tip-off ${timeShort(game.start_time)}` : "No play-by-play for this game"}>
                {game.status === "scheduled" ? "The win probability curve, shot chart and play-by-play start with the first possession." : "ESPN did not publish play-by-play for this game."}
              </Empty>
            )}
          </Panel>
          <StatePanel game={game} eg={g} model={model.data} />
        </div>
        {g && g.plays.length > 0 && (
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Shot chart" eyebrow={`${g.away.abbr} and ${g.home.abbr} · field goals`} />
              <ShotChart plays={g.plays} home={g.home} away={g.away} league={game.league} />
            </Panel>
            <Panel>
              <PanelHeader title="Play-by-play" eyebrow={`${g.home.abbr} win prob. swing`} />
              <PlayFeed g={g} height={392} />
            </Panel>
          </div>
        )}
        {g && Object.keys(g.players).length > 0 && (
          <Panel>
            <PanelHeader title="Box score" eyebrow="ESPN" />
            <BoxScore g={g} />
          </Panel>
        )}
        {model.data?.projection && (
          <div className="text-2xs text-subtle">
            Model {model.data.projection.model_version} · margin {signed(model.data.projection.projected.margin, 1)} · data as of{" "}
            {model.data.projection.market?.captured_at ? new Date(model.data.projection.market.captured_at).toLocaleString() : "—"}
          </div>
        )}
      </div>
    </div>
  );
}
