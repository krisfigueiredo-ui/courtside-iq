"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { C, EChart, baseAxis, tooltip } from "@/components/charts/EChart";
import { TeamCrest } from "@/components/identity/identity";
import { DataTable } from "@/components/ui/DataTable";
import { Badge, Empty, Panel, PanelHeader, ResultBadge, Segmented, Skeleton, SourceStamp, Stat, StatStrip, Tip } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import { american, cn, dateShort, dateTime, pct, signed, timeShort } from "@/lib/format";
import { usePrefs } from "@/lib/store";
import type { Game } from "@/lib/types";

export interface PickRow {
  id: string;
  game: Game;
  league: string;
  market: string;
  group: string;
  pick: string;
  line: number | null;
  price: number;
  model_prob: number;
  breakeven: number;
  ev: number;
  tier: "bet" | "lean" | "pass";
  reason: string;
  stake: number;
  evidence: { n: number; wins: number; losses: number; hit: number; roi: number | null; hit_ci: [number, number] } | null;
  player: string | null;
  model_version: string;
  data_as_of: string;
}

const GROUP_LABEL: Record<string, string> = { moneyline: "Moneyline", spread: "Spread", total: "Total", h1_total: "1H total", team_total: "Team total", props: "Player prop" };

export function TierTag({ tier }: { tier: string }) {
  if (tier === "bet") return <Badge className="bg-accent text-accent-fg uppercase tracking-wide">Bet</Badge>;
  if (tier === "lean") return <Badge tone="volt" className="uppercase tracking-wide">Lean</Badge>;
  return <Badge className="uppercase tracking-wide">Pass</Badge>;
}

function Evidence({ e }: { e: PickRow["evidence"] }) {
  if (!e) return <span className="text-subtle">no comparable picks yet</span>;
  return (
    <Tip content={`Past official forecasts in the same league, market and EV range: ${e.wins}-${e.losses}, hit ${pct(e.hit, 1)} (95% CI ${pct(e.hit_ci?.[0], 0)}–${pct(e.hit_ci?.[1], 0)}), flat-stake ROI ${e.roi == null ? "–" : `${(e.roi * 100).toFixed(1)}%`}.`}>
      <span className="num">
        {e.wins}-{e.losses} · <span className={(e.roi ?? 0) > 0 ? "text-pos" : "text-neg"}>{e.roi == null ? "–" : `${e.roi >= 0 ? "+" : ""}${(e.roi * 100).toFixed(1)}%`}</span>
      </span>
    </Tip>
  );
}

const c = createColumnHelper<PickRow>();

/** Today's model picks with stake and the evidence behind each tier. */
export function PicksBoard({ rows, compact }: { rows: PickRow[]; compact?: boolean }) {
  const router = useRouter();
  const cols = [
    c.accessor("tier", { header: "Call", sortingFn: (a, b) => ["pass", "lean", "bet"].indexOf(a.original.tier) - ["pass", "lean", "bet"].indexOf(b.original.tier), cell: ({ getValue }) => <TierTag tier={getValue()} /> }),
    c.accessor("pick", {
      header: "Pick",
      meta: { pin: true },
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-2">
          <TeamCrest team={row.original.game.away} size={16} />
          <span className={cn("truncate", row.original.tier === "pass" ? "text-muted" : "font-medium text-fg")}>{row.original.pick}</span>
        </span>
      ),
    }),
    c.accessor((r) => r.price, { id: "price", header: "Price", meta: { align: "right" }, cell: ({ getValue }) => american(getValue()) }),
    c.accessor((r) => `${r.game.away.abbr} @ ${r.game.home.abbr}`, {
      id: "game",
      header: "Game",
      cell: ({ row }) => (
        <span className="num text-xs text-muted">
          {row.original.game.away.abbr} @ {row.original.game.home.abbr} · {timeShort(row.original.game.start_time)}
        </span>
      ),
    }),
    c.accessor((r) => GROUP_LABEL[r.group] ?? r.group, { id: "market", header: "Market", meta: { filter: "select", label: "markets" } }),
    c.accessor("model_prob", { header: "Model", meta: { align: "right" }, cell: ({ getValue }) => pct(getValue(), 1) }),
    c.accessor("breakeven", { header: "Needs", meta: { align: "right" }, cell: ({ getValue }) => <span className="text-muted">{pct(getValue(), 1)}</span> }),
    c.accessor("ev", { header: "EV", meta: { align: "right" }, cell: ({ getValue }) => <span className={getValue() > 0 ? "text-pos" : "text-muted"}>{signed(getValue() * 100, 1)}%</span> }),
    c.accessor("stake", { header: "Stake", meta: { align: "right" }, cell: ({ getValue }) => (getValue() ? `${getValue()}u` : <span className="text-subtle">–</span>) }),
    ...(compact
      ? []
      : [
          c.accessor((r) => r.evidence?.roi ?? -9, { id: "evidence", header: "Similar past picks", cell: ({ row }) => <Evidence e={row.original.evidence} /> }),
          c.accessor("reason", { header: "Why", enableSorting: false, cell: ({ getValue }) => <span className="text-xs text-muted">{getValue()}</span> }),
        ]),
  ];
  return (
    <DataTable
      data={rows}
      columns={cols as any}
      pageSize={compact ? 8 : 40}
      searchable={!compact}
      initialSort={[{ id: "tier", desc: true }, { id: "ev", desc: true }]}
      onRowClick={(r) => router.push(`/games/${r.game.id}`)}
      minWidth={compact ? 640 : 1080}
      rowClassName={(r) => (r.tier === "bet" ? "bg-accent/[0.04]" : undefined)}
    />
  );
}

