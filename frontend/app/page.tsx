"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";

import { C, EChart, baseAxis, tooltip } from "@/components/charts/EChart";
import { PlayerPortrait, TeamCrest } from "@/components/identity/identity";
import { DataTable } from "@/components/ui/DataTable";
import { TierTag, type PickRow } from "@/components/views/ModelPicksView";
import { Empty, LiveDot, Panel, PanelHeader, ResultBadge, Skeleton, SourceStamp, Stat, StatStrip } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import { MARKET_LABEL, american, cn, num, pct, periodLabel, signed, spreadLine, timeShort } from "@/lib/format";
import { useTicker } from "@/lib/hooks";
import { usePrefs } from "@/lib/store";
import type { BoardRow, PredictionRow, PropProjection } from "@/lib/types";

interface SlateRow {
  r: BoardRow;
  t: number;
  matchup: string;
  league: string;
  winHome: number;
  modelSpread: number;
  closeSpread: number | null;
  dSpread: number | null;
  modelTotal: number;
  closeTotal: number | null;
  dTotal: number | null;
}
const col = createColumnHelper<SlateRow>();
const delta = (v: number | null, big: number) =>
  v == null ? <span className="text-subtle">–</span> : <span className={cn(Math.abs(v) >= big ? "text-accent" : "text-fg-2")}>{signed(v, 1)}</span>;

function Slate({ rows }: { rows: SlateRow[] }) {
  const router = useRouter();
  const cols = [
    col.accessor("t", {
      header: "Tip",
      cell: ({ row }) =>
        row.original.r.game.status === "live" ? (
          <span className="num inline-flex items-center gap-1 text-live">
            <LiveDot />
            {periodLabel(row.original.r.game.league, row.original.r.game.period, row.original.r.game.clock, "live")}
          </span>
        ) : (
          <span className="num text-fg-2">{timeShort(row.original.r.game.start_time)}</span>
        ),
    }),
    col.accessor("matchup", {
      header: "Matchup",
      meta: { pin: true },
      cell: ({ row }) => {
        const g = row.original.r.game;
        return (
          <span className="flex items-center gap-1.5">
            <TeamCrest team={g.away} size={16} />
            <span className="text-fg">{g.away.abbr}</span>
            <span className="text-subtle">@</span>
            <TeamCrest team={g.home} size={16} />
            <span className="text-fg">{g.home.abbr}</span>
            {g.neutral && <span className="text-2xs text-subtle">N</span>}
          </span>
        );
      },
    }),
    col.accessor("league", { header: "Lg", meta: { filter: "select", label: "leagues" } }),
    col.accessor("winHome", { header: "Home win", meta: { align: "right" }, cell: ({ getValue }) => pct(getValue(), 0) }),
    col.accessor("modelSpread", { header: "Model sprd", meta: { align: "right" }, cell: ({ getValue }) => spreadLine(getValue()) }),
    col.accessor("closeSpread", { header: "Market", meta: { align: "right" }, cell: ({ getValue }) => (getValue() == null ? <span className="text-subtle">–</span> : spreadLine(getValue())) }),
    col.accessor("dSpread", { header: "Δ sprd", meta: { align: "right" }, sortingFn: (a, b) => Math.abs(a.original.dSpread ?? 0) - Math.abs(b.original.dSpread ?? 0), cell: ({ getValue }) => delta(getValue(), 3) }),
    col.accessor("modelTotal", { header: "Model tot", meta: { align: "right" }, cell: ({ getValue }) => num(getValue(), 1) }),
    col.accessor("closeTotal", { header: "Market", meta: { align: "right" }, cell: ({ getValue }) => (getValue() == null ? <span className="text-subtle">–</span> : num(getValue(), 1)) }),
    col.accessor("dTotal", { header: "Δ tot", meta: { align: "right" }, sortingFn: (a, b) => Math.abs(a.original.dTotal ?? 0) - Math.abs(b.original.dTotal ?? 0), cell: ({ getValue }) => delta(getValue(), 5) }),
  ];
  return <DataTable data={rows} columns={cols as any} virtual height={430} searchable onRowClick={(r) => router.push(`/games/${r.r.game.id}`)} minWidth={760} />;
}

function Track({ perf }: { perf: any }) {
  if (!perf?.rolling?.length) return <Empty title="No graded forecasts yet" />;
  return (
    <EChart
      height={150}
      option={{
        grid: { left: 34, right: 8, top: 10, bottom: 20 },
        tooltip: { ...tooltip, valueFormatter: (v: any) => `${(Number(v) * 100).toFixed(1)}%` },
        xAxis: { ...baseAxis, type: "category", data: perf.rolling.map((r: any) => r.t.slice(5, 10)), axisLabel: { ...baseAxis.axisLabel, interval: "auto" } },
        yAxis: { ...baseAxis, type: "value", min: 0.3, max: 0.8, axisLabel: { ...baseAxis.axisLabel, formatter: (v: number) => `${Math.round(v * 100)}` } },
        series: [
          {
            type: "line",
            name: `Hit rate (rolling ${perf.rolling_window})`,
            showSymbol: false,
            data: perf.rolling.map((r: any) => r.rate),
            lineStyle: { color: C.accent, width: 1.5 },
            markLine: { silent: true, symbol: "none", data: [{ yAxis: 0.5 }], lineStyle: { color: C.edge }, label: { show: false } },
          },
        ],
      }}
    />
  );
}

