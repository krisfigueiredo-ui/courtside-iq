"use client";

import Link from "next/link";

import { C, EChart, baseAxis, tooltip } from "@/components/charts/EChart";
import { StatusPill } from "@/components/game/game";
import { PlayerPortrait, RosterBadge, TeamCrest } from "@/components/identity/identity";
import { Badge, DemoBadge, Empty, ErrorState, Panel, PanelHeader, Skeleton, Stat, StatStrip } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import { useSelection } from "@/lib/store";
import { StreakCell } from "@/components/views/StreaksView";
import { useEffect } from "react";
import { num, pct, signed } from "@/lib/format";

export default function TeamView({ id }: { id: string }) {
  const q = useApi<any>(`/api/teams/${id}`);
  const lg = q.data?.team?.league;
  const st = useApi<{ rows: any[] }>(lg ? `/api/performance/streaks?by=team&market=all&league=${lg}` : null);
  const streak = st.data?.rows.find((r) => r.team_id === Number(id));
  const pst = useApi<{ rows: any[] }>(lg === "NBA" ? "/api/performance/streaks?by=player&league=NBA&market=all" : null);
  const pform = pst.data ? new Map<number, any>(pst.data.rows.map((r) => [r.player_id, r.form])) : null;
  const select = useSelection((x) => x.select);
  const team = q.data?.team;
  useEffect(() => {
    if (team) select({ team: { id: team.id, label: team.name } });
  }, [team, select]);
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Skeleton className="h-[500px]" />;
  const t = q.data.team;
  const tr = q.data.trends;
  const w = tr.windows?.["10"];
  const games = tr.games ?? [];
  return (
    <div className="space-y-3">
      <Panel>
        <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
          <TeamCrest team={t} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-fg">{t.name}</h1>
            <div className="text-xs text-muted">
              {t.league === "CBB" ? "NCAA" : "NBA"} · {t.conference_name ?? t.conference}
              {t.division ? ` · ${t.division}` : ""}
              {t.venue ? ` · ${t.venue}` : ""}
            </div>
            <DemoBadge show={tr.is_demo} />
          </div>
        </div>
        {w && (
          <StatStrip>
            <Stat label="ORtg L10" value={num(w.ortg)} />
            <Stat label="DRtg L10" value={num(w.drtg)} />
            <Stat label="Net L10" value={signed(w.ortg - w.drtg)} tone={w.ortg - w.drtg >= 0 ? "gain" : "loss"} />
            <Stat label="Pace L10" value={num(w.pace)} />
            {streak?.results && <Stat label="Straight up" value={streak.results.su.record} sub={<>streak <StreakCell s={streak.results.su.current} /></>} />}
            {streak?.results && <Stat label="ATS vs close" value={streak.results.ats.record} sub={<>streak <StreakCell s={streak.results.ats.current} /></>} />}
            {streak?.results && <Stat label="Over / under" value={streak.results.ou.record} sub={<>streak <StreakCell s={streak.results.ou.current} neutral /></>} />}
            {streak?.model && <Stat label="Model on this team" value={`${streak.model.wins}-${streak.model.losses}`} sub={<>{pct(streak.model.hit_rate, 0)} · streak <StreakCell s={streak.model.current} /></>} />}
          </StatStrip>
        )}
      </Panel>
      <div className="grid gap-3 xl:grid-cols-[1fr_380px]">
        <Panel>
          <PanelHeader eyebrow={`${tr.season ?? ""} · n=${tr.n_season ?? 0}`} title="Margin by game with 5-game rolling net rating" right={<Link href="/research" className="text-xs text-volt-300 hover:underline">Research Lab</Link>} />
          <div className="p-2">
            {games.length ? (
              <EChart range
                height={280}
                option={{
                  grid: { left: 36, right: 16, top: 26, bottom: 30 },
                  legend: { top: 0, textStyle: { color: C.mist4, fontSize: 11 } },
                  tooltip: { ...tooltip },
                  xAxis: { type: "category", data: games.map((g: any) => `${g.date.slice(5, 10)} ${g.home ? "v" : "@"}${g.opponent}`), ...baseAxis, axisLabel: { ...baseAxis.axisLabel, interval: Math.ceil(games.length / 8) } },
                  yAxis: { type: "value", ...baseAxis },
                  series: [
                    { name: "Margin", type: "bar", data: games.map((g: any) => ({ value: g.margin, itemStyle: { color: g.margin >= 0 ? "rgba(34,197,94,0.6)" : "rgba(244,63,94,0.55)" } })) },
                    { name: "Net rtg (r5)", type: "line", smooth: true, showSymbol: false, data: games.map((g: any) => (g.ortg_r5 != null ? g.ortg_r5 - g.drtg_r5 : null)), lineStyle: { color: C.volt, width: 2.5 } },
                  ],
                }}
              />
            ) : (
              <Empty title="No completed games yet this season" />
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader eyebrow="Schedule" title="Upcoming" />
          <ul className="divide-y divide-line/50">
            {q.data.upcoming.map((g: any) => {
              const opp = g.home.id === t.id ? g.away : g.home;
              return (
                <li key={g.id}>
                  <Link href={`/games/${g.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-volt/[0.04]">
                    <span className="w-6 text-xs text-mist-500">{g.home.id === t.id ? "vs" : "@"}</span>
                    <TeamCrest team={opp} size={22} />
                    <span className="flex-1 truncate text-sm text-mist">{opp.name}</span>
                    <StatusPill g={g} />
                  </Link>
                </li>
              );
            })}
            {!q.data.upcoming.length && <Empty title="No upcoming games" />}
          </ul>
        </Panel>
      </div>
      <Panel>
        <PanelHeader eyebrow="Roster" title={t.league === "NBA" ? "Players" : "Roster"} />
        {q.data.roster.length ? (
          <table className="dt w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th className="text-right">#</th>
                {pform && ["G", "MIN", "PTS", "REB", "AST", "PTS vs avg"].map((h) => <th key={h} className="text-right">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...q.data.roster]
                .sort((a: any, b: any) => (pform?.get(b.id)?.stats?.pts?.avg ?? -1) - (pform?.get(a.id)?.stats?.pts?.avg ?? -1))
                .map((p: any) => {
                  const f = pform?.get(p.id);
                  const cur = f?.stats?.pts?.current;
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/players/${p.id}`} className="flex items-center gap-2 text-fg hover:underline">
                          <PlayerPortrait player={p} size={26} /> {p.name}
                        </Link>
                      </td>
                      <td className="text-muted">{p.position ?? "–"}</td>
                      <td className="num text-right text-muted">{p.jersey ?? "–"}</td>
                      {pform && (
                        <>
                          <td className="num text-right">{f?.games ?? "–"}</td>
                          <td className="num text-right">{f ? num(f.minutes, 1) : "–"}</td>
                          <td className="num text-right text-fg">{f ? num(f.stats.pts.avg, 1) : "–"}</td>
                          <td className="num text-right">{f ? num(f.stats.reb.avg, 1) : "–"}</td>
                          <td className="num text-right">{f ? num(f.stats.ast.avg, 1) : "–"}</td>
                          <td className="text-right">
                            <StreakCell s={cur ? `${cur[0] === "A" ? "▲" : "▼"}${cur.slice(1)}` : null} />
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        ) : (
          <Empty title="No roster loaded">{t.league === "CBB" ? "College rosters are not part of the ESPN feed used here." : "Rosters sync from ESPN every six hours."}</Empty>
        )}
      </Panel>
    </div>
  );
}
