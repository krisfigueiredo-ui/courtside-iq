"use client";

import { useMemo, useState } from "react";

import { Segmented } from "@/components/ui/primitives";
import type { Play, SideInfo } from "@/lib/espn-game";
import { cn } from "@/lib/format";

/* Half-court shot chart from ESPN play-by-play coordinates (feet; rim at x=25, y=1).
   Court geometry follows NBA or NCAA men's dimensions. */
const RIM = { x: 25, y: 1 };
const BASELINE = RIM.y - 5.25;
const GEO = {
  NBA: { arc: 23.75, corner: 22, laneW: 16, ftY: BASELINE + 19 },
  CBB: { arc: 22.15, corner: 21.65, laneW: 12, ftY: BASELINE + 19 },
};

type Zone = "Rim" | "Paint" | "Mid-range" | "Corner 3" | "Above-break 3";
export function shotZone(p: Play, league: string): Zone {
  const g = GEO[league === "CBB" ? "CBB" : "NBA"];
  const dx = (p.x ?? 25) - RIM.x;
  const dy = (p.y ?? 1) - RIM.y;
  const dist = Math.hypot(dx, dy);
  const three = /three point|3-pt|3pt/i.test(p.text) || p.points === 3;
  if (three) return (p.y ?? 0) < BASELINE + 14 && Math.abs(dx) >= g.corner - 0.5 ? "Corner 3" : "Above-break 3";
  if (dist < 4.5) return "Rim";
  if (Math.abs(dx) <= g.laneW / 2 && (p.y ?? 0) <= g.ftY) return "Paint";
  return "Mid-range";
}

function Court({ league }: { league: string }) {
  const g = GEO[league === "CBB" ? "CBB" : "NBA"];
  const cornerY = BASELINE + 14;
  const theta = Math.asin(g.corner / g.arc);
  const arcStartY = RIM.y + g.arc * Math.cos(theta);
  const half = BASELINE + 47;
  return (
    <g fill="none" stroke="currentColor" strokeWidth={0.18} className="text-edge">
      <rect x={0} y={BASELINE} width={50} height={47} />
      <line x1={25 - 3} y1={BASELINE + 4} x2={25 + 3} y2={BASELINE + 4} strokeWidth={0.3} />
      <circle cx={RIM.x} cy={RIM.y} r={0.75} />
      <path d={`M ${25 - 4} ${RIM.y} A 4 4 0 0 0 ${25 + 4} ${RIM.y}`} />
      <rect x={25 - g.laneW / 2} y={BASELINE} width={g.laneW} height={g.ftY - BASELINE} />
      <circle cx={25} cy={g.ftY} r={6} />
      <line x1={25 - g.corner} y1={BASELINE} x2={25 - g.corner} y2={Math.min(cornerY, arcStartY)} />
      <line x1={25 + g.corner} y1={BASELINE} x2={25 + g.corner} y2={Math.min(cornerY, arcStartY)} />
      <path d={`M ${25 - g.corner} ${arcStartY} A ${g.arc} ${g.arc} 0 0 0 ${25 + g.corner} ${arcStartY}`} />
      <path d={`M ${25 - 6} ${half} A 6 6 0 0 1 ${25 + 6} ${half}`} />
    </g>
  );
}

