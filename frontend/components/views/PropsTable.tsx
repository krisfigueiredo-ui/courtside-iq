"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { PlayerPortrait } from "@/components/identity/identity";
import { DataTable } from "@/components/ui/DataTable";
import { american, cn, num, pct, signed } from "@/lib/format";
import type { Player, PropProjection } from "@/lib/types";

interface Row {
  p: PropProjection;
  player: Player | undefined;
  name: string;
  team: string;
  minutes: number;
  mean: number;
  p10: number;
  p90: number;
  line: number | null;
  pOver: number | null;
  edge: number | null;
  ev: number | null;
  side: "over" | "under" | null;
  price: number | null;
}
const c = createColumnHelper<Row>();

/** One stat across every projected player in a game: projection and 80% range against the
 *  DraftKings line, with the model's over probability and expected value of the better side. */
export function PropsTable({ props, stat, players }: { props: PropProjection[]; stat: string; players?: Map<number, Player> }) {
  const router = useRouter();
  const rows = useMemo<Row[]>(
    () =>
      props
        .filter((p) => p.markets[stat] && !p.injury_out)
        .map((p) => {
          const m = p.markets[stat];
          const pl = p.player ?? players?.get(p.player_id);
          const evO = m.ev_over ?? null;
          const evU = m.ev_under ?? null;
          const side = evO == null && evU == null ? null : (evO ?? -9) >= (evU ?? -9) ? "over" : "under";
          return {
            p, player: pl, name: pl?.name ?? `#${p.player_id}`, team: pl?.team?.abbr ?? "", minutes: p.minutes.mean, mean: m.mean, p10: m.p10, p90: m.p90,
            line: m.line ?? null, pOver: m.p_over ?? null, edge: m.line != null ? m.mean - m.line : null,
            ev: side === "over" ? evO : side === "under" ? evU : null, side, price: side === "over" ? (m.over_price ?? null) : side === "under" ? (m.under_price ?? null) : null,
          };
        }),
    [props, stat, players],
  );
  const cols = [
    c.accessor("name", {
      header: "Player",
      meta: { pin: true },
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          {row.original.player && <PlayerPortrait player={row.original.player} size={24} />}
          <span className="text-fg">{row.original.name}</span>
          <span className="text-2xs text-subtle">{row.original.team}</span>
        </span>
      ),
    }),
    c.accessor("minutes", { header: "Min", meta: { align: "right" }, cell: ({ getValue }) => num(getValue(), 1) }),
    c.accessor("mean", { header: "Model", meta: { align: "right" }, cell: ({ getValue }) => <span className="text-accent">{num(getValue(), 1)}</span> }),
    c.accessor("p10", { header: "80% range", meta: { align: "right" }, cell: ({ row }) => `${num(row.original.p10, 0)}–${num(row.original.p90, 0)}` }),
    c.accessor("line", { header: "DK line", meta: { align: "right" }, cell: ({ getValue }) => (getValue() == null ? <span className="text-subtle">not posted</span> : getValue()) }),
    c.accessor("edge", { header: "Δ", meta: { align: "right" }, sortingFn: (a, b) => Math.abs(a.original.edge ?? 0) - Math.abs(b.original.edge ?? 0), cell: ({ getValue }) => (getValue() == null ? <span className="text-subtle">–</span> : <span className={cn(Math.abs(getValue()!) >= 2 ? "text-accent" : "text-fg-2")}>{signed(getValue(), 1)}</span>) }),
    c.accessor("pOver", { header: "P(over)", meta: { align: "right" }, cell: ({ getValue }) => (getValue() == null ? <span className="text-subtle">–</span> : pct(getValue(), 0)) }),
    c.accessor("ev", {
      header: "Best side EV",
      meta: { align: "right" },
      cell: ({ row }) =>
        row.original.ev == null ? (
          <span className="text-subtle">–</span>
        ) : (
          <span className={row.original.ev > 0 ? "text-pos" : "text-muted"}>
            {row.original.side} {american(row.original.price)} · {signed(row.original.ev * 100, 1)}%
          </span>
        ),
    }),
  ];
  return <DataTable data={rows} columns={cols as any} pageSize={30} initialSort={[{ id: "mean", desc: true }]} onRowClick={(r) => router.push(`/players/${r.p.player_id}`)} minWidth={820} searchable />;
}
