"use client";

import Link from "next/link";

import { MarketChart, type MarketKind, type MovePoint } from "@/components/charts/MarketChart";
import { C, EChart, baseAxis, tooltip } from "@/components/charts/EChart";
import { pairColors, PlayerPortrait, TeamCrest } from "@/components/identity/identity";
import { Badge, DemoBadge, LiveDot, ProbBar, Tip } from "@/components/ui/primitives";
import { american, cn, featureLabel, num, pct, periodLabel, signed, spreadLine, STAT_LABEL, timeShort } from "@/lib/format";
import type { BoardRow, Explain, Game, PropProjection, Simulation, Team, VsMarket } from "@/lib/types";

export function StatusPill({ g }: { g: Game }) {
  if (g.status === "live")
    return (
      <span className="num inline-flex items-center gap-1 whitespace-nowrap text-xs text-live">
        <LiveDot /> {periodLabel(g.league, g.period, g.clock, g.status)}
      </span>
    );
  if (g.status === "final") return <span className="num whitespace-nowrap text-xs text-subtle">Final</span>;
  if (g.status === "postponed") return <span className="num whitespace-nowrap text-xs text-warn">Postponed</span>;
  return <span className="num whitespace-nowrap text-xs text-fg-2">{timeShort(g.start_time)}</span>;
}

