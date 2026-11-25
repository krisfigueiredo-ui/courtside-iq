"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { AIChat } from "@/components/shell/AIChat";
import { cn } from "@/lib/format";
import { usePrefs, useSelection } from "@/lib/store";

/** Collapsible assistant dock. Docked beside the workspace on wide screens, overlaid on small ones.
 *  The assistant is told what the viewer has selected (game, team, player, market, page). */
export function AIDock() {
  const { aiOpen, setAiOpen } = usePrefs();
  const sel = useSelection();
  const path = usePathname();
  const gameId = Number(path.match(/^\/games\/(\d+)/)?.[1]) || sel.game?.id;
  const playerId = Number(path.match(/^\/players\/(\d+)/)?.[1]) || sel.player?.id;
  const teamId = Number(path.match(/^\/teams\/(\d+)/)?.[1]) || sel.team?.id;
  const context = {
    page: path,
    ...(gameId ? { game_id: gameId, game: sel.game?.label } : {}),
    ...(teamId ? { team_id: teamId, team: sel.team?.label } : {}),
    ...(playerId ? { player_id: playerId, player: sel.player?.label } : {}),
    ...(sel.market ? { market: sel.market } : {}),
  };
  const chips = [sel.game?.label && `Game: ${sel.game.label}`, sel.team?.label && `Team: ${sel.team.label}`, sel.player?.label && `Player: ${sel.player.label}`, sel.market && `Market: ${sel.market}`].filter(Boolean) as string[];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && aiOpen && window.innerWidth < 1280 && setAiOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiOpen, setAiOpen]);
  if (!aiOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/40 xl:hidden" onClick={() => setAiOpen(false)} aria-hidden />
      <aside
        aria-label="COURTSIDE AI"
        className={cn("fixed inset-y-0 right-0 z-[71] flex w-full max-w-[400px] flex-col border-l border-hair bg-surface xl:static xl:z-auto xl:w-[380px] xl:max-w-none")}
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-hair px-3">
          <span className="text-sm font-semibold text-fg">COURTSIDE AI</span>
          <button onClick={() => setAiOpen(false)} className="p-1 text-muted hover:text-fg" aria-label="Close assistant">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-hair px-3 py-1.5 text-2xs text-subtle">
          <span>Context:</span>
          {chips.length ? chips.map((c) => <span key={c} className="text-fg-2">{c}</span>) : <span className="text-fg-2">{path === "/" ? "Command Center" : path}</span>}
        </div>
        <AIChat compact context={context} />
      </aside>
    </>
  );
}
