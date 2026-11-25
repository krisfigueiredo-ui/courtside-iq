"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { PlayerPortrait, TeamCrest } from "@/components/identity/identity";
import { DataTable } from "@/components/ui/DataTable";
import { Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import { cn, num } from "@/lib/format";
import { usePrefs } from "@/lib/store";
import type { Player, Team } from "@/lib/types";

interface TeamRow {
  team: Team;
  conference: string;
  league: string;
  games: number;
  record: string;
  winPct: number;
  ortg: number;
  drtg: number;
  net: number;
  pace: number;
  efg: number;
  tov: number;
}
interface PlayerRow {
  player: Player;
  team: string;
  pos: string;
  games: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  pra: number | null;
  last5: number | null;
  streak: string | null;
}

const tc = createColumnHelper<TeamRow>();
const pc = createColumnHelper<PlayerRow>();

function Streak({ s }: { s: string | null }) {
  if (!s) return <span className="text-subtle">–</span>;
  const above = s.startsWith("A");
  return <span className={above ? "text-pos" : "text-neg"}>{`${above ? "▲" : "▼"} ${s.slice(1)}`}</span>;
}

function Teams() {
  const league = usePrefs((s) => s.league);
  const leagues = league === "ALL" ? (["NBA", "CBB"] as const) : ([league] as const);
  const nba = useApi<{ rows: any[] }>(leagues.includes("NBA" as never) ? "/api/trends/league/NBA" : null);
  const cbb = useApi<{ rows: any[] }>(leagues.includes("CBB" as never) ? "/api/trends/league/CBB" : null);
  const teams = useApi<Team[]>("/api/teams");
  const router = useRouter();
  const rows = useMemo<TeamRow[]>(() => {
    const byId = new Map((teams.data ?? []).map((t) => [t.id, t]));
    return [...(nba.data?.rows ?? []), ...(cbb.data?.rows ?? [])]
      .map((r) => {
        const t = byId.get(r.team_id);
        if (!t) return null;
        return {
          team: t, league: t.league === "CBB" ? "NCAA" : "NBA", conference: t.conference ?? "—", games: r.games, record: `${r.wins}-${r.losses}`,
          winPct: r.games ? r.wins / r.games : 0, ortg: r.ortg, drtg: r.drtg, net: r.net, pace: r.pace, efg: r.efg, tov: r.tov,
        };
      })
      .filter(Boolean) as TeamRow[];
  }, [nba.data, cbb.data, teams.data]);
  const cols = [
    tc.accessor((r) => r.team.name, {
      id: "team",
      header: "Team",
      meta: { pin: true },
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <TeamCrest team={row.original.team} size={18} />
          <span className="text-fg">{row.original.team.name}</span>
        </span>
      ),
    }),
    tc.accessor("league", { header: "League", meta: { filter: "select", label: "leagues" } }),
    tc.accessor("conference", { header: "Conf", meta: { filter: "select", label: "conferences" } }),
    tc.accessor("winPct", { header: "W-L", meta: { align: "right" }, cell: ({ row }) => row.original.record }),
    tc.accessor("ortg", { header: "ORtg", meta: { align: "right" }, cell: ({ getValue }) => num(getValue(), 1) }),
    tc.accessor("drtg", { header: "DRtg", meta: { align: "right" }, cell: ({ getValue }) => num(getValue(), 1) }),
    tc.accessor("net", {
      header: "Net",
      meta: { align: "right" },
      cell: ({ getValue }) => <span className={cn(getValue() > 0 ? "text-pos" : getValue() < 0 ? "text-neg" : "")}>{`${getValue() > 0 ? "+" : ""}${num(getValue(), 1)}`}</span>,
    }),
    tc.accessor("pace", { header: "Pace", meta: { align: "right" }, cell: ({ getValue }) => num(getValue(), 1) }),
    tc.accessor("efg", { header: "eFG%", meta: { align: "right" }, cell: ({ getValue }) => num(getValue() * 100, 1) }),
    tc.accessor("tov", { header: "TOV%", meta: { align: "right" }, cell: ({ getValue }) => num(getValue() * 100, 1) }),
    tc.accessor("games", { header: "G", meta: { align: "right" } }),
  ];
  if (!teams.data || (leagues.includes("NBA" as never) && !nba.data) || (leagues.includes("CBB" as never) && !cbb.data)) return <Skeleton className="h-96" />;
  return (
    <Panel>
      <PanelHeader title="Teams" eyebrow="Season to date · per 100 possessions · ESPN box scores" />
      <DataTable data={rows} columns={cols as any} virtual height="max(420px, calc(100dvh - 260px))" searchable initialSort={[{ id: "net", desc: true }]} onRowClick={(r) => router.push(`/teams/${r.team.id}`)} minWidth={860} />
    </Panel>
  );
}