/** Compact matchup block: teams, score or projection, win probability and model vs market. */
export function MatchupCard({ row }: { row: BoardRow; index?: number }) {
  const g = row.game;
  const s = row.simulation;
  const vs = row.vs_market;
  const sp = vs.spread;
  const tot = vs.total;
  const showScore = g.status !== "scheduled";
  const [ca, ch] = pairColors(g.away, g.home);
  return (
    <Link href={`/games/${g.id}`} className="panel panel-hover block min-w-0">
      <div className="flex items-center justify-between border-b border-hair px-3 py-1.5 text-2xs text-subtle">
        <span>
          {g.league === "CBB" ? "NCAA" : "NBA"}
          {g.neutral ? " · neutral" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <DemoBadge show={g.is_demo} />
          <StatusPill g={g} />
        </span>
      </div>
      <div className="space-y-1 px-3 py-2">
        {[
          { t: g.away, score: g.away_score, proj: row.projected.away_score, p: s.win_prob_away },
          { t: g.home, score: g.home_score, proj: row.projected.home_score, p: s.win_prob_home },
        ].map(({ t, score, proj, p }) => (
          <div key={t.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto_44px] items-center gap-2">
            <TeamCrest team={t} size={22} />
            <span className="truncate text-sm text-fg">{t.name}</span>
            <span className={cn("num text-base", showScore ? "text-fg" : "text-muted")} title={showScore ? `projected ${num(proj, 0)}` : "projected"}>
              {showScore ? (score ?? "–") : num(proj, 0)}
            </span>
            <span className="num text-right text-xs text-muted">{pct(p, 0)}</span>
          </div>
        ))}
      </div>
      <ProbBar left={s.win_prob_away} right={s.win_prob_home} leftColor={ca} rightColor={ch} className="px-3" />
      <div className="mt-2 grid grid-cols-3 divide-x divide-hair border-t border-hair">
        <MiniMetric label="Spread" vegas={sp ? spreadLine(sp.market_line_home) : "–"} model={spreadLine(row.projected.spread_home)} edge={sp?.line_diff} />
        <MiniMetric label="Total" vegas={tot ? num(tot.market_line, 1) : "–"} model={num(row.projected.total, 1)} edge={tot ? tot.line_diff : undefined} />
        <MiniMetric
          label="Home win"
          vegas={vs.moneyline ? pct(vs.moneyline.no_vig_home, 0) : "–"}
          model={pct(s.win_prob_home, 0)}
          edgeText={vs.moneyline ? `${signed(vs.moneyline.diff_home * 100, 1)}pp` : undefined}
          hot={vs.moneyline ? Math.abs(vs.moneyline.diff_home) >= 0.05 : false}
        />
      </div>
    </Link>
  );
}

function MiniMetric({ label, vegas, model, edge, edgeText, hot }: { label: string; vegas: string; model: string; edge?: number; edgeText?: string; hot?: boolean }) {
  const isHot = hot ?? (edge != null && Math.abs(edge) >= 2);
  return (
    <div className="min-w-0 px-2.5 py-1.5">
      <div className="text-2xs text-subtle">{label}</div>
      <div className="num grid grid-cols-[auto_1fr] gap-x-2 text-xs leading-5">
        <span className="text-subtle">Mkt</span>
        <span className="text-right text-fg-2">{vegas}</span>
        <span className="text-accent">Mdl</span>
        <span className="text-right text-fg">{model}</span>
      </div>
      {(edge != null || edgeText) && <div className={cn("num text-right text-2xs", isHot ? "text-accent" : "text-subtle")}>Δ {edgeText ?? signed(edge, 1)}</div>}
    </div>
  );
}

/** Vegas vs AI model comparison table. */
export function ModelVsVegas({ g, vs, projected, sim }: { g: Game; vs: VsMarket; projected: BoardRow["projected"]; sim: Simulation }) {
  const rows: { metric: string; vegas: string; model: string; diff?: string; note?: string; hint?: string }[] = [];
  if (vs.spread)
    rows.push({
      metric: `Point spread (${g.home.abbr})`,
      vegas: spreadLine(vs.spread.market_line_home),
      model: spreadLine(projected.spread_home),
      diff: signed(vs.spread.line_diff, 1),
      note: `${g.home.abbr} cover ${pct(vs.spread.p_home_cover)} · push ${pct(vs.spread.p_push, 1)}`,
      hint: "Model line is the pure model projection. Cover probabilities use the market-informed simulation.",
    });
  if (vs.total) rows.push({ metric: "Game total", vegas: num(vs.total.market_line), model: num(projected.total), diff: signed(vs.total.line_diff, 1), note: `Over ${pct(vs.total.p_over)} · Under ${pct(vs.total.p_under)}` });
  if (vs.h1_total) rows.push({ metric: "1st-half total", vegas: num(vs.h1_total.market_line), model: num(projected.h1_total), diff: signed(projected.h1_total - vs.h1_total.market_line, 1), note: `Over ${pct(vs.h1_total.p_over)}` });
  if (vs.moneyline) {
    rows.push({
      metric: `Win probability (${g.home.abbr})`,
      vegas: pct(vs.moneyline.no_vig_home),
      model: pct(sim.win_prob_home),
      diff: signed(vs.moneyline.diff_home * 100, 1) + " pp",
      note: `ML ${american(vs.moneyline.market_home_price)} / ${american(vs.moneyline.market_away_price)} · fair ${american(vs.moneyline.fair_home)}`,
      hint: "Vegas column is the no-vig probability from the consensus moneyline.",
    });
  }
  if (sim.team_totals?.home) rows.push({ metric: `${g.home.abbr} team total`, vegas: num(sim.team_totals.home.line), model: num(projected.home_score), diff: signed(projected.home_score - sim.team_totals.home.line, 1), note: `Over ${pct(sim.team_totals.home.p_over)}` });
  if (sim.team_totals?.away) rows.push({ metric: `${g.away.abbr} team total`, vegas: num(sim.team_totals.away.line), model: num(projected.away_score), diff: signed(projected.away_score - sim.team_totals.away.line, 1), note: `Over ${pct(sim.team_totals.away.p_over)}` });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line/70">
            <th className="label px-4 py-2 text-left">Metric</th>
            <th className="label px-4 py-2 text-right">Vegas</th>
            <th className="label px-4 py-2 text-right text-volt-300">AI model</th>
            <th className="label px-4 py-2 text-right">Diff</th>
            <th className="label hidden px-4 py-2 text-left md:table-cell">Simulation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.metric} className="border-b border-line/40">
              <td className="px-4 py-2.5 text-mist-300">
                {r.hint ? (
                  <Tip content={r.hint}>
                    <span className="cursor-help border-b border-dotted border-mist-500">{r.metric}</span>
                  </Tip>
                ) : (
                  r.metric
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular text-mist-300">{r.vegas}</td>
              <td className="px-4 py-2.5 text-right font-mono font-semibold tabular text-volt-300">{r.model}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular text-mist-400">{r.diff}</td>
              <td className="hidden px-4 py-2.5 text-xs text-mist-400 md:table-cell">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EVChips({ vs, g }: { vs: VsMarket; g: Game }) {
  const chips: { label: string; ev: number }[] = [];
  if (vs.spread) {
    chips.push({ label: `${g.home.abbr} ${spreadLine(vs.spread.market_line_home)}`, ev: vs.spread.ev_home });
    chips.push({ label: `${g.away.abbr} ${spreadLine(-vs.spread.market_line_home)}`, ev: vs.spread.ev_away });
  }
  if (vs.total) {
    chips.push({ label: `Over ${vs.total.market_line}`, ev: vs.total.ev_over });
    chips.push({ label: `Under ${vs.total.market_line}`, ev: vs.total.ev_under });
  }
  if (vs.moneyline?.ev_home != null) chips.push({ label: `${g.home.abbr} ML`, ev: vs.moneyline.ev_home });
  if (vs.moneyline?.ev_away != null) chips.push({ label: `${g.away.abbr} ML`, ev: vs.moneyline.ev_away });
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span key={c.label} className={cn("border-l-2 px-2 py-0.5 text-xs", c.ev > 0 ? "border-pos text-fg" : "border-hair text-muted")}>
          <span className="font-medium">{c.label}</span>
          <span className="ml-2 font-mono">{signed(c.ev * 100, 1)}% EV</span>
        </span>
      ))}
    </div>
  );
}

