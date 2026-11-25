"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useState } from "react";

import { TeamCrest } from "@/components/identity/identity";
import { DataTable } from "@/components/ui/DataTable";
import { Panel, PanelHeader, Segmented, Skeleton, SourceStamp, Tip } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import { MARKET_LABEL, cn, dateShort, num, pct } from "@/lib/format";
import { usePrefs } from "@/lib/store";
import type { Team } from "@/lib/types";

/* Streaks and splits: the model's graded forecasts per team, player or conference, plus each
   team's actual results against the closing line and each player's stat streaks. */

type By = "team" | "player" | "conference";
type Market = "all" | "moneyline" | "spread" | "total";

const GOOD = new Set(["W", "C", "A"]);
const BAD = new Set(["L", "F", "B"]);

export function StreakCell({ s, neutral }: { s?: string | null; neutral?: boolean }) {
  if (!s) return <span className="text-subtle">–</span>;
  const k = s[0];
  // over/under runs: spell the side so "O7" never reads as "07" in the mono face
  const text = k === "O" ? `OV${s.slice(1)}` : k === "U" ? `UN${s.slice(1)}` : s;
  return <span className={cn("num", neutral ? "text-fg-2" : GOOD.has(k) ? "text-pos" : BAD.has(k) ? "text-neg" : "text-fg-2")}>{text}</span>;
}

/** Last results as a strip of small squares, oldest to newest. */
export function Strip({ seq, neutral }: { seq?: string[]; neutral?: boolean }) {
  if (!seq?.length) return <span className="text-subtle">–</span>;
  return (
    <span className="inline-flex gap-px" aria-label={seq.join(" ")}>
      {seq.map((x, i) => (
        <span
          key={i}
          title={x}
          className={cn(
            "h-3 w-1.5",
            neutral ? (x === "O" ? "bg-fg-2" : x === "U" ? "bg-subtle/60" : "bg-hair") : GOOD.has(x) ? "bg-pos" : BAD.has(x) ? "bg-neg" : "bg-hair",
          )}
        />
      ))}
    </span>
  );
}

const rec = (m: any) => (m ? `${m.wins}-${m.losses}${m.pushes ? `-${m.pushes}` : ""}` : "–");
const ouText = (o: any) => (!o ? "–" : ["over", "under"].filter((k) => o[k]).map((k) => `${k === "over" ? "Over" : "Under"} ${o[k].wins}-${o[k].losses}`).join(" · ") || "–");