function Players() {
  const players = useApi<Player[]>("/api/players?league=NBA");
  const form = useApi<{ rows: any[]; note?: string }>("/api/performance/streaks?by=player&league=NBA&market=all");
  const router = useRouter();
  const rows = useMemo<PlayerRow[]>(() => {
    const f = new Map((form.data?.rows ?? []).map((r) => [r.player_id, r.form]));
    return (players.data ?? []).map((p) => {
      const s = f.get(p.id);
      return {
        player: p, team: p.team?.abbr ?? "FA", pos: p.position ?? "–", games: s?.games ?? null, min: s?.minutes ?? null,
        pts: s?.stats?.pts?.avg ?? null, reb: s?.stats?.reb?.avg ?? null, ast: s?.stats?.ast?.avg ?? null, pra: s?.stats?.pra?.avg ?? null,
        last5: s?.stats?.pts?.last5 ?? null, streak: s?.stats?.pts?.current ?? null,
      };
    });
  }, [players.data, form.data]);
  const n = (d = 1) => ({ getValue }: any) => (getValue() == null ? <span className="text-subtle">–</span> : num(getValue(), d));
  const cols = [
    pc.accessor((r) => r.player.name, {
      id: "player",
      header: "Player",
      meta: { pin: true },
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <PlayerPortrait player={row.original.player} size={26} />
          <span className="text-fg">{row.original.player.name}</span>
        </span>
      ),
    }),
    pc.accessor("team", { header: "Team", meta: { filter: "select", label: "teams" } }),
    pc.accessor("pos", { header: "Pos", meta: { filter: "select", label: "positions" } }),
    pc.accessor("games", { header: "G", meta: { align: "right" }, cell: n(0) }),
    pc.accessor("min", { header: "MIN", meta: { align: "right" }, cell: n(1) }),
    pc.accessor("pts", { header: "PTS", meta: { align: "right" }, cell: n(1) }),
    pc.accessor("reb", { header: "REB", meta: { align: "right" }, cell: n(1) }),
    pc.accessor("ast", { header: "AST", meta: { align: "right" }, cell: n(1) }),
    pc.accessor("pra", { header: "PRA", meta: { align: "right" }, cell: n(1) }),
    pc.accessor("last5", { header: "PTS L5", meta: { align: "right" }, cell: n(1) }),
    pc.accessor("streak", { header: "PTS vs avg", meta: { align: "right" }, sortingFn: (a, b) => (Number(a.original.streak?.slice(1)) || 0) * (a.original.streak?.startsWith("A") ? 1 : -1) - (Number(b.original.streak?.slice(1)) || 0) * (b.original.streak?.startsWith("A") ? 1 : -1), cell: ({ getValue }) => <Streak s={getValue()} /> }),
  ];
  if (!players.data) return <Skeleton className="h-96" />;
  return (
    <Panel>
      <PanelHeader title="NBA players" eyebrow="Current rosters · season averages · consecutive games above (▲) or below (▼) own scoring average" />
      <DataTable data={rows} columns={cols as any} virtual height="max(420px, calc(100dvh - 260px))" searchable initialSort={[{ id: "pts", desc: true }]} onRowClick={(r) => router.push(`/players/${r.player.id}`)} minWidth={900} />
    </Panel>
  );
}

export function DirectoryView({ kind }: { kind: "teams" | "players" }) {
  return kind === "teams" ? <Teams /> : <Players />;
}
