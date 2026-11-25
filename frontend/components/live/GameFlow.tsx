"use client";

import { useMemo } from "react";

import { C, EChart, baseAxis, tooltip } from "@/components/charts/EChart";
import { pairColors } from "@/components/identity/identity";
import type { EspnGame } from "@/lib/espn-game";

/** Win probability (ESPN, per play) over game time, with the score margin underneath and the
 *  model's pre-game probability as a reference line. Crosshair, tooltip and zoom. */
export function GameFlow({ g, modelPregame, height = 340 }: { g: EspnGame; modelPregame?: number | null; height?: number }) {
  const [awayC, homeC] = pairColors({ primary: g.away.color, secondary: g.away.color }, { primary: g.home.color, secondary: g.home.color });
  const series = useMemo(() => {
    const wp: [number, number, string, string][] = [];
    const margin: [number, number][] = [];
    let lastWp: number | null = null;
    for (const p of g.plays) {
      const x = Math.round(p.elapsed * 100) / 100;
      if (p.wp != null) lastWp = p.wp;
      if (lastWp != null) wp.push([x, Math.round(lastWp * 1000) / 10, `${g.away.abbr} ${p.away} – ${p.home} ${g.home.abbr}`, p.text]);
      margin.push([x, p.home - p.away]);
    }
    return { wp, margin };
  }, [g]);
  const total = g.regulationPeriods * g.periodMinutes;
  const maxX = Math.max(total, g.plays[g.plays.length - 1]?.elapsed ?? 0);
  const periodLines = Array.from({ length: Math.ceil(maxX > total ? g.regulationPeriods + (maxX - total) / 5 : g.regulationPeriods) - 1 }, (_, i) =>
    i + 1 < g.regulationPeriods ? (i + 1) * g.periodMinutes : total + (i + 1 - g.regulationPeriods) * 5,
  );
  const hasWp = series.wp.length > 0;
  const fmtMin = (v: number) => {
    const p = v < total ? Math.floor(v / g.periodMinutes) + 1 : g.regulationPeriods + Math.floor((v - total) / 5) + 1;
    return g.league === "CBB" ? (p <= 2 ? `H${p}` : `OT${p - 2}`) : p <= 4 ? `Q${p}` : `OT${p - 4}`;
  };
  return (
    <EChart
      height={height}
      option={{
        grid: [
          { left: 40, right: 12, top: 14, height: "56%" },
          { left: 40, right: 12, top: "70%", bottom: 22 },
        ],
        axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
        tooltip: {
          ...tooltip,
          axisPointer: { type: "line", lineStyle: { color: C.subtle, type: "dashed" } },
          formatter: (ps: any) => {
            const a = Array.isArray(ps) ? ps : [ps];
            const w = a.find((x: any) => x.seriesName === "Home win probability");
            const mg = a.find((x: any) => x.seriesName === "Margin");
            const x = (w ?? mg)?.value?.[0] ?? 0;
            const lines = [`<span style="opacity:.7">${fmtMin(x)} · ${x.toFixed(1)} min</span>`];
            if (w) lines.push(`${w.value[2]}`, `${g.home.abbr} win ${w.value[1].toFixed(1)}%`, `<span style="opacity:.7">${String(w.value[3]).slice(0, 80)}</span>`);
            else if (mg) lines.push(`Margin ${mg.value[1] > 0 ? "+" : ""}${mg.value[1]} ${g.home.abbr}`);
            return lines.join("<br/>");
          },
        },
        xAxis: [
          { ...baseAxis, type: "value", min: 0, max: maxX, gridIndex: 0, axisLabel: { show: false }, splitLine: { show: false } },
          {
            ...baseAxis,
            type: "value",
            min: 0,
            max: maxX,
            gridIndex: 1,
            interval: g.periodMinutes,
            axisLabel: { ...baseAxis.axisLabel, formatter: (v: number) => (v === 0 ? "0'" : `${v}'`) },
            splitLine: { show: false },
          },
        ],
        yAxis: [
          { ...baseAxis, type: "value", min: 0, max: 100, interval: 25, gridIndex: 0, axisLabel: { ...baseAxis.axisLabel, formatter: (v: number) => `${v}` } },
          { ...baseAxis, type: "value", gridIndex: 1, splitNumber: 2, axisLabel: { ...baseAxis.axisLabel, formatter: (v: number) => (v > 0 ? `+${v}` : `${v}`) } },
        ],
        dataZoom: [{ type: "inside", xAxisIndex: [0, 1], filterMode: "none" }],
        series: [
          // shaded areas either side of 50%: home colour above, away colour below
          ...(hasWp
            ? [
                { name: "_home", type: "line" as const, xAxisIndex: 0, yAxisIndex: 0, step: "end" as const, silent: true, showSymbol: false, tooltip: { show: false },
                  data: series.wp.map((d) => [d[0], Math.max(d[1], 50)]), lineStyle: { width: 0 }, areaStyle: { origin: 50, color: homeC, opacity: 0.4 } },
                { name: "_away", type: "line" as const, xAxisIndex: 0, yAxisIndex: 0, step: "end" as const, silent: true, showSymbol: false, tooltip: { show: false },
                  data: series.wp.map((d) => [d[0], Math.min(d[1], 50)]), lineStyle: { width: 0 }, areaStyle: { origin: 50, color: awayC, opacity: 0.4 } },
              ]
            : []),
          {
            name: "Home win probability",
            type: "line",
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: series.wp,
            showSymbol: false,
            step: "end",
            lineStyle: { width: 1.5, color: C.fg },
            itemStyle: { color: C.fg },
            markLine: {
              silent: true,
              symbol: "none",
              label: { color: C.subtle, fontSize: 10, position: "insideEndTop", formatter: (p: any) => p.name ?? "" },
              data: [
                { yAxis: 50, lineStyle: { color: C.edge, type: "solid", width: 1 }, name: "" },
                ...(modelPregame != null ? [{ yAxis: Math.round(modelPregame * 1000) / 10, name: "Model pre-game", lineStyle: { color: C.accent, type: "dashed" as const, width: 1 } }] : []),
                ...periodLines.map((x) => ({ xAxis: x, name: "", lineStyle: { color: C.hair, type: "solid" as const, width: 1 } })),
              ],
            },
          },
          {
            name: "Margin",
            type: "bar",
            xAxisIndex: 1,
            yAxisIndex: 1,
            barWidth: 1,
            data: series.margin.map(([x, v]) => ({ value: [x, v], itemStyle: { color: v >= 0 ? homeC : awayC } })),
          },
        ],
      }}
    />
  );
}