function TeamDetail({ r }: { r: any }) {
  return (
    <div className="grid gap-4 px-4 py-3 text-xs lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="space-y-3">
        {r.results && (
          <table className="w-full">
            <thead>
              <tr className="text-2xs text-subtle">
                <th className="py-1 text-left font-medium">Results {r.results.season}</th>
                <th className="py-1 text-right font-medium">Record</th>
                <th className="py-1 text-right font-medium">Streak</th>
                <th className="py-1 text-right font-medium">Longest</th>
                <th className="py-1 pl-3 text-left font-medium">Last 10</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {[
                ["Straight up", r.results.su, false, "W / L"],
                ["Against the spread", r.results.ats, false, "cover / fail"],
                ["Over / under", r.results.ou, true, "over / under"],
              ].map(([label, b, neutral, units]: any) => (
                <tr key={label}>
                  <td className="py-1 text-muted">{label}</td>
                  <td className="num py-1 text-right text-fg-2">{b.record}</td>
                  <td className="py-1 text-right">
                    <StreakCell s={b.current} neutral={neutral} />
                  </td>
                  <td className="num py-1 text-right text-subtle" title={units}>
                    {b.longest_win}/{b.longest_loss}
                  </td>
                  <td className="py-1 pl-3">
                    <Strip seq={b.last10} neutral={neutral} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {r.model_by_market && (
          <table className="w-full">
            <thead>
              <tr className="text-2xs text-subtle">
                <th className="py-1 text-left font-medium">Model by market</th>
                <th className="py-1 text-right font-medium">Record</th>
                <th className="py-1 text-right font-medium">Hit</th>
                <th className="py-1 text-right font-medium">Units</th>
                <th className="py-1 text-right font-medium">Streak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {Object.entries<any>(r.model_by_market).map(([mk, m]) => (
                <tr key={mk}>
                  <td className="py-1 text-muted">{MARKET_LABEL[mk] ?? mk}</td>
                  <td className="num py-1 text-right text-fg-2">{rec(m)}</td>
                  <td className="num py-1 text-right text-fg-2">{pct(m.hit_rate, 0)}</td>
                  <td className={cn("num py-1 text-right", m.units == null ? "text-subtle" : m.units >= 0 ? "text-pos" : "text-neg")}>{m.units == null ? "–" : `${m.units >= 0 ? "+" : ""}${num(m.units, 1)}`}</td>
                  <td className="py-1 text-right">
                    <StreakCell s={m.current} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {r.model?.last10?.length ? (
        <table className="w-full">
          <thead>
            <tr className="text-2xs text-subtle">
              <th className="py-1 text-left font-medium">Last 10 forecasts</th>
              <th className="py-1 text-left font-medium">Market</th>
              <th className="py-1 text-left font-medium">Pick</th>
              <th className="py-1 text-right font-medium">Prob.</th>
              <th className="py-1 text-right font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {[...r.model.last10].reverse().map((x: any, i: number) => (
              <tr key={i}>
                <td className="py-1">
                  <Link href={`/games/${x.game_id}`} className="num text-muted hover:text-fg">
                    {dateShort(x.date)}
                  </Link>
                </td>
                <td className="py-1 text-muted">{MARKET_LABEL[x.market] ?? x.market}</td>
                <td className="num py-1 text-fg-2">
                  {x.pick_team ?? x.selection}
                  {x.line != null ? ` ${x.market === "spread" && x.line > 0 ? "+" : ""}${x.line}` : ""}
                </td>
                <td className="num py-1 text-right text-muted">{pct(x.prob, 0)}</td>
                <td className="py-1 text-right">
                  <StreakCell s={x.r === "W" ? "W" : x.r === "L" ? "L" : "P"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-subtle">No graded forecasts for this group yet.</div>
      )}
    </div>
  );
}

const tc = createColumnHelper<any>();

export function StreaksView() {
  const league = usePrefs((s) => s.league);
  const [by, setBy] = useState<By>("team");
  const [market, setMarket] = useState<Market>("all");
  const lq = league === "ALL" ? "" : `&league=${league}`;
  const q = useApi<{ rows: any[]; note?: string | null }>(`/api/performance/streaks?by=${by}&market=${market}${by === "player" ? "&league=NBA" : lq}`);
  const teams = useApi<Team[]>("/api/teams");
  const teamById = new Map((teams.data ?? []).map((t) => [t.id, t]));

  const modelCols = [
    tc.accessor((r) => r.model?.n ?? 0, { id: "n", header: "N", meta: { align: "right" } }),
    tc.accessor((r) => r.model?.wins ?? -1, { id: "record", header: "Record", meta: { align: "right" }, cell: ({ row }) => rec(row.original.model) }),
    tc.accessor((r) => r.model?.hit_rate ?? -1, { id: "hit", header: "Hit", meta: { align: "right" }, cell: ({ row }) => pct(row.original.model?.hit_rate, 1) }),
    tc.accessor((r) => r.model?.units ?? -999, {
      id: "units",
      header: "Units",
      meta: { align: "right" },
      cell: ({ row }) => {
        const u = row.original.model?.units;
        return u == null ? <span className="text-subtle">–</span> : <span className={u >= 0 ? "text-pos" : "text-neg"}>{`${u >= 0 ? "+" : ""}${num(u, 1)}`}</span>;
      },
    }),
    tc.accessor((r) => (r.model ? (r.model.current_kind === "W" ? 1 : -1) * r.model.current_n : -999), { id: "streak", header: "Streak", meta: { align: "right" }, cell: ({ row }) => <StreakCell s={row.original.model?.current} /> }),
    tc.accessor((r) => r.model?.longest_win ?? 0, { id: "bestw", header: "Best W", meta: { align: "right" } }),
    tc.accessor((r) => r.model?.longest_loss ?? 0, { id: "worstl", header: "Worst L", meta: { align: "right" } }),
    tc.display({ id: "last10", header: "Last 10", cell: ({ row }) => <Strip seq={(row.original.model?.last10 ?? []).map((x: any) => x.r)} /> }),
    tc.display({ id: "ou", header: "O/U picks", cell: ({ row }) => <span className="num text-xs text-muted">{ouText(row.original.model_ou)}</span> }),
  ];

  const teamCols = [
    tc.accessor("label", {
      header: "Team",
      meta: { pin: true },
      cell: ({ row }) => {
        const t = teamById.get(row.original.team_id);
        return (
          <Link href={`/teams/${row.original.team_id}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 hover:underline">
            {t && <TeamCrest team={t} size={16} />}
            <span className="text-fg">{row.original.label}</span>
          </Link>
        );
      },
    }),
    tc.accessor((r) => (r.league === "CBB" ? "NCAA" : "NBA"), { id: "league", header: "Lg", meta: { filter: "select", label: "leagues" } }),
    tc.accessor((r) => r.conference ?? "—", { id: "conf", header: "Conf", meta: { filter: "select", label: "conferences" } }),
    ...modelCols,
    tc.accessor((r) => r.results?.su?.current ?? "", { id: "su", header: "SU", cell: ({ row }) => <span className="num text-xs">{row.original.results?.su?.record ?? "–"} <StreakCell s={row.original.results?.su?.current} /></span> }),
    tc.accessor((r) => r.results?.ats?.current ?? "", { id: "ats", header: "ATS", cell: ({ row }) => <span className="num text-xs">{row.original.results?.ats?.record ?? "–"} <StreakCell s={row.original.results?.ats?.current} /></span> }),
    tc.accessor((r) => r.results?.ou?.current ?? "", { id: "ouRes", header: "O/U", cell: ({ row }) => <span className="num text-xs">{row.original.results?.ou?.record ?? "–"} <StreakCell s={row.original.results?.ou?.current} neutral /></span> }),
  ];

  const statCell = (k: string) =>
    tc.accessor((r) => r.form?.stats?.[k]?.avg ?? -1, {
      id: k,
      header: k === "fg3m" ? "3PM" : k.toUpperCase(),
      meta: { align: "right" },
      cell: ({ row }) => {
        const s = row.original.form?.stats?.[k];
        if (!s) return <span className="text-subtle">–</span>;
        return (
          <Tip content={`Season ${num(s.avg, 1)} · last 5 ${num(s.last5, 1)} · last game ${num(s.last, 0)} · longest above/below ${s.longest_win}/${s.longest_loss}`}>
            <span className="num">
              {num(s.avg, 1)} <StreakCell s={s.current ? `${s.current[0] === "A" ? "▲" : "▼"}${s.current.slice(1)}` : null} />
            </span>
          </Tip>
        );
      },
    });
  const playerCols = [
    tc.accessor("label", {
      header: "Player",
      meta: { pin: true },
      cell: ({ row }) => (
        <Link href={`/players/${row.original.player_id}`} onClick={(e) => e.stopPropagation()} className="text-fg hover:underline">
          {row.original.label}
        </Link>
      ),
    }),
    tc.accessor((r) => r.abbr ?? "FA", { id: "team", header: "Team", meta: { filter: "select", label: "teams" } }),
    tc.accessor((r) => r.form?.games ?? 0, { id: "g", header: "G", meta: { align: "right" } }),
    tc.accessor((r) => r.form?.minutes ?? 0, { id: "min", header: "MIN", meta: { align: "right" }, cell: ({ getValue }) => num(getValue(), 1) }),
    statCell("pts"),
    statCell("reb"),
    statCell("ast"),
    statCell("fg3m"),
    statCell("pra"),
    ...(q.data?.rows?.some((r) => r.model) ? modelCols : []),
  ];
  const confCols = [tc.accessor("label", { header: "Conference", meta: { pin: true }, cell: ({ getValue }) => <span className="text-fg">{getValue()}</span> }), ...modelCols];

  const cols = by === "team" ? teamCols : by === "player" ? playerCols : confCols;
  return (
    <Panel>
      <PanelHeader
        title="Streaks & splits"
        eyebrow={by === "player" ? "NBA players · current season" : "official pre-game forecasts · graded against the closing line"}
        right={
          <>
            <Segmented
              size="sm"
              label="Group by"
              value={by}
              onChange={setBy}
              options={[
                { value: "team", label: "Teams" },
                { value: "player", label: "Players" },
                { value: "conference", label: "Conferences" },
              ]}
            />
            {by !== "player" && (
              <Segmented
                size="sm"
                label="Market"
                value={market}
                onChange={setMarket}
                options={[
                  { value: "all", label: "All" },
                  { value: "moneyline", label: "ML" },
                  { value: "spread", label: "Spread" },
                  { value: "total", label: "O/U" },
                ]}
              />
            )}
            <SourceStamp source="graded archive · ESPN" />
          </>
        }
      />
      {q.data?.note && <div className="border-b border-hair px-3 py-1.5 text-xs text-muted">{q.data.note}</div>}
      {by === "player" && (
        <div className="border-b border-hair px-3 py-1.5 text-2xs text-subtle">▲n / ▼n: consecutive games above / below the player&apos;s own season average. Hover a cell for last-5 and longest runs.</div>
      )}
      {by === "team" && (
        <div className="border-b border-hair px-3 py-1.5 text-2xs text-subtle">
          Streak: current run of the model&apos;s forecasts on this team&apos;s games (pushes skipped). SU / ATS / O/U: the team&apos;s actual season results against the closing line, with the current run. Expand a row for
          per-market splits and the last 10 forecasts.
        </div>
      )}
      {q.isLoading || !q.data ? (
        <Skeleton className="m-3 h-[420px]" />
      ) : (
        <DataTable
          key={`${by}-${market}`}
          data={q.data.rows}
          columns={cols as any}
          virtual
          height="max(420px, calc(100dvh - 300px))"
          searchable
          minWidth={by === "team" ? 1240 : 980}
          initialSort={[{ id: by === "player" ? "pts" : "n", desc: true }]}
          renderExpanded={by === "player" ? undefined : (r) => <TeamDetail r={r} />}
        />
      )}
    </Panel>
  );
}