export function ShotChart({ plays, home, away, league, height = 380 }: { plays: Play[]; home: SideInfo; away: SideInfo; league: string; height?: number }) {
  const [team, setTeam] = useState<"both" | "away" | "home">("both");
  const [result, setResult] = useState<"all" | "made" | "missed">("all");
  const [hover, setHover] = useState<Play | null>(null);
  const shots = useMemo(() => plays.filter((p) => p.shooting && !p.freeThrow && p.x != null && p.y != null), [plays]);
  const shown = shots.filter(
    (p) => (team === "both" || p.teamId === (team === "home" ? home.id : away.id)) && (result === "all" || (result === "made") === p.made),
  );
  const colorOf = (p: Play) => (p.teamId === home.id ? home.color : away.color);
  const zones = useMemo(() => {
    const out: Record<string, Record<Zone, { m: number; a: number }>> = {};
    for (const s of shots) {
      const k = s.teamId ?? "";
      out[k] ??= { Rim: { m: 0, a: 0 }, Paint: { m: 0, a: 0 }, "Mid-range": { m: 0, a: 0 }, "Corner 3": { m: 0, a: 0 }, "Above-break 3": { m: 0, a: 0 } };
      const z = shotZone(s, league);
      out[k][z].a += 1;
      if (s.made) out[k][z].m += 1;
    }
    return out;
  }, [shots, league]);
  if (!shots.length) return <div className="px-3 py-10 text-center text-sm text-subtle">No located shots yet.</div>;
  return (
    <div className="grid gap-3 p-3 2xl:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            label="Team"
            value={team}
            onChange={setTeam}
            options={[
              { value: "both", label: "Both" },
              { value: "away", label: away.abbr },
              { value: "home", label: home.abbr },
            ]}
          />
          <Segmented
            size="sm"
            label="Result"
            value={result}
            onChange={setResult}
            options={[
              { value: "all", label: "All" },
              { value: "made", label: "Made" },
              { value: "missed", label: "Missed" },
            ]}
          />
          <span className="num ml-auto text-2xs text-subtle">
            {shown.filter((s) => s.made).length}/{shown.length} FG
          </span>
        </div>
        <div className="relative">
          <svg viewBox={`-1 ${BASELINE - 1} 52 ${36}`} style={{ maxHeight: height }} className="w-full" role="img" aria-label="Shot chart">
            <Court league={league} />
            {shown.map((p) => {
              const c = colorOf(p);
              return p.made ? (
                <circle key={p.id} cx={p.x!} cy={p.y!} r={0.62} fill={c} fillOpacity={0.9} stroke="rgb(var(--c-surface))" strokeWidth={0.12} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} />
              ) : (
                <g key={p.id} stroke={c} strokeWidth={0.22} strokeOpacity={0.75} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
                  <line x1={p.x! - 0.45} y1={p.y! - 0.45} x2={p.x! + 0.45} y2={p.y! + 0.45} />
                  <line x1={p.x! - 0.45} y1={p.y! + 0.45} x2={p.x! + 0.45} y2={p.y! - 0.45} />
                  <circle cx={p.x!} cy={p.y!} r={0.7} fill="transparent" stroke="none" />
                </g>
              );
            })}
          </svg>
          <div className="pointer-events-none absolute left-2 top-2 max-w-[70%] text-xs text-fg-2">
            {hover ? (
              <span className="rounded-sm bg-overlay/95 px-1.5 py-0.5 shadow-pop">
                <span className="num text-subtle">
                  {league === "CBB" ? `H${hover.period}` : `Q${hover.period}`} {hover.clock}
                </span>{" "}
                {hover.text}
              </span>
            ) : (
              <span className="text-2xs text-subtle">● made · ✕ missed · free throws excluded</span>
            )}
          </div>
        </div>
      </div>
      <div className="min-w-0 text-xs">
        <div className="label mb-1">By zone</div>
        <table className="w-full">
          <thead>
            <tr className="text-2xs text-subtle">
              <th className="py-1 text-left font-medium">Zone</th>
              {[away, home].map((t) => (
                <th key={t.id} className="py-1 text-right font-medium">
                  {t.abbr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {(["Rim", "Paint", "Mid-range", "Corner 3", "Above-break 3"] as Zone[]).map((z) => (
              <tr key={z}>
                <td className="py-1 text-muted">{z}</td>
                {[away, home].map((t) => {
                  const v = zones[t.id]?.[z];
                  return (
                    <td key={t.id} className={cn("num py-1 text-right", v?.a ? "text-fg-2" : "text-subtle")}>
                      {v?.a ? `${v.m}/${v.a}` : "–"}
                      <span className="ml-1 text-subtle">{v?.a ? `${Math.round((v.m / v.a) * 100)}%` : ""}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