function CommandCenter() {
  const league = usePrefs((st) => st.league);
  const q = league === "ALL" ? "" : `?league=${league}`;
  const board = useApi<{ generated_at: string; demo: boolean; games: BoardRow[] }>(`/api/board${q}`, { refetchInterval: 60_000 });
  const perf = useApi<any>(`/api/performance/summary${q}`);
  const recent = useApi<PredictionRow[]>(`/api/predictions?limit=60&settled=true&games_only=true${league === "ALL" ? "" : `&league=${league}`}`);
  const props = useApi<{ props: PropProjection[] }>(league === "CBB" ? null : "/api/props?league=NBA");
  const { data: ticker } = useTicker(league === "ALL" ? undefined : league);
  const picks = useApi<{ rows: PickRow[]; counts?: Record<string, number> }>(`/api/picks/board${q}`);
  const setAi = usePrefs((s) => s.setAiOpen);
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ai") === "1") setAi(true);
  }, [setAi]);

  const rows = useMemo<SlateRow[]>(
    () =>
      (board.data?.games ?? []).map((r) => {
        const close = r.market?.spread_home ?? null;
        const tot = r.market?.total ?? null;
        return {
          r,
          t: Date.parse(r.game.start_time),
          matchup: `${r.game.away.name} ${r.game.home.name} ${r.game.away.abbr} ${r.game.home.abbr}`,
          league: r.game.league === "CBB" ? "NCAA" : "NBA",
          winHome: r.simulation.win_prob_home,
          modelSpread: r.projected.spread_home,
          closeSpread: close,
          dSpread: close == null ? null : r.projected.spread_home - close,
          modelTotal: r.projected.total,
          closeTotal: tot,
          dTotal: tot == null ? null : r.projected.total - tot,
        };
      }),
    [board.data],
  );
  const disagreements = [...rows].filter((x) => x.dSpread != null || x.dTotal != null).sort((a, b) => Math.max(Math.abs(b.dSpread ?? 0), Math.abs(b.dTotal ?? 0) / 2) - Math.max(Math.abs(a.dSpread ?? 0), Math.abs(a.dTotal ?? 0) / 2)).slice(0, 8);
  const live = (ticker?.games ?? []).filter((g) => g.status === "live");
  const total = perf.data?.total;
  const bm = perf.data?.by_market ?? {};
  const nba = rows.filter((r) => r.r.game.league === "NBA").length;
  const cbb = rows.length - nba;

  return (
    <div className="space-y-3">
      <Panel>
        <StatStrip className="border-0">
          <Stat label="On the board" value={rows.length || "–"} sub={`${nba} NBA · ${cbb} NCAA · next 40h`} />
          <Stat label="Live now" value={live.length} tone={live.length ? "loss" : undefined} sub={live[0] ? `${live[0].away.abbr} ${live[0].away_score}–${live[0].home_score} ${live[0].home.abbr}` : "none in progress"} />
          <Stat label="Graded forecasts" value={total ? total.decided.toLocaleString() : "–"} sub={`${perf.data?.pending ?? 0} open`} />
          <Stat label="Moneyline" value={bm.moneyline ? pct(bm.moneyline.win_pct, 1) : "–"} sub={bm.moneyline ? `${bm.moneyline.wins}–${bm.moneyline.losses}` : ""} />
          <Stat label="Spread" value={bm.spread ? pct(bm.spread.win_pct, 1) : "–"} sub={bm.spread ? `${bm.spread.wins}–${bm.spread.losses} vs close` : ""} hint="Against the DraftKings closing line; 52.4% breaks even at −110" />
          <Stat label="Total" value={bm.total ? pct(bm.total.win_pct, 1) : "–"} sub={bm.total ? `${bm.total.wins}–${bm.total.losses} vs close` : ""} />
          <Stat label="ROI, priced picks" value={total?.roi != null ? `${total.roi >= 0 ? "+" : ""}${(total.roi * 100).toFixed(1)}%` : "–"} tone={total?.roi != null ? (total.roi >= 0 ? "gain" : "loss") : undefined} sub="flat 1 unit" />
        </StatStrip>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <PanelHeader title="Slate: model against the market" eyebrow="sort by Δ to find disagreements" right={<SourceStamp source="ESPN · DraftKings" at={board.data?.generated_at} demo={board.data?.demo} />} />
          {board.isLoading ? <Skeleton className="m-3 h-[380px]" /> : rows.length ? <Slate rows={rows} /> : <Empty title="No games in the next 40 hours" />}
        </Panel>
        <div className="space-y-3">
          <Panel>
            <PanelHeader
              title="Model bets now"
              eyebrow={picks.data ? `${picks.data.counts?.bet ?? 0} bets · ${picks.data.counts?.lean ?? 0} leans` : undefined}
              right={<Link href="/picks" className="text-xs text-muted hover:text-fg">All picks →</Link>}
            />
            <div className="divide-y divide-hair">
              {(picks.data?.rows ?? [])
                .filter((r) => r.tier !== "pass")
                .sort((a, b) => (a.tier === b.tier ? b.ev - a.ev : a.tier === "bet" ? -1 : 1))
                .slice(0, 8)
                .map((r) => (
                  <Link key={r.id} href={`/games/${r.game.id}`} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 hover:bg-raised">
                    <TierTag tier={r.tier} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">
                        {r.pick} <span className="num font-normal text-muted">{american(r.price)}</span>
                      </span>
                      <span className="num block truncate text-2xs text-subtle">
                        {r.game.away.abbr} @ {r.game.home.abbr} · {timeShort(r.game.start_time)} · model {pct(r.model_prob, 0)} vs {pct(r.breakeven, 0)} needed
                      </span>
                    </span>
                    <span className="num text-right text-xs text-pos">
                      {signed(r.ev * 100, 1)}%<span className="block text-2xs text-subtle">{r.stake}u</span>
                    </span>
                  </Link>
                ))}
              {picks.data && !(picks.data.rows ?? []).some((r) => r.tier !== "pass") && (
                <Empty title="No bets right now">Every current forecast is a pass: no edge, or no record of that edge paying. That is a valid answer.</Empty>
              )}
              {!picks.data && <Skeleton className="m-3 h-40" />}
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Track record" eyebrow={perf.data?.rolling_window ? `rolling ${perf.data.rolling_window} forecasts` : undefined} right={<Link href="/picks" className="text-xs text-muted hover:text-fg">Picks →</Link>} />
            <div className="px-1 pt-1">
              <Track perf={perf.data} />
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Latest graded forecasts" right={<Link href="/picks?tab=archive" className="text-xs text-muted hover:text-fg">Archive →</Link>} />
          <div className="max-h-[320px] divide-y divide-hair overflow-y-auto">
            {(recent.data ?? []).slice(0, 30).map((p) => (
              <Link key={p.id} href={`/games/${p.game_id}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-1.5 text-sm hover:bg-raised">
                <span className="min-w-0 truncate text-fg-2">
                  {p.away.abbr} @ {p.home.abbr} <span className="text-subtle">· {MARKET_LABEL[p.market] ?? p.market}</span>
                </span>
                <span className="num text-xs text-muted">
                  {p.selection} {p.line != null ? p.line : ""} · {pct(p.predicted_prob, 0)}
                </span>
                <ResultBadge result={p.result} />
              </Link>
            ))}
            {!recent.isLoading && !(recent.data ?? []).length && <Empty title="No graded forecasts yet" />}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Projected scorers, next 30 hours" eyebrow="NBA · model mean, 80% range" right={<Link href="/markets?tab=props" className="text-xs text-muted hover:text-fg">Props →</Link>} />
          <div className="max-h-[320px] divide-y divide-hair overflow-y-auto">
            {[...(props.data?.props ?? [])]
              .filter((p) => !p.injury_out && p.markets.pts && p.player && p.game)
              .sort((a, b) => b.markets.pts.mean - a.markets.pts.mean)
              .slice(0, 30)
              .map((p) => (
                <Link key={`${p.player!.id}-${p.game!.id}`} href={`/players/${p.player!.id}`} className="grid grid-cols-[28px_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-1 text-sm hover:bg-raised">
                  <PlayerPortrait player={p.player!} size={26} />
                  <span className="min-w-0 truncate text-fg-2">
                    {p.player!.name} <span className="text-2xs text-subtle">{p.player!.team?.abbr}</span>
                  </span>
                  <span className="num text-fg">{num(p.markets.pts.mean, 1)}</span>
                  <span className="num w-16 text-right text-2xs text-subtle">
                    {num(p.markets.pts.p10, 0)}–{num(p.markets.pts.p90, 0)}
                  </span>
                </Link>
              ))}
            {league === "CBB" && <Empty title="Player projections cover the NBA" />}
            {league !== "CBB" && !props.isLoading && !(props.data?.props ?? []).length && <Empty title="No player projections in the next 30 hours" />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh]" />}>
      <CommandCenter />
    </Suspense>
  );
}