/** Histogram of simulated outcomes with a market-line marker. */
export function DistributionChart({ hist, line, mean, label, color = C.volt, height = 220, splitColor = true }: { hist: { x: number; p: number }[]; line?: number | null; mean?: number; label: string; color?: string; height?: number; splitColor?: boolean }) {
  return (
    <EChart
      height={height}
      option={{
        grid: { left: 40, right: 12, top: 18, bottom: 28 },
        tooltip: { ...tooltip, formatter: (p: any) => `${label} ${p[0].axisValue}: <b>${(p[0].value * 100).toFixed(2)}%</b>` },
        xAxis: { type: "category", data: hist.map((h) => h.x), ...baseAxis, axisLabel: { ...baseAxis.axisLabel, interval: Math.ceil(hist.length / 10) } },
        yAxis: { type: "value", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, formatter: (v: number) => `${(v * 100).toFixed(0)}%` } },
        series: [
          {
            type: "bar",
            barCategoryGap: "8%",
            data: hist.map((h) => ({
              value: h.p,
              itemStyle: { color: splitColor && line != null ? (h.x >= line ? color : "rgba(138,155,184,0.35)") : color, borderRadius: [2, 2, 0, 0] },
            })),
            markLine:
              line != null
                ? {
                    symbol: "none",
                    label: { color: C.gold, formatter: `Line ${line}`, fontSize: 10.5 },
                    lineStyle: { color: C.gold, type: "dashed", width: 1.5 },
                    data: [{ xAxis: String(hist.reduce((best, h) => (Math.abs(h.x - line) < Math.abs(best - line) ? h.x : best), hist[0]?.x ?? 0)) }],
                  }
                : undefined,
          },
        ],
      }}
    />
  );
}

export function ShapBars({ items, title }: { items: Explain[]; title?: string }) {
  const max = Math.max(...items.map((i) => Math.abs(i.contribution)), 0.01);
  return (
    <div className="space-y-1.5">
      {title && <div className="label mb-2">{title}</div>}
      {items.map((i) => (
        <div key={i.feature} className="grid grid-cols-[1fr_120px_52px] items-center gap-2 text-xs">
          <span className="truncate text-mist-300" title={i.feature}>
            {featureLabel(i.feature)} <span className="font-mono text-mist-500">({num(i.value, Math.abs(i.value) < 2 ? 3 : 1)})</span>
          </span>
          <div className="relative h-1.5 bg-hair">
            <div className="absolute top-0 h-2 w-px bg-mist-500 left-1/2" />
            <div
              className="absolute top-0 h-1.5"
              style={{
                left: i.contribution >= 0 ? "50%" : `${50 - (Math.abs(i.contribution) / max) * 50}%`,
                width: `${(Math.abs(i.contribution) / max) * 50}%`,
                background: i.contribution >= 0 ? C.volt : C.flare,
              }}
            />
          </div>
          <span className={cn("text-right font-mono tabular", i.contribution >= 0 ? "text-volt-300" : "text-flare")}>{signed(i.contribution, 2)}</span>
        </div>
      ))}
    </div>
  );
}