function LiveRecord({ league }: { league: string }) {
  const q = useApi<any>(`/api/picks/record${league === "ALL" ? "" : `?league=${league}`}`);
  const r = q.data;
  if (q.isLoading) return <Skeleton className="h-24" />;
  const bet = r?.by_tier?.bet;
  const lean = r?.by_tier?.lean;
  const fmtU = (u?: number) => (u == null ? "–" : `${u >= 0 ? "+" : ""}${u.toFixed(2)}u`);
  return (
    <Panel>
      <PanelHeader
        title="Live record"
        eyebrow={r?.start ? `forecasts frozen before tip-off since ${dateTime(r.start)} · not backtests` : "starts with the first forecast frozen before a game"}
        right={<SourceStamp source="ledger" />}
      />
      <StatStrip className="border-t-0">
        <Stat label="Bets" value={bet ? `${bet.wins}-${bet.losses}${bet.pushes ? `-${bet.pushes}` : ""}` : "0-0"} sub={bet ? `${pct(bet.hit, 1)} · ${fmtU(bet.units)}` : "no graded bets yet"} tone={bet ? (bet.units >= 0 ? "gain" : "loss") : undefined} />
        <Stat label="Leans" value={lean ? `${lean.wins}-${lean.losses}` : "0-0"} sub={lean ? `${pct(lean.hit, 1)} · ${fmtU(lean.units)}` : "no graded leans yet"} />
        <Stat label="All live forecasts" value={r?.overall ? `${r.overall.wins}-${r.overall.losses}` : "0-0"} sub={r?.overall ? `${pct(r.overall.hit, 1)} flat-stake ${fmtU(r.overall.units)}` : "graded after each final"} />
        <Stat label="Waiting on results" value={r?.pending ?? 0} sub="frozen, not yet graded" />
      </StatStrip>
      {!!r?.daily?.length && (
        <EChart
          height={180}
          option={{
            grid: { left: 40, right: 12, top: 14, bottom: 24 },
            tooltip: { ...tooltip },
            xAxis: { ...baseAxis, type: "category", data: r.daily.map((d: any) => d.date.slice(5)) },
            yAxis: { ...baseAxis, type: "value", name: "units" },
            series: [
              { type: "bar", name: "Day", data: r.daily.map((d: any) => ({ value: +d.units.toFixed(2), itemStyle: { color: d.units >= 0 ? C.gain : C.loss } })), barWidth: "40%" },
              { type: "line", name: "Cumulative", data: r.daily.map((d: any) => +d.cumulative_units.toFixed(2)), lineStyle: { color: C.accent, width: 1.75 }, itemStyle: { color: C.accent }, symbolSize: 4 },
            ],
          }}
        />
      )}
    </Panel>
  );
}

