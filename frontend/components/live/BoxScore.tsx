"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/ui/DataTable";
import { Segmented } from "@/components/ui/primitives";
import type { BoxPlayer, EspnGame } from "@/lib/espn-game";

const SHOW = ["minutes", "points", "rebounds", "assists", "fieldGoalsMade-fieldGoalsAttempted", "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "freeThrowsMade-freeThrowsAttempted", "steals", "blocks", "turnovers", "fouls", "plusMinus"];
const LABEL: Record<string, string> = {
  minutes: "MIN", points: "PTS", rebounds: "REB", assists: "AST", "fieldGoalsMade-fieldGoalsAttempted": "FG", "threePointFieldGoalsMade-threePointFieldGoalsAttempted": "3PT",
  "freeThrowsMade-freeThrowsAttempted": "FT", steals: "STL", blocks: "BLK", turnovers: "TO", fouls: "PF", plusMinus: "+/-",
};
const sortNum = (v: string) => {
  const n = Number(String(v).split("-")[0].replace("+", ""));
  return Number.isFinite(n) ? n : -999;
};

/** Player box score from ESPN, one team at a time, sortable, player column pinned. */
export function BoxScore({ g }: { g: EspnGame }) {
  const [side, setSide] = useState<"away" | "home">("away");
  const team = side === "home" ? g.home : g.away;
  const box = g.players[team.id];
  const cols = useMemo<ColumnDef<BoxPlayer, any>[]>(() => {
    const keys = SHOW.filter((k) => box?.keys.includes(k));
    return [
      {
        id: "player",
        header: "Player",
        accessorFn: (r) => r.name,
        meta: { pin: true },
        cell: ({ row }) => (
          <span className="flex items-baseline gap-1.5">
            <span className="text-fg">{row.original.short}</span>
            <span className="text-2xs text-subtle">
              {row.original.pos}
              {row.original.starter ? " · S" : ""}
            </span>
          </span>
        ),
      },
      ...keys.map<ColumnDef<BoxPlayer, any>>((k) => ({
        id: k,
        header: LABEL[k] ?? k,
        accessorFn: (r) => r.stats[k],
        sortingFn: (a, b) => sortNum(a.original.stats[k]) - sortNum(b.original.stats[k]),
        meta: { align: "right" },
        cell: ({ getValue }) => <span className={k === "points" ? "text-fg" : undefined}>{getValue() || "–"}</span>,
      })),
    ];
  }, [box]);
  const rows = (box?.athletes ?? []).filter((a) => !a.dnp);
  const dnp = (box?.athletes ?? []).filter((a) => a.dnp);
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-hair px-3 py-1.5">
        <Segmented
          size="sm"
          label="Team"
          value={side}
          onChange={setSide}
          options={[
            { value: "away", label: g.away.abbr },
            { value: "home", label: g.home.abbr },
          ]}
        />
      </div>
      {rows.length ? (
        <DataTable data={rows} columns={cols} pageSize={20} minWidth={720} />
      ) : (
        <div className="px-3 py-8 text-center text-sm text-subtle">{g.state === "pre" ? "Box score starts at tip-off." : "No player box score published for this game."}</div>
      )}
      {!!dnp.length && <div className="px-3 py-1.5 text-2xs text-subtle">Did not play: {dnp.map((d) => d.short).join(", ")}</div>}
    </div>
  );
}
