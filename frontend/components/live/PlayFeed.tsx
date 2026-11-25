"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";

import { Segmented } from "@/components/ui/primitives";
import type { EspnGame, Play } from "@/lib/espn-game";
import { cn } from "@/lib/format";

/** Play-by-play, newest first, virtualised. Scoring plays carry the running score and the swing in
 *  ESPN's home win probability. */
export function PlayFeed({ g, height = 380 }: { g: EspnGame; height?: number }) {
  const [filter, setFilter] = useState<"scoring" | "all" | "shots">("scoring");
  const rows = useMemo(() => {
    const out: (Play & { dwp: number | null })[] = [];
    let prev: number | null = null;
    for (const p of g.plays) {
      const dwp = p.wp != null && prev != null ? p.wp - prev : null;
      if (p.wp != null) prev = p.wp;
      out.push({ ...p, dwp });
    }
    return out
      .filter((p) => (filter === "all" ? true : filter === "scoring" ? p.scoring : p.shooting))
      .reverse();
  }, [g, filter]);
  const ref = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => ref.current, estimateSize: () => 30, overscan: 10 });
  const per = (p: number) => (g.league === "CBB" ? (p <= 2 ? `H${p}` : `OT${p - 2}`) : p <= 4 ? `Q${p}` : `OT${p - 4}`);
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-hair px-3 py-1.5">
        <Segmented
          size="sm"
          label="Plays"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "scoring", label: "Scoring" },
            { value: "shots", label: "Shots" },
            { value: "all", label: "All" },
          ]}
        />
        <span className="num ml-auto text-2xs text-subtle">{rows.length} plays</span>
      </div>
      <div ref={ref} className="overflow-y-auto" style={{ height }}>
        {rows.length === 0 && <div className="px-3 py-8 text-center text-sm text-subtle">No plays yet.</div>}
        <div style={{ height: v.getTotalSize(), position: "relative" }}>
          {v.getVirtualItems().map((it) => {
            const p = rows[it.index];
            const isHome = p.teamId === g.home.id;
            const color = p.teamId ? (isHome ? g.home.color : g.away.color) : "transparent";
            return (
              <div
                key={p.id}
                data-index={it.index}
                ref={v.measureElement}
                className="absolute inset-x-0 grid grid-cols-[52px_minmax(0,1fr)_64px_44px] items-start gap-2 border-b border-hair/60 px-3 py-1.5 text-xs"
                style={{ transform: `translateY(${it.start}px)` }}
              >
                <span className="num text-subtle">
                  {per(p.period)} {p.clock}
                </span>
                <span className={cn("min-w-0 border-l-2 pl-2", p.scoring ? "text-fg" : "text-muted")} style={{ borderColor: color }}>
                  {p.text}
                </span>
                <span className={cn("num text-right", p.scoring ? "text-fg" : "text-subtle")}>
                  {p.away}–{p.home}
                </span>
                <span className={cn("num text-right text-2xs", p.dwp == null || Math.abs(p.dwp) < 0.005 ? "text-subtle" : p.dwp > 0 ? "text-pos" : "text-neg")} title={`${g.home.abbr} win probability change (ESPN)`}>
                  {p.dwp == null || Math.abs(p.dwp) < 0.005 ? "" : `${p.dwp > 0 ? "+" : ""}${(p.dwp * 100).toFixed(1)}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
