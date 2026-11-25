import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { createColumnHelper } from "@tanstack/react-table";

import { MarketChart } from "@/components/charts/MarketChart";
import { TeamCrest } from "@/components/identity/identity";
import { ShotChart } from "@/components/live/ShotChart";
import { DataTable } from "@/components/ui/DataTable";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import { StreakCell, Strip } from "@/components/views/StreaksView";

import { awaySide, den, homeSide, okc, shots } from "./fixtures";

const meta: Meta = { title: "Analytics/Data views" };
export default meta;

interface Row { team: typeof okc; record: string; hit: number; streak: string; last: string[] }
const c = createColumnHelper<Row>();
const rows: Row[] = Array.from({ length: 120 }, (_, i) => ({
  team: i % 2 ? okc : den,
  record: `${30 - (i % 9)}-${20 + (i % 7)}`,
  hit: 0.5 + ((i * 37) % 20) / 100,
  streak: i % 3 ? `W${(i % 5) + 1}` : `L${(i % 4) + 1}`,
  last: Array.from({ length: 10 }, (_, j) => ((i + j) % 3 ? "W" : "L")),
}));

export const AnalyticalTable: StoryObj = {
  render: () => (
    <Panel>
      <PanelHeader title="Virtualised table" eyebrow="sort, search, filter, pinned column, expandable rows" />
      <DataTable
        data={rows}
        virtual
        height={420}
        searchable
        renderExpanded={(r) => <div className="px-4 py-2 text-xs text-muted">Detail for {r.team.name}</div>}
        columns={[
          c.accessor((r) => r.team.name, { id: "team", header: "Team", meta: { pin: true }, cell: ({ row }) => <span className="flex items-center gap-2"><TeamCrest team={row.original.team} size={16} />{row.original.team.name}</span> }),
          c.accessor((r) => r.team.abbr, { id: "abbr", header: "Abbr", meta: { filter: "select", label: "teams" } }),
          c.accessor("record", { header: "Record", meta: { align: "right" } }),
          c.accessor("hit", { header: "Hit", meta: { align: "right" }, cell: ({ getValue }) => `${(getValue() * 100).toFixed(1)}%` }),
          c.accessor("streak", { header: "Streak", meta: { align: "right" }, cell: ({ getValue }) => <StreakCell s={getValue()} /> }),
          c.display({ id: "last", header: "Last 10", cell: ({ row }) => <Strip seq={row.original.last} /> }),
        ] as any}
      />
    </Panel>
  ),
};

export const LineMovement: StoryObj = {
  render: () => (
    <Panel className="max-w-3xl">
      <PanelHeader title="Line movement" eyebrow="Lightweight Charts" />
      <MarketChart
        market="spreads"
        model={-3.2}
        homeAbbr="OKC"
        points={[
          { t: "2026-11-24T18:00:00Z", book: "DraftKings", line: -2.5, price: -110 },
          { t: "2026-11-25T01:00:00Z", book: "DraftKings", line: -3.5, price: -110 },
          { t: "2026-11-25T16:00:00Z", book: "DraftKings", line: -4.0, price: -108 },
          { t: "2026-11-25T23:55:00Z", book: "DraftKings", line: -4.5, price: -112 },
        ]}
      />
    </Panel>
  ),
};

export const ShotChartNBA: StoryObj = {
  render: () => (
    <Panel className="max-w-3xl">
      <PanelHeader title="Shot chart" eyebrow="fixture shots" />
      <ShotChart plays={shots()} home={homeSide} away={awaySide} league="NBA" />
    </Panel>
  ),
};
