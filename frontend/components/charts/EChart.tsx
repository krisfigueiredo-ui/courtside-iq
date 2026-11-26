"use client";

import type { EChartsOption } from "echarts";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { usePrefs } from "@/lib/store";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });

/** Read a theme token as a CSS colour string (falls back to dark-theme values during SSR). */
const FALLBACK: Record<string, string> = {
  fg: "234 234 231", fg2: "198 198 194", muted: "150 150 146", subtle: "106 107 104", hair: "37 38 42", edge: "52 54 59",
  surface: "16 17 19", overlay: "28 29 33", accent: "232 119 46", pos: "63 182 139", neg: "229 83 75", warn: "217 164 65", info: "118 156 226", live: "240 70 70",
};
export function token(name: string, alpha = 1): string {
  let v = FALLBACK[name] ?? "128 128 128";
  if (typeof window !== "undefined") {
    const s = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim();
    if (s) v = s;
  }
  // comma syntax: ECharts parses it for colour interpolation (heatmaps, visual maps, gradients)
  const [r, g, b] = v.split(/[\s,]+/).map(Number);
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Palette resolved for the current theme. Recomputed when the theme changes. */
export function palette() {
  return {
    volt: token("accent"), accent: token("accent"), cyan: token("info"), info: token("info"), gain: token("pos"), loss: token("neg"),
    flare: "#A084E8", gold: token("warn"), mist: token("fg"), mist4: token("muted"), mist5: token("subtle"), line: token("hair"),
    ink: token("surface"), violet: "#9B87F5", warn: token("warn"), pos: token("pos"), neg: token("neg"), fg: token("fg"), muted: token("muted"), subtle: token("subtle"), hair: token("hair"), edge: token("edge"),
  };
}

/** Static palette for module-level use; `EChart` re-themes axes and tooltips at render time. */
export const C = palette();
export const SERIES = [C.accent, C.info, C.flare, C.warn, C.gain, C.loss];

export const baseAxis = {
  axisLine: { lineStyle: { color: C.hair } },
  axisTick: { show: false },
  axisLabel: { color: C.subtle, fontSize: 10.5, fontFamily: "var(--font-geist-mono), monospace" },
  splitLine: { lineStyle: { color: C.hair, type: "solid" as const, opacity: 0.6 } },
  nameTextStyle: { color: C.subtle, fontSize: 10.5 },
};

export const tooltip = {
  trigger: "axis" as const,
  confine: true,
  backgroundColor: C.ink,
  borderColor: C.edge,
  borderWidth: 1,
  padding: [6, 8],
  textStyle: { color: C.fg, fontSize: 11.5, fontFamily: "var(--font-geist-sans), sans-serif" },
  axisPointer: { type: "cross" as const, lineStyle: { color: C.subtle, type: "dashed" as const }, crossStyle: { color: C.subtle }, label: { backgroundColor: C.edge, color: C.fg, fontSize: 10.5 } },
  extraCssText: "border-radius:3px;box-shadow:none;",
};

/** Re-resolve theme colours inside an option produced with the static palette. */
function retheme(option: EChartsOption, _dark: boolean): EChartsOption {
  const map = new Map<string, string>();
  const live = palette();
  const stat = C as Record<string, string>;
  for (const k of Object.keys(stat)) if (live[k as keyof typeof live] && stat[k] !== live[k as keyof typeof live]) map.set(stat[k], live[k as keyof typeof live]);
  if (!map.size) return option;
  const walk = (x: any): any => {
    if (typeof x === "string") return map.get(x) ?? x;
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object" && !(x instanceof Date)) {
      const o: any = {};
      for (const [k, v] of Object.entries(x)) o[k] = typeof v === "function" ? v : walk(v);
      return o;
    }
    return x;
  };
  return walk(option);
}

export function EChart({
  option,
  height = 260,
  className,
  onEvents,
  zoom,
  range,
}: {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  onEvents?: Record<string, (p: any) => void>;
  /** adds inside (wheel/drag) zoom on the x axis */
  zoom?: boolean;
  /** adds a range slider under the x axis (date-range selection) plus wheel zoom */
  range?: boolean;
}) {
  const theme = usePrefs((s) => s.theme);
  const [dark, setDark] = useState(true);
  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") !== "light");
  }, [theme]);
  const base: EChartsOption = {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "var(--font-geist-sans), sans-serif", color: C.muted },
    animationDuration: 300,
    grid: { left: 44, right: 14, top: 22, bottom: 26, containLabel: false },
    ...(zoom || range ? { dataZoom: [{ type: "inside", xAxisIndex: 0, filterMode: "none" }] } : {}),
    ...option,
  };
  if (range) {
    base.dataZoom = [
      { type: "inside", xAxisIndex: 0, filterMode: "none" },
      {
        type: "slider", xAxisIndex: 0, height: 14, bottom: 4, filterMode: "none", borderColor: C.hair, backgroundColor: "transparent",
        fillerColor: token("accent", 0.12), dataBackground: { lineStyle: { color: C.edge }, areaStyle: { color: token("edge", 0.3) } },
        selectedDataBackground: { lineStyle: { color: C.accent }, areaStyle: { color: token("accent", 0.15) } },
        handleStyle: { color: C.edge, borderColor: C.subtle }, moveHandleStyle: { color: C.edge }, textStyle: { color: C.subtle, fontSize: 10 },
        brushSelect: false,
      },
    ] as any;
    const g = (base.grid ?? {}) as any;
    if (!Array.isArray(g)) base.grid = { ...g, bottom: (typeof g.bottom === "number" ? g.bottom : 26) + 24 };
  }
  if (base.legend && !Array.isArray(base.legend)) {
    base.legend = { textStyle: { color: C.muted, fontSize: 11 }, itemWidth: 12, itemHeight: 2, icon: "rect", ...(base.legend as object) } as any;
  }
  return (
    <div className={className} style={{ height }}>
      <ReactECharts
        key={dark ? "d" : "l"}
        option={retheme(base, dark)}
        style={{ height: "100%", width: "100%" }}
        notMerge
        lazyUpdate
        opts={{ renderer: "canvas" }}
        onEvents={onEvents}
      />
    </div>
  );
}
