"use client";

import { useState } from "react";

import { C, EChart, baseAxis, tooltip } from "@/components/charts/EChart";
import { Empty, Panel, PanelHeader, Segmented, Skeleton, Stat, StatStrip } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import { num, signed } from "@/lib/format";

const LABEL: Record<string, string> = {
  margin: "Margin", total: "Total", h1_total: "1H total", team_total: "Team total",
  points: "Points", rebounds: "Rebounds", assists: "Assists", threes: "Threes", pra: "PRA",
};
const ORDER = ["margin", "total", "h1_total", "team_total", "points", "rebounds", "assists", "threes", "pra"];

/** Point-forecast residuals (actual − predicted) of graded pre-game forecasts: distribution,
 *  predicted vs actual with binned means, and bias over time. */
export function ResidualsView({ league }: { league: string }) {
  const q = useApi<{ groups: Record<string, any>; note?: string }>(`/api/performance/residuals?league=${league}`);
  const keys = ORDER.filter((k) => q.data?.groups?.[k]);
  const [sel, setSel] = useState<string>("margin");
  const key = keys.includes(sel) ? sel : keys[0];
  const g = key ? q.data!.groups[key] : null;
  return (
    <Panel>
      <PanelHeader
        title="Residual analysis"
        eyebrow="graded pre-game forecasts · actual − predicted"
        right={keys.length ? <Segmented size="sm" label="Target" value={key} onChange={setSel} options={keys.map((k) => ({ value: k, label: LABEL[k] ?? k }))} /> : undefined}
      />
      {q.isLoading ? (
        <Skeleton className="m-3 h-72" />
      ) : !g ? (
        <Empty title="No graded forecasts with point predictions yet" />
      ) : (
        <>
          <StatStrip className="border-t-0">
            <Stat label="Forecasts" value={g.n.toLocaleString()} />
            <Stat label="Bias" value={signed(g.bias, 2)} tone={Math.abs(g.bias) > g.sd / Math.sqrt(g.n) * 2 ? "flare" : undefined} hint="Mean of actual − predicted. Highlighted when more than two standard errors from zero." />
            <Stat label="MAE" value={num(g.mae, 2)} />
            <Stat label="RMSE" value={num(g.rmse, 2)} />
            <Stat label="Residual SD" value={num(g.sd, 2)} />
          </StatStrip>
          <div className="grid gap-px bg-hair lg:grid-cols-3">
            <div className="bg-surface p-2">
              <div className="label px-1">Distribution</div>
              <EChart
                height={230}
                option={{
                  grid: { left: 36, right: 8, top: 14, bottom: 24 },
                  tooltip: { ...tooltip, axisPointer: { type: "shadow" } },
                  xAxis: { ...baseAxis, type: "category", data: g.histogram.map((h: any) => h.x), axisLabel: { ...baseAxis.axisLabel, interval: Math.ceil(g.histogram.length / 7) } },
                  yAxis: { ...baseAxis, type: "value" },
                  series: [{ type: "bar", name: "Forecasts", barWidth: "92%", data: g.histogram.map((h: any) => ({ value: h.count, itemStyle: { color: h.x < 0 ? C.info : C.accent } })) }],
                }}
              />
            </div>
            <div className="bg-surface p-2">
              <div className="label px-1">Predicted vs actual</div>
              <EChart
                height={230}
                option={{
                  grid: { left: 40, right: 10, top: 14, bottom: 28 },
                  tooltip: { ...tooltip, trigger: "item", formatter: (p: any) => `pred ${num(p.value[0], 1)} · actual ${num(p.value[1], 1)}` },
                  xAxis: { ...baseAxis, type: "value", scale: true, name: "predicted", nameLocation: "middle", nameGap: 18 },
                  yAxis: { ...baseAxis, type: "value", scale: true },
                  series: [
                    { type: "scatter", name: "Forecast", symbolSize: 3, data: g.points.map((p: any) => [p.pred, p.actual]), itemStyle: { color: C.subtle, opacity: 0.55 } },
                    { type: "line", name: "Binned mean", data: g.by_predicted.map((b: any) => [b.pred, b.actual]), lineStyle: { color: C.accent, width: 1.75 }, itemStyle: { color: C.accent }, symbolSize: 5 },
                    {
                      type: "line",
                      name: "y = x",
                      silent: true,
                      showSymbol: false,
                      data: (() => {
                        const xs = g.points.map((p: any) => p.pred);
                        const lo = Math.min(...xs);
                        const hi = Math.max(...xs);
                        return [[lo, lo], [hi, hi]];
                      })(),
                      lineStyle: { color: C.edge, type: "dashed", width: 1 },
                    },
                  ],
                }}
              />
            </div>
            <div className="bg-surface p-2">
              <div className="label px-1">Bias by month</div>
              <EChart
                height={230}
                option={{
                  grid: { left: 36, right: 8, top: 14, bottom: 24 },
                  tooltip: { ...tooltip, axisPointer: { type: "shadow" }, formatter: (ps: any) => { const p = Array.isArray(ps) ? ps[0] : ps; const m = g.monthly[p.dataIndex]; return `${m.month}<br/>bias ${signed(m.bias, 2)} · n ${m.n}`; } },
                  xAxis: { ...baseAxis, type: "category", data: g.monthly.map((m: any) => m.month) },
                  yAxis: { ...baseAxis, type: "value" },
                  series: [{ type: "bar", barWidth: "55%", data: g.monthly.map((m: any) => ({ value: +m.bias.toFixed(2), itemStyle: { color: m.bias >= 0 ? C.accent : C.info } })) }],
                }}
              />
            </div>
          </div>
          <div className="border-t border-hair px-3 py-1.5 text-2xs text-subtle">{q.data?.note}</div>
        </>
      )}
    </Panel>
  );
}
