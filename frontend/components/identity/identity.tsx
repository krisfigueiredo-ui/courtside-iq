"use client";

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/format";
import type { Player, Team } from "@/lib/types";

/* Team and player identity.
 * Logos and headshots come from the asset registry (ESPN's CDN with live data). A flat colour tag
 * with the abbreviation (teams) or jersey number (players) is shown only when no asset exists or
 * the image fails to load. */

function rgb(hex: string) {
  const h = (hex || "#888888").replace("#", "").padEnd(6, "8");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const readableOn = (hex: string) => (luminance(hex) > 0.42 ? "#111214" : "#FFFFFF");

function mix(hex: string, target: number, amt: number) {
  const c = rgb(hex).map((x) => Math.round(x + (target - x) * amt));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
function distance(a: string, b: string) {
  const pa = rgb(a);
  const pb = rgb(b);
  return Math.sqrt(pa.reduce((acc, v, i) => acc + (v - pb[i]) ** 2, 0));
}

/** A team colour usable for chart series on either theme: near-black and near-white primaries
 *  fall back to the secondary colour, or are pulled toward mid-tone. */
export function displayColor(t: Pick<Team, "primary" | "secondary">) {
  const ok = (c: string) => luminance(c) >= 0.03 && luminance(c) <= 0.75;
  if (ok(t.primary)) return t.primary;
  if (ok(t.secondary)) return t.secondary;
  return luminance(t.primary) < 0.03 ? mix(t.primary, 255, 0.45) : mix(t.primary, 0, 0.4);
}

/** Colours for two teams shown together, guaranteed to be distinguishable. */
export function pairColors(away: Pick<Team, "primary" | "secondary">, home: Pick<Team, "primary" | "secondary">): [string, string] {
  const a = displayColor(away);
  let h = displayColor(home);
  if (distance(a, h) < 90) h = luminance(home.secondary) >= 0.03 && luminance(home.secondary) <= 0.75 && distance(a, home.secondary) >= 90 ? home.secondary : "#769CE2";
  if (distance(a, h) < 90) return ["#E8772E", "#769CE2"];
  return [a, h];
}

export function TeamCrest({ team, size = 24, className }: { team: Pick<Team, "abbr" | "primary" | "secondary" | "logo" | "league" | "name">; size?: number; className?: string; ring?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (team.logo?.url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.logo.url}
        alt={`${team.name} logo`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className={cn("shrink-0 object-contain", className)}
      />
    );
  }
  const text = team.abbr.slice(0, 4);
  return (
    <span
      role="img"
      aria-label={`${team.name}`}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-sm font-mono font-semibold leading-none", className)}
      style={{ width: size, height: size, background: team.primary, color: readableOn(team.primary), fontSize: Math.max(7, size * (text.length > 3 ? 0.27 : 0.34)) }}
    >
      {text}
    </span>
  );
}

export function TeamName({ team, size = 18, short, href = true, className }: { team: Team; size?: number; short?: boolean; href?: boolean; className?: string }) {
  const inner = (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <TeamCrest team={team} size={size} />
      <span className="truncate font-medium text-fg">{short ? team.abbr : team.name}</span>
    </span>
  );
  return href ? (
    <Link href={`/teams/${team.id}`} className="min-w-0 hover:underline" onClick={(e) => e.stopPropagation()}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function PlayerPortrait({ player, size = 64, className }: { player: Pick<Player, "id" | "name" | "jersey" | "team" | "portrait">; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const h = Math.round(size * 0.73);
  const team = player.team;
  if (player.portrait?.url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={player.portrait.url}
        alt={player.name}
        width={size}
        height={h}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        style={{ width: size, height: h }}
        className={cn("shrink-0 bg-raised object-cover object-top", className)}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={player.name}
      className={cn("inline-flex shrink-0 items-end justify-center bg-raised font-mono font-semibold text-subtle", className)}
      style={{ width: size, height: h, fontSize: size * 0.32, borderBottom: `2px solid ${team?.primary ?? "transparent"}` }}
    >
      {player.jersey ?? player.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
    </span>
  );
}

export function RosterBadge({ player }: { player: Pick<Player, "roster"> }) {
  if (!player.roster) return null;
  return player.roster.verified ? (
    <span className="text-2xs text-subtle" title={`Verified against ${player.roster.source}`}>
      Roster verified {player.roster.source ? `· ${player.roster.source}` : ""}
    </span>
  ) : (
    <span title={`Affiliation from ${player.roster.source} (${player.roster.season}); not yet verified`} className="text-2xs text-warn">
      Unverified roster
    </span>
  );
}