export function ModelPicksView() {
  const league = usePrefs((s) => s.league);
  const q = useApi<{ rows: PickRow[]; counts?: Record<string, number>; generated_at: string; rules: any }>(`/api/picks/board${league === "ALL" ? "" : `?league=${league}`}`);
  const rec = useApi<any>(`/api/picks/record${league === "ALL" ? "" : `?league=${league}`}`);
  const [show, setShow] = useState<"calls" | "all">("calls");
  const rows = useMemo(() => (q.data?.rows ?? []).filter((r) => show === "all" || r.tier !== "pass"), [q.data, show]);
  return (
    <div className="space-y-3">
      <LiveRecord league={league} />
      <Panel>
        <PanelHeader
          title="What the model would bet"
          eyebrow={`games in the next 36 hours · ${q.data?.counts?.bet ?? 0} bets · ${q.data?.counts?.lean ?? 0} leans · ${q.data?.counts?.pass ?? 0} passes`}
          right={
            <>
              <Segmented
                size="sm"
                label="Show"
                value={show}
                onChange={setShow}
                options={[
                  { value: "calls", label: "Bets & leans" },
                  { value: "all", label: "Everything" },
                ]}
              />
              <SourceStamp source="DraftKings via ESPN" at={q.data?.generated_at} />
            </>
          }
        />
        <div className="border-b border-hair px-3 py-1.5 text-xs text-muted">
          <span className="font-medium text-fg">Bet</span>: the model shows at least 2% expected value and past picks of the same kind made money over 50+ games.{" "}
          <span className="font-medium text-fg">Lean</span>: positive expected value, not enough history to trust it. <span className="font-medium text-fg">Pass</span>: no edge, or that kind of edge has lost money. Stakes are flat units (bet 1u, lean 0.5u).
        </div>
        {q.isLoading ? <Skeleton className="m-3 h-64" /> : rows.length ? <PicksBoard rows={rows} /> : <Empty title={show === "calls" ? "No bets or leans right now" : "No forecasts for upcoming games yet"}>Forecasts are frozen when lines are posted, inside 30 hours of tip-off. Player props appear once DraftKings posts them.</Empty>}
      </Panel>
      <Panel>
        <PanelHeader title="Live forecasts graded" eyebrow="every real-time forecast, after the final" />
        {rec.data?.recent?.length ? (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="dt w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Call</th>
                  <th>Pick</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Model</th>
                  <th className="text-right">EV</th>
                  <th className="text-right">Actual</th>
                  <th className="text-right">Result</th>
                </tr>
              </thead>
              <tbody>
                {rec.data.recent.map((r: any) => (
                  <tr key={r.id}>
                    <td className="num text-muted">{dateShort(r.date)}</td>
                    <td>{r.tier ? <TierTag tier={r.tier} /> : <span className="text-subtle">–</span>}</td>
                    <td className="text-fg-2">{r.pick}</td>
                    <td className="num text-right">{american(r.price)}</td>
                    <td className="num text-right">{pct(r.model_prob, 0)}</td>
                    <td className="num text-right text-muted">{signed(r.ev * 100, 1)}%</td>
                    <td className="num text-right text-muted">{r.actual ?? "–"}</td>
                    <td className="text-right">
                      <ResultBadge result={r.result} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No live forecasts graded yet">Live tracking started with today&apos;s games. Results appear here after each final.</Empty>
        )}
      </Panel>
      <p className="px-1 text-2xs leading-4 text-subtle">
        These are model outputs, not guarantees: most markets sit near the break-even line and results vary widely over small samples. Never stake money you cannot afford to lose.
        Sports betting is for adults of legal age where it is permitted. If gambling is causing problems, call or text 1-800-GAMBLER.
      </p>
    </div>
  );
}

/** The model's calls for one game, shown under the game header. */
export function GameCalls({ gameId, league }: { gameId: number; league: string }) {
  const q = useApi<{ rows: PickRow[] }>(`/api/picks/board?league=${league}`);
  const rows = (q.data?.rows ?? []).filter((r) => r.game.id === gameId && r.group !== "props");
  if (!rows.length) return null;
  const order = { bet: 0, lean: 1, pass: 2 } as const;
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2">
        <span className="text-xs font-semibold text-fg">Model calls</span>
        {[...rows].sort((a, b) => order[a.tier] - order[b.tier] || b.ev - a.ev).map((r) => (
          <span key={r.id} className="flex items-center gap-1.5 text-sm">
            <TierTag tier={r.tier} />
            <span className={r.tier === "pass" ? "text-muted" : "font-medium text-fg"}>{r.pick}</span>
            <span className="num text-xs text-muted">
              {american(r.price)} · {pct(r.model_prob, 0)} vs {pct(r.breakeven, 0)} · EV {signed(r.ev * 100, 1)}%{r.stake ? ` · ${r.stake}u` : ""}
            </span>
          </span>
        ))}
        <Link href="/picks" className="ml-auto text-xs text-muted hover:text-fg">
          How calls are made →
        </Link>
      </div>
    </Panel>
  );
}
