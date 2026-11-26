"use client";

import { C, EChart, token, tooltip } from "@/components/charts/EChart";
import { Panel, PanelHeader } from "@/components/ui/primitives";

const ROWS: { key: string; label: string }[] = [
  { key: "minutes", label: "MIN" },
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "fg3m", label: "3PM" },
  { key: "pra", label: "PRA" },
];

/** Game-by-game heatmap: each cell is the stat in that game, coloured by its deviation from the
 *  player's own average over the games shown (standard deviations). */
export function PlayerHeatmap({ games, n = 20 }: { games: any[]; n?: number }) {
  const last = games.slice(-n);
  if (last.length < 3) return null;
  const stats = ROWS.map((r) => {
    const vals = last.map((g) => Number(g[r.key] ?? 0));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
    return { ...r, vals, mean, sd };
  });
  const data: [number, number, number, number][] = [];
  stats.forEach((s, y) => s.vals.forEach((v, x) => data.push([x, y, Math.max(-2.5, Math.min(2.5, (v - s.mean) / s.sd)), v])));
  return (
    <Panel>
      <PanelHeader title="Game log heatmap" eyebrow={`last ${last.length} games · colour = standard deviations from this window's average`} />
      <EChart
        height={230}
        option={{
          grid: { left: 44, right: 12, top: 8, bottom: 40 },
          tooltip: {
            ...tooltip,
            trigger: "item",
            axisPointer: undefined,
            formatter: (p: any) => {
              const g = last[p.value[0]];
              const s = stats[p.value[1]];
              return `${String(g.date).slice(0, 10)} ${g.home ? "vs" : "@"} ${g.opponent}<br/>${s.label} ${p.value[3]} (avg ${s.mean.toFixed(1)})`;
            },
          },
          xAxis: {
            type: "category",
            data: last.map((g) => `${String(g.date).slice(5, 10)}\n${g.home ? "v" : "@"}${g.opponent}`),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: C.subtle, fontSize: 9.5, interval: 0, fontFamily: "var(--font-geist-mono), monospace" },
            splitArea: { show: false },
          },
          yAxis: { type: "category", inverse: true, data: stats.map((s) => s.label), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: C.muted, fontSize: 10.5 } },
          visualMap: {
            show: false,
            min: -2.5,
            max: 2.5,
            dimension: 2,
            inRange: { color: [token("info"), token("surface"), token("accent")] },
          },
          series: [
            {
              type: "heatmap",
              data,
              label: { show: true, formatter: (p: any) => `${Math.round(p.value[3])}`, color: C.fg, fontSize: 10, fontFamily: "var(--font-geist-mono), monospace" },
              itemStyle: { borderColor: token("canvas"), borderWidth: 2 },
              emphasis: { itemStyle: { borderColor: C.fg, borderWidth: 1 } },
            },
          ],
        }}
      />
    </Panel>
  );
}
