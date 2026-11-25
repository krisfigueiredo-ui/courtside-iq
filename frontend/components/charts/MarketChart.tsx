"use client";

import {
  ColorType,
  CrosshairMode,
  LineSeries,
  LineType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";

import { token } from "@/components/charts/EChart";
import { usePrefs } from "@/lib/store";

export type MarketKind = "spreads" | "totals" | "h2h";
export interface MovePoint {
  t: string;
  book: string;
  line: number | null;
  price: number;
}

/** American price to implied probability (with vig), for a continuous moneyline axis. */
const implied = (a: number) => (a < 0 ? -a / (-a + 100) : 100 / (a + 100));

const BOOK_COLORS = ["fg2", "info", "warn", "pos", "neg"];

/**
 * Sportsbook line history on TradingView Lightweight Charts: step lines per book, open and close
 * markers, the model's number as a price line, crosshair readout. Moneylines are shown as the
 * home side's implied probability so the axis is continuous.
 */
export function MarketChart({
  points,
  market,
  model,
  height = 240,
  homeAbbr = "Home",
}: {
  points: MovePoint[];
  market: MarketKind;
  model?: number | null;
  height?: number;
  homeAbbr?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const theme = usePrefs((s) => s.theme);
  const [readout, setReadout] = useState<string | null>(null);
  const books = useMemo(() => Array.from(new Set(points.map((p) => p.book))), [points]);
  const val = (p: MovePoint) => (market === "h2h" ? Math.round(implied(p.price) * 1000) / 10 : p.line);
  const fmt = (v: number) => (market === "h2h" ? `${v.toFixed(1)}%` : market === "spreads" ? (v > 0 ? `+${v}` : `${v}`) : `${v}`);

  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: token("subtle"), fontSize: 10.5, fontFamily: "var(--font-geist-mono), monospace", attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: token("hair", 0.8) } },
      rightPriceScale: { borderColor: token("hair"), scaleMargins: { top: 0.18, bottom: 0.12 } },
      timeScale: { borderColor: token("hair"), timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: token("subtle"), labelBackgroundColor: token("edge") },
        horzLine: { color: token("subtle"), labelBackgroundColor: token("edge") },
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    chartRef.current = chart;
    const seriesByBook = new Map<string, ISeriesApi<"Line">>();
    books.forEach((b, i) => {
      const color = token(BOOK_COLORS[i % BOOK_COLORS.length]);
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        lineType: LineType.WithSteps,
        priceLineVisible: false,
        lastValueVisible: true,
        title: books.length > 1 ? b : "",
        priceFormat: { type: "custom", formatter: (v: number) => fmt(Math.round(v * 10) / 10) },
      });
      const seen = new Set<number>();
      const data = points
        .filter((p) => p.book === b && val(p) != null)
        .map((p) => ({ time: Math.floor(Date.parse(p.t) / 1000) as UTCTimestamp, value: val(p)! }))
        .sort((x, y) => x.time - y.time)
        .filter((d) => (seen.has(d.time) ? false : (seen.add(d.time), true)));
      s.setData(data);
      if (data.length) {
        createSeriesMarkers(s, [
          { time: data[0].time, position: "aboveBar", color: token("subtle"), shape: "circle", text: "Open", size: 0.6 },
          ...(data.length > 1 ? [{ time: data[data.length - 1].time, position: "aboveBar" as const, color, shape: "circle" as const, text: "Last", size: 0.6 }] : []),
        ]);
      }
      if (i === 0 && model != null) {
        s.createPriceLine({ price: model, color: token("accent"), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Model" });
      }
      seriesByBook.set(b, s);
    });
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) return setReadout(null);
      const parts: string[] = [];
      for (const [b, s] of seriesByBook) {
        const d = param.seriesData.get(s) as { value?: number } | undefined;
        if (d?.value != null) parts.push(`${books.length > 1 ? `${b} ` : ""}${fmt(d.value)}`);
      }
      const when = new Date((param.time as number) * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      setReadout(`${when} · ${parts.join(" · ")}`);
    });
    return () => {
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, market, model, books, theme]);

  if (!points.some((p) => val(p) != null)) {
    return <div className="flex items-center justify-center text-sm text-subtle" style={{ height }}>No line history for this market.</div>;
  }
  const label = market === "spreads" ? `${homeAbbr} spread` : market === "totals" ? "Total" : `${homeAbbr} moneyline, implied %`;
  return (
    <div className="relative" style={{ height }}>
      <div className="pointer-events-none absolute left-2 top-1 z-[2] flex gap-2 text-2xs">
        <span className="text-subtle">{label}</span>
        {readout && <span className="num text-fg-2">{readout}</span>}
      </div>
      <div ref={el} className="h-full w-full" aria-label={`${label} line history chart`} role="img" />
    </div>
  );
}
