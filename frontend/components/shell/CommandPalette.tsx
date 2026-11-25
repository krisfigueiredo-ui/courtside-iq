"use client";

import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { TeamCrest } from "@/components/identity/identity";
import { Kbd } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { cn, timeShort } from "@/lib/format";
import { resolvedTheme, usePrefs } from "@/lib/store";
import type { Game, Player, Team } from "@/lib/types";

const PAGES = [
  { label: "Command Center", href: "/", hint: "Today's slate and model outlook" },
  { label: "Live Games", href: "/live", hint: "Scores, win probability, shot charts" },
  { label: "NBA slate and standings", href: "/live?tab=nba" },
  { label: "College slate and standings", href: "/live?tab=cbb" },
  { label: "Market Intelligence", href: "/markets", hint: "Lines, model vs market, movement" },
  { label: "Totals", href: "/markets?tab=totals" },
  { label: "Player props", href: "/markets?tab=props" },
  { label: "Research Lab", href: "/research", hint: "Trends, teams, players, comparisons" },
  { label: "Compare teams or players", href: "/research?tab=compare" },
  { label: "Data & imports", href: "/research?tab=data" },
  { label: "Picks & Performance", href: "/picks", hint: "Graded forecasts, streaks, CLV" },
  { label: "Streaks by team and player", href: "/picks?tab=breakdown" },
  { label: "Model Intelligence", href: "/model", hint: "Versions, calibration, backtests" },
  { label: "Settings", href: "/settings" },
];

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

const itemCls =
  "flex h-8 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-sm text-fg-2 data-[selected=true]:bg-raised data-[selected=true]:text-fg";

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter();
  const { theme, setTheme, toggleNav, setAiOpen, aiOpen, setLeague } = usePrefs();
  const enabled = open;
  const games = useQuery<Game[]>({ queryKey: ["/api/games?days=3"], queryFn: () => api("/api/games?days=3"), enabled, staleTime: 60_000 });
  const teams = useQuery<Team[]>({ queryKey: ["/api/teams"], queryFn: () => api("/api/teams"), enabled, staleTime: 600_000 });
  const players = useQuery<Player[]>({ queryKey: ["/api/players"], queryFn: () => api("/api/players"), enabled, staleTime: 600_000 });
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      loop
      overlayClassName="fixed inset-0 z-[95] bg-black/40"
      contentClassName="fixed left-1/2 top-[12vh] z-[96] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-lg border border-edge bg-overlay shadow-pop"
    >
      <div className="flex items-center border-b border-hair px-3">
        <Command.Input autoFocus placeholder="Jump to a game, team, player or workspace…" className="h-11 w-full bg-transparent text-[14px] text-fg placeholder:text-subtle focus:outline-none" />
        <Kbd>esc</Kbd>
      </div>
      <Command.List className="max-h-[56vh] overflow-y-auto p-1.5">
        <Command.Empty className="px-2 py-6 text-center text-sm text-subtle">No matches.</Command.Empty>
        <Command.Group heading="Workspaces" className={cn("[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5")}>
          {PAGES.map((p) => (
            <Command.Item key={p.href} value={`page ${p.label}`} onSelect={() => go(p.href)} className={itemCls}>
              <span>{p.label}</span>
              {p.hint && <span className="ml-auto truncate text-xs text-subtle">{p.hint}</span>}
            </Command.Item>
          ))}
        </Command.Group>
        {!!games.data?.length && (
          <Command.Group heading="Games" className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
            {games.data.slice(0, 400).map((g) => (
              <Command.Item key={g.id} value={`game ${g.away.name} ${g.home.name} ${g.away.abbr} ${g.home.abbr} ${g.league}`} onSelect={() => go(`/games/${g.id}`)} className={itemCls}>
                <TeamCrest team={g.away} size={16} />
                <span className="truncate">
                  {g.away.name} <span className="text-subtle">at</span> {g.home.name}
                </span>
                <span className="num ml-auto shrink-0 text-xs text-subtle">
                  {g.league} · {g.status === "final" ? `F ${g.away_score}-${g.home_score}` : g.status === "live" ? "LIVE" : timeShort(g.start_time)}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {!!teams.data?.length && (
          <Command.Group heading="Teams" className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
            {teams.data.map((t) => (
              <Command.Item key={t.id} value={`team ${t.name} ${t.abbr} ${t.conference ?? ""}`} onSelect={() => go(`/teams/${t.id}`)} className={itemCls}>
                <TeamCrest team={t} size={16} />
                <span className="truncate">{t.name}</span>
                <span className="ml-auto shrink-0 text-xs text-subtle">
                  {t.league === "CBB" ? "NCAA" : "NBA"}
                  {t.conference ? ` · ${t.conference}` : ""}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {!!players.data?.length && (
          <Command.Group heading="Players" className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
            {players.data.map((p) => (
              <Command.Item key={p.id} value={`player ${p.name} ${p.team?.abbr ?? ""}`} onSelect={() => go(`/players/${p.id}`)} className={itemCls}>
                <span className="truncate">{p.name}</span>
                <span className="ml-auto shrink-0 text-xs text-subtle">
                  {p.position ?? ""} {p.team?.abbr ?? ""}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
          <Command.Item value="action toggle theme dark light" onSelect={() => run(() => setTheme(resolvedTheme(theme) === "dark" ? "light" : "dark"))} className={itemCls}>
            Switch to {resolvedTheme(theme) === "dark" ? "light" : "dark"} theme
          </Command.Item>
          <Command.Item value="action assistant ai" onSelect={() => run(() => setAiOpen(!aiOpen))} className={itemCls}>
            {aiOpen ? "Close" : "Open"} COURTSIDE AI
          </Command.Item>
          <Command.Item value="action sidebar collapse expand" onSelect={() => run(toggleNav)} className={itemCls}>
            Toggle sidebar
          </Command.Item>
          {(["ALL", "NBA", "CBB"] as const).map((l) => (
            <Command.Item key={l} value={`action league filter ${l}`} onSelect={() => run(() => setLeague(l))} className={itemCls}>
              League filter: {l === "ALL" ? "all leagues" : l === "CBB" ? "NCAA" : "NBA"}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
