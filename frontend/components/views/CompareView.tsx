"use client";

import { useMemo, useState } from "react";

import { C, EChart, baseAxis, tooltip } from "@/components/charts/EChart";
import { PlayerPortrait, TeamCrest, pairColors } from "@/components/identity/identity";
import { Empty, Panel, PanelHeader, Segmented, Skeleton } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import { cn, num } from "@/lib/format";
import type { Player, Team } from "@/lib/types";

/* Side-by-side comparison of two teams or two players from season box scores. Each metric row
   marks the better side; charts overlay both game logs on the same axes. */

function Row({ label, a, b, fmt = (v: number) => num(v, 1), better = "high" }: { label: string; a: number | null | undefined; b: number | null | undefined; fmt?: (v: number) => string; better?: "high" | "low" | "none" }) {
  const win = a == null || b == null || better === "none" || a === b ? null : (better === "high" ? a > b : a < b) ? "a" : "b";
  return (
    <tr className="border-b border-hair/70">
      <td className={cn("num py-1.5 pr-3 text-right", win === "a" ? "text-fg" : "text-muted")}>{a == null ? "–" : fmt(a)}</td>
      <td className="py-1.5 text-center text-xs text-subtle">{label}</td>
      <td className={cn("num py-1.5 pl-3", win === "b" ? "text-fg" : "text-muted")}>{b == null ? "–" : fmt(b)}</td>
    </tr>
  );
}