export function WinGauge({ p, home, away, size = 180 }: { p: number; home: Team; away: Team; size?: number }) {
  const [ac, hc] = pairColors(away, home);
  return (
    <EChart
      height={size}
      option={{
        series: [
          {
            type: "gauge",
            startAngle: 200,
            endAngle: -20,
            min: 0,
            max: 100,
            radius: "100%",
            center: ["50%", "62%"],
            progress: { show: true, width: 14, roundCap: true, itemStyle: { color: hc } },
            axisLine: { lineStyle: { width: 14, color: [[1, ac + "55"]] }, roundCap: true },
            pointer: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            anchor: { show: false },
            title: { show: true, offsetCenter: [0, "34%"], color: C.mist4, fontSize: 11 },
            detail: { valueAnimation: true, offsetCenter: [0, "-4%"], formatter: "{value}%", color: C.mist, fontSize: 32, fontWeight: 700, fontFamily: "Space Grotesk, Inter, sans-serif" },
            data: [{ value: Math.round(p * 1000) / 10, name: `${home.abbr} win probability` }],
          },
        ],
      }}
    />
  );
}

export function LineMovementChart({ series, market, height = 240, model, homeAbbr }: { series: Record<string, MovePoint[]>; market: MarketKind; height?: number; model?: number | null; homeAbbr?: string }) {
  return <MarketChart points={series[market] ?? []} market={market} height={height} model={model} homeAbbr={homeAbbr} />;
}

export function PropCard({ p, stat, onClick, active }: { p: PropProjection; stat: string; onClick?: () => void; active?: boolean }) {
  const m = p.markets[stat];
  const pl = p.player!;
  const g = p.game;
  const opp = g ? (g.home.id === pl.team?.id ? g.away : g.home) : null;
  const lean = m?.p_over != null ? (m.p_over >= (m.p_under ?? 0) ? "over" : "under") : null;
  const leanP = lean === "over" ? m?.p_over : m?.p_under;
  return (
    <button onClick={onClick} className={cn("panel panel-hover w-full overflow-hidden text-left", active && "border-accent")}>
      <div className="flex gap-3 p-3">
        <PlayerPortrait player={pl} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-display text-[15px] font-semibold text-mist">{pl.name}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-mist-400">
                {pl.team && <TeamCrest team={pl.team} size={14} ring={false} />}
                {pl.team?.abbr} · {pl.position ?? "—"} {pl.jersey ? `· #${pl.jersey}` : ""}
                {opp && (
                  <>
                    <span className="text-mist-500">vs</span>
                    <TeamCrest team={opp} size={14} ring={false} /> {opp.abbr}
                  </>
                )}
              </div>
            </div>
            {p.injury_out && <Badge tone="loss">Out</Badge>}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <div className="label">Line</div>
              <div className={cn("font-mono text-sm font-semibold", m?.line != null ? "text-mist" : "text-mist-500")}>{m?.line ?? "pending"}</div>
            </div>
            <div>
              <div className="label">Model</div>
              <div className="font-mono text-sm font-semibold text-volt-300">{num(m?.mean, 1)}</div>
            </div>
            <div>
              <div className="label">Minutes</div>
              <div className="font-mono text-sm text-mist-300">{num(p.minutes.mean, 1)}</div>
            </div>
          </div>
        </div>
      </div>
      {m && m.p_over == null && (
        <div className="flex items-center justify-between border-t border-line/60 px-3 py-2 text-[10.5px] text-mist-500">
          <span>
            {STAT_LABEL[stat]} 80% range {num(m.p10, 0)}–{num(m.p90, 0)}
          </span>
          <span>no sportsbook line yet</span>
        </div>
      )}
      {m?.p_over != null && (
        <div className="border-t border-line/60 px-3 py-2">
          <ProbBar left={m.p_over} right={m.p_under ?? 0} push={m.p_push ?? 0} leftLabel={`Over ${pct(m.p_over, 0)}`} rightLabel={`Under ${pct(m.p_under, 0)}`} leftColor={C.volt} rightColor={C.flare} />
          <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-mist-500">
            <span>
              {STAT_LABEL[stat]} · {m.book}
            </span>
            {lean && (
              <span className={cn("font-mono", (lean === "over" ? m.ev_over! : m.ev_under!) > 0 ? "text-gain" : "text-mist-500")}>
                {lean} {pct(leanP, 0)} · EV {signed(((lean === "over" ? m.ev_over : m.ev_under) ?? 0) * 100, 1)}%
              </span>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
