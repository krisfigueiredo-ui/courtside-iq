"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  CandlestickChart,
  Cpu,
  Database,
  LayoutGrid,
  ListChecks,
  Menu,
  MessageSquareText,
  Microscope,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AIDock } from "@/components/shell/AIPanel";
import { CommandPalette, useCommandPalette } from "@/components/shell/CommandPalette";
import { DataStatus } from "@/components/shell/DataStatus";
import { Ticker } from "@/components/shell/Ticker";
import { Kbd, Segmented, Tip } from "@/components/ui/primitives";
import { cn } from "@/lib/format";
import { resolvedTheme, usePrefs, type LeagueFilter } from "@/lib/store";

export const WORKSPACES = [
  { href: "/", label: "Command Center", short: "Command", icon: LayoutGrid, match: (p: string) => p === "/" },
  { href: "/live", label: "Live Games", short: "Live", icon: Radio, match: (p: string) => p.startsWith("/live") || p.startsWith("/games") },
  { href: "/markets", label: "Market Intelligence", short: "Markets", icon: CandlestickChart, match: (p: string) => p.startsWith("/markets") },
  { href: "/research", label: "Research Lab", short: "Research", icon: Microscope, match: (p: string) => p.startsWith("/research") || p.startsWith("/teams") || p.startsWith("/players") },
  { href: "/picks", label: "Picks & Performance", short: "Picks", icon: ListChecks, match: (p: string) => p.startsWith("/picks") },
  { href: "/model", label: "Model Intelligence", short: "Model", icon: Cpu, match: (p: string) => p.startsWith("/model") },
];
const SECONDARY = [
  { href: "/research?tab=data", label: "Data & imports", icon: Database, match: (p: string, t: string | null) => p.startsWith("/research") && t === "data" },
  { href: "/settings", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

/** Brand mark: a half-court arc over a baseline, drawn with the accent. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="23" rx="3" className="fill-fg" />
      <path d="M4 17.5h16" className="stroke-canvas" strokeWidth="1.6" />
      <path d="M6.5 17.5a5.5 5.5 0 0 1 11 0" fill="none" className="stroke-accent" strokeWidth="2" />
      <circle cx="12" cy="17.5" r="1.4" className="fill-accent" />
    </svg>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="flex h-11 items-center gap-2 px-3" aria-label="COURTSIDE IQ home">
      <Mark className="h-5 w-5 shrink-0" />
      {!collapsed && (
        <span className="whitespace-nowrap text-[13px] font-semibold tracking-[0.04em] text-fg">
          COURTSIDE <span className="text-accent">IQ</span>
        </span>
      )}
    </Link>
  );
}

function NavItems({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const tab = useSearchParams().get("tab");
  const item = (it: { href: string; label: string; icon: any; active: boolean }) => {
    const Icon = it.icon;
    const link = (
      <Link
        key={it.href}
        href={it.href}
        onClick={onNavigate}
        aria-current={it.active ? "page" : undefined}
        className={cn(
          "relative flex h-8 items-center gap-2.5 rounded px-2.5 text-sm transition-colors",
          it.active ? "bg-raised text-fg" : "text-muted hover:bg-raised/60 hover:text-fg",
          collapsed && "justify-center px-0",
        )}
      >
        {it.active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[2px] bg-accent" />}
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {!collapsed && <span className="truncate">{it.label}</span>}
      </Link>
    );
    return collapsed ? (
      <Tip key={it.href} content={it.label} side="right">
        {link}
      </Tip>
    ) : (
      link
    );
  };
  return (
    <nav aria-label="Workspaces" className="flex flex-1 flex-col gap-0.5 px-2">
      {WORKSPACES.map((w) => item({ ...w, active: w.match(path) && !(path.startsWith("/research") && tab === "data") }))}
      <div className="my-2 border-t border-hair" />
      {SECONDARY.map((w) => item({ ...w, active: w.match(path, tab) }))}
    </nav>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = usePrefs();
  const [dark, setDark] = useState(true);
  useEffect(() => setDark(resolvedTheme(theme) === "dark"), [theme]);
  return (
    <Tip content={dark ? "Light theme" : "Dark theme"}>
      <button aria-label="Toggle theme" onClick={() => setTheme(dark ? "light" : "dark")} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-raised hover:text-fg">
        {dark ? <Sun className="h-4 w-4" strokeWidth={1.75} /> : <Moon className="h-4 w-4" strokeWidth={1.75} />}
      </button>
    </Tip>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const path = usePathname();
  const { league, setLeague, aiOpen, setAiOpen, navCollapsed, toggleNav } = usePrefs();
  const palette = useCommandPalette();
  const ws = WORKSPACES.find((w) => w.match(path));
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hair bg-surface px-2 sm:px-3">
      <button className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-raised lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu className="h-4 w-4" />
      </button>
      <button className="hidden h-7 w-7 items-center justify-center rounded text-muted hover:bg-raised hover:text-fg lg:flex" onClick={toggleNav} aria-label={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {navCollapsed ? <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} /> : <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />}
      </button>
      <div className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
        <span className="truncate font-medium text-fg">{ws?.label ?? "Detail"}</span>
      </div>
      <button
        onClick={() => palette.setOpen(true)}
        className="ml-auto flex h-7 min-w-0 flex-1 items-center gap-2 rounded border border-hair bg-canvas px-2 text-sm text-subtle hover:border-edge sm:max-w-[340px] md:ml-6"
        aria-label="Search games, teams, players and commands"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Search games, teams, players…</span>
        <Kbd className="ml-auto hidden sm:inline">⌘K</Kbd>
      </button>
      <div className="ml-auto hidden items-center gap-2 sm:flex">
        <Segmented<LeagueFilter>
          size="sm"
          label="League"
          value={league}
          onChange={setLeague}
          options={[
            { value: "ALL", label: "All" },
            { value: "NBA", label: "NBA" },
            { value: "CBB", label: "NCAA" },
          ]}
        />
        <DataStatus />
      </div>
      <ThemeToggle />
      <Tip content="COURTSIDE AI">
        <button
          aria-label={aiOpen ? "Close COURTSIDE AI" : "Open COURTSIDE AI"}
          aria-pressed={aiOpen}
          onClick={() => setAiOpen(!aiOpen)}
          className={cn("flex h-7 items-center gap-1.5 rounded px-2 text-sm", aiOpen ? "bg-raised text-fg" : "text-muted hover:bg-raised hover:text-fg")}
        >
          <MessageSquareText className="h-4 w-4" strokeWidth={1.75} />
          <span className="hidden xl:inline">AI</span>
        </button>
      </Tip>
      <CommandPalette {...palette} />
    </div>
  );
}

function MobileFilters() {
  const { league, setLeague } = usePrefs();
  return (
    <div className="space-y-2 border-t border-hair p-3 sm:hidden">
      <Segmented<LeagueFilter>
        size="sm"
        label="League"
        value={league}
        onChange={setLeague}
        options={[
          { value: "ALL", label: "All leagues" },
          { value: "NBA", label: "NBA" },
          { value: "CBB", label: "NCAA" },
        ]}
      />
      <DataStatus wide />
    </div>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const collapsed = usePrefs((s) => s.navCollapsed);
  const path = usePathname();
  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    try {
      document.documentElement.dataset.density = localStorage.getItem("ciq-density") ?? "comfortable";
      document.documentElement.dataset.motion = localStorage.getItem("ciq-motion") ?? "on";
    } catch {}
  }, []);
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-canvas">
      <aside className={cn("hidden shrink-0 flex-col border-r border-hair bg-surface transition-[width] duration-150 lg:flex", collapsed ? "w-[52px]" : "w-[208px]")}>
        <Brand collapsed={collapsed} />
        <div className="flex flex-1 flex-col overflow-y-auto py-2">
          <Suspense fallback={null}>
            <NavItems collapsed={collapsed} />
          </Suspense>
        </div>
        {!collapsed && (
          <div className="border-t border-hair px-3 py-2 text-2xs leading-4 text-subtle">
            Research software. Forecasts are probabilities, not advice.
          </div>
        )}
      </aside>
      <Dialog.Root open={menu} onOpenChange={setMenu}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-[61] flex w-[260px] flex-col border-r border-hair bg-surface lg:hidden" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <Dialog.Close className="p-1.5 text-muted" aria-label="Close navigation">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="flex flex-1 flex-col py-2">
              <Suspense fallback={null}>
                <NavItems onNavigate={() => setMenu(false)} />
              </Suspense>
            </div>
            <MobileFilters />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMenu(true)} />
        <Ticker />
        <div className="flex min-h-0 flex-1">
          <main id="main" className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1680px] px-3 py-3 sm:px-4 lg:px-5">{children}</div>
          </main>
          <AIDock />
        </div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return <ShellFrame>{children}</ShellFrame>;
}