function TeamPicker({ teams, value, onChange, label }: { teams: Team[]; value: number | null; onChange: (id: number) => void; label: string }) {
  return (
    <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} className="h-8 w-full rounded border border-hair bg-surface px-2 text-sm text-fg">
      <option value="">{label}</option>
      {(["NBA", "CBB"] as const).map((lg) => (
        <optgroup key={lg} label={lg === "CBB" ? "NCAA" : "NBA"}>
          {teams
            .filter((t) => t.league === lg)
            .sort((x, y) => x.name.localeCompare(y.name))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

function TeamsCompare() {
  const teams = useApi<Team[]>("/api/teams");
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const ta = teams.data?.find((t) => t.id === a) ?? teams.data?.find((t) => t.abbr === "OKC");
  const tb = teams.data?.find((t) => t.id === b) ?? teams.data?.find((t) => t.abbr === "DEN");
  const tra = useApi<any>(ta ? `/api/trends/team/${ta.id}` : null);
  const trb = useApi<any>(tb ? `/api/trends/team/${tb.id}` : null);
  const lgA = useApi<{ rows: any[] }>(ta ? `/api/trends/league/${ta.league}` : null);
  const lgB = useApi<{ rows: any[] }>(tb ? `/api/trends/league/${tb.league}` : null);
  if (!teams.data) return <Skeleton className="h-96" />;
  const ra = lgA.data?.rows.find((r) => r.team_id === ta?.id);
  const rb = lgB.data?.rows.find((r) => r.team_id === tb?.id);
  const wa = tra.data?.windows?.["10"];
  const wb = trb.data?.windows?.["10"];
  const [ca, cb] = ta && tb ? pairColors(ta, tb) : [C.accent, C.info];
  const season = (tr: any) => (tr?.games ?? []).filter((g: any) => g.season === tr?.season);
  const ga = season(tra.data);
  const gb = season(trb.data);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <TeamPicker teams={teams.data} value={ta?.id ?? null} onChange={setA} label="First team" />
        <TeamPicker teams={teams.data} value={tb?.id ?? null} onChange={setB} label="Second team" />
      </div>
      {ta && tb && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Panel>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-hair px-3 py-2">
              <span className="flex items-center justify-end gap-2 text-sm font-semibold text-fg">
                {ta.abbr} <TeamCrest team={ta} size={28} />
              </span>
              <span className="text-2xs text-subtle">vs</span>
              <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                <TeamCrest team={tb} size={28} /> {tb.abbr}
              </span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                <Row label="Record" a={ra?.wins} b={rb?.wins} fmt={(v) => `${v}`} />
                <Row label="Offensive rating" a={ra?.ortg} b={rb?.ortg} />
                <Row label="Defensive rating" a={ra?.drtg} b={rb?.drtg} better="low" />
                <Row label="Net rating" a={ra?.net} b={rb?.net} fmt={(v) => `${v > 0 ? "+" : ""}${num(v, 1)}`} />
                <Row label="Pace" a={ra?.pace} b={rb?.pace} better="none" />
                <Row label="eFG%" a={ra?.efg != null ? ra.efg * 100 : null} b={rb?.efg != null ? rb.efg * 100 : null} />
                <Row label="Turnover %" a={ra?.tov != null ? ra.tov * 100 : null} b={rb?.tov != null ? rb.tov * 100 : null} better="low" />
                <Row label="Margin, last 10" a={wa?.margin} b={wb?.margin} fmt={(v) => `${v > 0 ? "+" : ""}${num(v, 1)}`} />
                <Row label="ATS cover, last 10" a={wa?.ats?.cover} b={wb?.ats?.cover} fmt={(v) => `${v}/10`} />
                <Row label="Overs, last 10" a={wa?.ou?.over} b={wb?.ou?.over} fmt={(v) => `${v}/10`} better="none" />
              </tbody>
            </table>
            <div className="px-3 py-1.5 text-2xs text-subtle">
              Season {ra?.season ?? "–"} · {ta.league !== tb.league ? "different leagues: ratings are on each league's own scale" : "ratings per 100 possessions"}
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Net rating by game" eyebrow="rolling 5-game · season to date" />
            {ga.length || gb.length ? (
              <EChart
                height={320}
                zoom
                option={{
                  tooltip: { ...tooltip },
                  legend: { top: 0, right: 8, data: [ta.abbr, tb.abbr] },
                  grid: { left: 40, right: 14, top: 28, bottom: 26 },
                  xAxis: { ...baseAxis, type: "category", name: "game #", nameGap: 4, nameLocation: "end", data: Array.from({ length: Math.max(ga.length, gb.length) }, (_, i) => i + 1) },
                  yAxis: { ...baseAxis, type: "value", name: "ORtg − DRtg" },
                  series: [
                    { name: ta.abbr, type: "line", showSymbol: false, data: ga.map((g: any) => +(g.ortg_r5 - g.drtg_r5).toFixed(1)), lineStyle: { color: ca, width: 1.75 }, itemStyle: { color: ca } },
                    { name: tb.abbr, type: "line", showSymbol: false, data: gb.map((g: any) => +(g.ortg_r5 - g.drtg_r5).toFixed(1)), lineStyle: { color: cb, width: 1.75 }, itemStyle: { color: cb } },
                    { name: "zero", type: "line", data: [], markLine: { silent: true, symbol: "none", lineStyle: { color: C.edge }, data: [{ yAxis: 0 }], label: { show: false } } },
                  ],
                }}
              />
            ) : (
              <Empty title="No games yet this season" />
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function PlayersCompare() {
  const players = useApi<Player[]>("/api/players?league=NBA");
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [stat, setStat] = useState<"pts" | "reb" | "ast" | "pra">("pts");
  const sorted = useMemo(() => [...(players.data ?? [])].sort((x, y) => x.name.localeCompare(y.name)), [players.data]);
  const pa = sorted.find((p) => p.id === a) ?? sorted.find((p) => p.name === "Shai Gilgeous-Alexander") ?? sorted[0];
  const pb = sorted.find((p) => p.id === b) ?? sorted.find((p) => p.name === "Nikola Jokic") ?? sorted[1];
  const tra = useApi<any>(pa ? `/api/trends/player/${pa.id}` : null);
  const trb = useApi<any>(pb ? `/api/trends/player/${pb.id}` : null);
  if (!players.data) return <Skeleton className="h-96" />;
  const pick = (value: number | undefined, set: (n: number) => void, label: string) => (
    <select aria-label={label} value={value ?? ""} onChange={(e) => set(Number(e.target.value))} className="h-8 w-full rounded border border-hair bg-surface px-2 text-sm text-fg">
      {sorted.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} {p.team ? `· ${p.team.abbr}` : ""}
        </option>
      ))}
    </select>
  );
  const last = (tr: any) => (tr?.games ?? []).slice(-20);
  const wa = tra.data?.windows;
  const wb = trb.data?.windows;
  const [ca, cb] = pa?.team && pb?.team ? pairColors(pa.team, pb.team) : [C.accent, C.info];
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {pick(pa?.id, setA, "First player")}
        {pick(pb?.id, setB, "Second player")}
      </div>
      {pa && pb && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Panel>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-hair px-3 py-2">
              <span className="flex items-center justify-end gap-2 text-sm font-semibold text-fg">
                <span className="truncate">{pa.name}</span> <PlayerPortrait player={pa} size={34} />
              </span>
              <span className="text-2xs text-subtle">vs</span>
              <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                <PlayerPortrait player={pb} size={34} /> <span className="truncate">{pb.name}</span>
              </span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {(["5", "10", "20"] as const).flatMap((w) => [
                  <tr key={`h${w}`}>
                    <td colSpan={3} className="label bg-raised/60 px-3 py-1 text-center">
                      Last {w} games
                    </td>
                  </tr>,
                  <Row key={`p${w}`} label="Points" a={wa?.[w]?.pts} b={wb?.[w]?.pts} />,
                  <Row key={`r${w}`} label="Rebounds" a={wa?.[w]?.reb} b={wb?.[w]?.reb} />,
                  <Row key={`a${w}`} label="Assists" a={wa?.[w]?.ast} b={wb?.[w]?.ast} />,
                  <Row key={`m${w}`} label="Minutes" a={wa?.[w]?.minutes} b={wb?.[w]?.minutes} better="none" />,
                ])}
              </tbody>
            </table>
          </Panel>
          <Panel>
            <PanelHeader
              title="Game log"
              eyebrow="last 20 games"
              right={
                <Segmented
                  size="sm"
                  value={stat}
                  onChange={setStat}
                  options={[
                    { value: "pts", label: "PTS" },
                    { value: "reb", label: "REB" },
                    { value: "ast", label: "AST" },
                    { value: "pra", label: "PRA" },
                  ]}
                />
              }
            />
            <EChart
              height={320}
              option={{
                tooltip: { ...tooltip },
                legend: { top: 0, right: 8, data: [pa.name, pb.name] },
                grid: { left: 36, right: 14, top: 28, bottom: 26 },
                xAxis: { ...baseAxis, type: "category", data: Array.from({ length: 20 }, (_, i) => `${i - 19 || "last"}`) },
                yAxis: { ...baseAxis, type: "value" },
                series: [
                  { name: pa.name, type: "bar", barGap: "10%", data: last(tra.data).map((g: any) => g[stat]), itemStyle: { color: ca } },
                  { name: pb.name, type: "bar", data: last(trb.data).map((g: any) => g[stat]), itemStyle: { color: cb } },
                ],
              }}
            />
          </Panel>
        </div>
      )}
    </div>
  );
}

export function CompareView() {
  const [kind, setKind] = useState<"teams" | "players">("teams");
  return (
    <div className="space-y-3">
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "teams", label: "Teams" },
          { value: "players", label: "Players" },
        ]}
      />
      {kind === "teams" ? <TeamsCompare /> : <PlayersCompare />}
    </div>
  );
}
