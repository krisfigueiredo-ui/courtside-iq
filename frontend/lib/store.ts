"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";
export type LeagueFilter = "ALL" | "NBA" | "CBB";

/** Viewer preferences (persisted per browser). */
interface Prefs {
  theme: Theme;
  navCollapsed: boolean;
  aiOpen: boolean;
  league: LeagueFilter;
  conference: string | null;
  setTheme: (t: Theme) => void;
  toggleNav: () => void;
  setAiOpen: (v: boolean) => void;
  setLeague: (l: LeagueFilter) => void;
  setConference: (c: string | null) => void;
}

const safeStorage = createJSONStorage(() => {
  try {
    const k = "__ciq";
    window.localStorage.setItem(k, k);
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  }
});

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      theme: "system",
      navCollapsed: false,
      aiOpen: false,
      league: "ALL",
      conference: null,
      setTheme: (theme) => set({ theme }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      setAiOpen: (aiOpen) => set({ aiOpen }),
      setLeague: (league) => set({ league, conference: league === "CBB" ? null : null }),
      setConference: (conference) => set({ conference }),
    }),
    { name: "courtside-prefs", storage: safeStorage, partialize: (s) => ({ theme: s.theme, navCollapsed: s.navCollapsed, league: s.league }) },
  ),
);

/** What the viewer is looking at right now: shared with the AI assistant and the command palette. */
export interface Selection {
  game?: { id: number; label: string; league: string } | null;
  team?: { id: number; label: string } | null;
  player?: { id: number; label: string } | null;
  market?: string | null;
}

interface SelectionState extends Selection {
  select: (s: Partial<Selection>) => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>()((set) => ({
  game: null,
  team: null,
  player: null,
  market: null,
  select: (s) => set(s),
  clear: () => set({ game: null, team: null, player: null, market: null }),
}));

export function resolvedTheme(t: Theme): "dark" | "light" {
  if (t !== "system") return t;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}
