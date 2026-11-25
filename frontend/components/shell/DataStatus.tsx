"use client";

import * as Popover from "@radix-ui/react-popover";

import { STATIC } from "@/lib/api";
import { ago, cn, dateTime } from "@/lib/format";
import { useStatus } from "@/lib/hooks";

/** One place for data provenance: source, mode, freshness, models and live overlay. */
export function freshness(status: any): { kind: "live" | "fresh" | "stale" | "demo" | "unavailable"; label: string } {
  if (!status) return { kind: "unavailable", label: "Connecting" };
  if (status.demo) return { kind: "demo", label: "Demo data" };
  const t = Date.parse(status.server_time ?? "");
  const age = Number.isFinite(t) ? (Date.now() - t) / 60_000 : Infinity;
  if (!STATIC) return { kind: "live", label: "Live" };
  if (age > 6 * 60) return { kind: "stale", label: `Stale · ${ago(status.server_time)}` };
  return { kind: "fresh", label: `Built ${ago(status.server_time)}` };
}

const DOT: Record<string, string> = { live: "bg-pos", fresh: "bg-pos", stale: "bg-warn", demo: "bg-warn", unavailable: "bg-subtle" };

export function DataStatus({ wide }: { wide?: boolean }) {
  const { data, isError } = useStatus();
  const f = isError ? { kind: "unavailable" as const, label: "API unavailable" } : freshness(data);
  const source = data?.data_source === "espn" ? "ESPN" : data?.demo ? "Simulator" : (data?.data_source ?? "—");
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn("flex h-7 items-center gap-1.5 rounded border border-hair px-2 text-xs text-fg-2 hover:border-edge", wide && "w-full")}
        aria-label={`Data status: ${source}, ${f.label}`}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", DOT[f.kind])} />
        <span className="font-medium">{source}</span>
        <span className="hidden text-subtle xl:inline">{f.label}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-[90] w-[300px] rounded border border-edge bg-overlay p-0 text-xs shadow-pop">
          <div className="border-b border-hair px-3 py-2 text-sm font-semibold text-fg">Data status</div>
          <dl className="divide-y divide-hair">
            {[
              ["Source", data?.data_source === "espn" ? "ESPN public API (scores, DraftKings lines, box scores, injuries, rosters)" : data?.demo ? "Synthetic simulator (not real games)" : source],
              ["Mode", data?.demo ? "Demo" : STATIC ? "Static build, rebuilt every 2 hours" : "Live API"],
              ["Forecasts built", data?.server_time ? `${dateTime(data.server_time)} (${ago(data.server_time)})` : "—"],
              ["Latest game update", data?.freshness?.games ? ago(data.freshness.games) : "—"],
              ["Latest line", data?.freshness?.odds ? ago(data.freshness.odds) : "—"],
              ["Live scores", STATIC ? "Refreshed in the browser from ESPN while games are in progress" : `Polled every ${data?.refresh?.live_seconds ?? "—"}s`],
              ["Assistant", data?.ai_enabled ? `On (${data.ai_model})` : "Off: needs the full application and an API key"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[96px_1fr] gap-2 px-3 py-1.5">
                <dt className="text-subtle">{k}</dt>
                <dd className="text-fg-2">{v}</dd>
              </div>
            ))}
          </dl>
          {!!data?.models?.length && (
            <div className="border-t border-hair px-3 py-2">
              <div className="label mb-1">Active models</div>
              {data.models.map((m: any) => (
                <div key={m.version} className="num flex justify-between gap-2 text-2xs text-muted">
                  <span className="truncate">{m.version}</span>
                  <span className={m.data_source === "real" ? "text-pos" : "text-warn"}>{m.data_source}</span>
                </div>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
