"use client";

import Link from "next/link";

import { C, EChart, baseAxis, tooltip } from "@/components/charts/EChart";
import { TeamCrest, pairColors } from "@/components/identity/identity";
import { Empty, Panel, PanelHeader, Skeleton, Stat, StatStrip } from "@/components/ui/primitives";
import { StreakCell } from "@/components/views/StreaksView";
import { useApi } from "@/lib/api";
import { cn, dateShort, num, signed, spreadLine } from "@/lib/format";
import type { Game } from "@/lib/types";

/** Previous meetings of the two teams across seasons, from the home team's side, with the closing
 *  line and how each game finished against it. */
export function HeadToHead({ g }: { g: Game }) {
  const q = useApi<any>(`/api/games/${g.id}/h2h`);
  if (q.isLoading) return <Skeleton className="h-72" />;
  const d = q.data;
  if (!d?.n) return <Panel><Empty title="No previous meetings in the data">History covers the seasons loaded from ESPN (three NBA, two college).</Empty></Panel>;
  const [ca, ch] = pairColors(g.away, g.home);
  const rows = [...d.games].reverse();
  return (
    <div className="space-y-3">
      <Panel>
        <PanelHeader title={`${g.home.name} vs ${g.away.name}`} eyebrow={`${d.n} previous meetings · from ${g.home.abbr}'s side`} />
        <StatStrip className="border-t-0">
          <Stat label={`${g.home.abbr} record`} value={`${d.wins}-${d.losses}`} />
          <Stat label="Avg margin" value={signed(d.avg_margin, 1)} tone={d.avg_margin >= 0 ? "gain" : "loss"} />
          <Stat label="Avg total" value={num(d.avg_total, 1)} />
          <Stat label="ATS vs close" value={`${d.ats.cover}-${d.ats.fail}-${d.ats.push}`} sub="meetings with a closing line" />
          <Stat label="Over / under" value={`${d.ou.over}-${d.ou.under}-${d.ou.push}`} />
        </StatStrip>
        <EChart
          height={200}
          option={{
            grid: { left: 36, right: 12, top: 16, bottom: 30 },
            tooltip: {
              ...tooltip,
              axisPointer: { type: "shadow" },
              formatter: (ps: any) => {
                const r = rows[(Array.isArray(ps) ? ps[0] : ps).dataIndex];
                return `${dateShort(r.date)} · ${r.away_abbr} @ ${r.home_abbr} ${r.score}<br/>${g.home.abbr} margin ${signed(r.margin, 0)}${r.spread != null ? ` · line ${spreadLine(r.spread)}` : ""}`;
              },
            },
            xAxis: { ...baseAxis, type: "category", data: rows.map((r: any) => `${dateShort(r.date)}`) },
            yAxis: { ...baseAxis, type: "value", name: `${g.home.abbr} margin` },
            series: [
              { type: "bar", barWidth: "45%", data: rows.map((r: any) => ({ value: r.margin, itemStyle: { color: r.margin >= 0 ? ch : ca } })) },
              { type: "scatter", name: "Closing line", symbol: "rect", symbolSize: [14, 2], data: rows.map((r: any) => (r.spread == null ? null : -r.spread)), itemStyle: { color: C.fg } },
            ],
          }}
        />
        <div className="px-3 pb-2 text-2xs text-subtle">Bars: {g.home.abbr} margin. Marks: the margin the closing spread implied.</div>
      </Panel>
      <Panel>
        <PanelHeader title="Meetings" />
        <div className="overflow-x-auto">
          <table className="dt w-full min-w-[640px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th>Date</th>
                <th>Season</th>
                <th>Game</th>
                <th className="text-right">Score</th>
                <th className="text-right">{g.home.abbr} margin</th>
                <th className="text-right">{g.home.abbr} line</th>
                <th className="text-right">ATS</th>
                <th className="text-right">Total</th>
                <th className="text-right">O/U</th>
              </tr>
            </thead>
            <tbody>
              {d.games.map((r: any) => (
                <tr key={r.game_id}>
                  <td>
                    <Link href={`/games/${r.game_id}`} className="num text-fg-2 hover:underline">
                      {dateShort(r.date)}
                    </Link>
                  </td>
                  <td className="num text-subtle">{r.season}</td>
                  <td className="text-fg-2">
                    <span className="inline-flex items-center gap-1">
                      <TeamCrest team={r.at_home ? g.away : g.home} size={14} />
                      {r.away_abbr} @ {r.home_abbr}
                      {r.neutral ? " (N)" : ""}
                    </span>
                  </td>
                  <td className="num text-right text-fg">{r.score}</td>
                  <td className={cn("num text-right", r.margin >= 0 ? "text-pos" : "text-neg")}>{signed(r.margin, 0)}</td>
                  <td className="num text-right text-muted">{r.spread == null ? "–" : spreadLine(r.spread)}</td>
                  <td className="text-right">{r.ats ? <StreakCell s={r.ats === "cover" ? "C" : r.ats === "fail" ? "F" : "P"} /> : <span className="text-subtle">–</span>}</td>
                  <td className="num text-right text-muted">
                    {r.total}
                    {r.total_line != null ? <span className="text-subtle"> / {r.total_line}</span> : ""}
                  </td>
                  <td className="text-right">{r.ou ? <StreakCell s={r.ou === "over" ? "O" : r.ou === "under" ? "U" : "P"} neutral /> : <span className="text-subtle">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
