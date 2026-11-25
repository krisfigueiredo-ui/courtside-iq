"use client";

import Link from "next/link";

import { TeamCrest } from "@/components/identity/identity";
import { LiveDot } from "@/components/ui/primitives";
import { cn, periodLabel, timeShort } from "@/lib/format";
import { useTicker } from "@/lib/hooks";
import { usePrefs } from "@/lib/store";
import type { Game } from "@/lib/types";

function Cell({ g }: { g: Game }) {
  const live = g.status === "live";
  const final = g.status === "final";
  const hs = g.home_score;
  const as = g.away_score;
  const lead = (s: number | null, o: number | null) => s != null && o != null && s > o;
  return (
    <Link
      href={`/games/${g.id}`}
      className={cn("flex h-full shrink-0 items-center gap-2.5 border-r border-hair px-3 hover:bg-raised", live && "bg-live/[0.04]")}
      aria-label={`${g.away.name} ${as ?? ""} at ${g.home.name} ${hs ?? ""}, ${g.status}`}
    >
      <div className="grid grid-cols-[14px_34px_24px] items-center gap-x-1.5 gap-y-0.5 text-xs">
        {[
          { t: g.away, s: as, w: lead(as, hs) },
          { t: g.home, s: hs, w: lead(hs, as) },
        ].map(({ t, s, w }) => (
          <div key={t.id} className="contents">
            <TeamCrest team={t} size={14} />
            <span className={cn("truncate font-medium", final && !w ? "text-subtle" : "text-fg")}>{t.abbr}</span>
            <span className={cn("num text-right", final && !w ? "text-subtle" : "text-fg", live && "font-medium")}>{s ?? ""}</span>
          </div>
        ))}
      </div>
      <div className="num flex w-12 flex-col items-start gap-0.5 text-2xs leading-4">
        {live ? (
          <span className="flex items-center gap-1 text-live">
            <LiveDot />
            {periodLabel(g.league, g.period, g.clock, g.status)}
          </span>
        ) : final ? (
          <span className="text-subtle">Final</span>
        ) : (
          <span className="text-fg-2">{timeShort(g.start_time)}</span>
        )}
        <span className="text-subtle">{g.league === "CBB" ? "NCAA" : "NBA"}</span>
      </div>
    </Link>
  );
}

/** Score strip under the top bar. Follows the global league filter. */
export function Ticker() {
  const league = usePrefs((s) => s.league);
  const { data, isLoading } = useTicker(league === "ALL" ? undefined : league);
  const games = [...(data?.games ?? [])].sort((a, b) => {
    const rank = (g: Game) => (g.status === "live" ? 0 : g.status === "scheduled" ? 1 : 2);
    return rank(a) - rank(b) || Date.parse(a.start_time) - Date.parse(b.start_time);
  });
  return (
    <div className="h-11 shrink-0 border-b border-hair bg-surface">
      <div className="no-scrollbar flex h-full overflow-x-auto" role="list" aria-label="Scores">
        {isLoading && <div className="skeleton m-2 h-7 w-[60%]" />}
        {!isLoading && games.length === 0 && <div className="flex items-center px-3 text-xs text-subtle">No games in the current window.</div>}
        {games.map((g) => (
          <Cell key={g.id} g={g} />
        ))}
      </div>
    </div>
  );
}
