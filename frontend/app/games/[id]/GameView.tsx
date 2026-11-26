"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { C } from "@/components/charts/EChart";
import { DistributionChart, EVChips, LineMovementChart, ModelVsVegas, PropCard, ShapBars, StatusPill, WinGauge } from "@/components/game/game";
import { LadderTable } from "@/components/game/Ladder";
import { BoxScore } from "@/components/live/BoxScore";
import { GameFlow } from "@/components/live/GameFlow";
import { PlayFeed } from "@/components/live/PlayFeed";
import { ShotChart } from "@/components/live/ShotChart";
import { livePace, useEspnGame } from "@/lib/espn-game";
import { pairColors, TeamCrest } from "@/components/identity/identity";
import { Badge, DemoBadge, Empty, ErrorState, KV, Panel, PanelHeader, ProbBar, ResultBadge, Segmented, Skeleton, SourceStamp, Stat, TabBar, Tip } from "@/components/ui/primitives";
import { STATIC, useApi } from "@/lib/api";
import { american, cn, dateTime, MARKET_LABEL, num, pct, signed, spreadLine, STAT_LABEL } from "@/lib/format";
import { useSelection } from "@/lib/store";
import { HeadToHead } from "@/components/views/HeadToHead";
import type { Game, Projection, PropProjection } from "@/lib/types";

export default function GameView({ id }: { id: string }) {
  const [sims, setSims] = useState("10000");
  const q = useApi<any>(`/api/games/${id}?n_sims=${sims}`, { refetchInterval: 30_000 });
  const props = useApi<PropProjection[]>(`/api/games/${id}/props`);
  const [mvMarket, setMvMarket] = useState<"spreads" | "totals" | "h2h">("spreads");
  const [stat, setStat] = useState("pts");
  const [tab, setTab] = useState<"model" | "flow" | "h2h" | "props" | "log">("model");
  const select = useSelection((st) => st.select);
  const gd: Game | undefined = q.data?.game;
  useEffect(() => {
    if (gd) select({ game: { id: gd.id, label: `${gd.away.abbr} @ ${gd.home.abbr}`, league: gd.league } });
  }, [gd, select]);

  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Skeleton className="h-[600px]" />;
  const g: Game = q.data.game;
  const p: Projection | null = q.data.projection;
  const live = q.data.live;
  const ctx = q.data.context ?? {};

  return (
    <div className="space-y-3">
      <GameHeader g={g} p={p} live={live} />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "model", label: "Model & market" },
          { value: "flow", label: "Game flow" },
          { value: "h2h", label: "Head-to-head" },
          { value: "props", label: "Player props", count: props.data?.length || undefined },
          { value: "log", label: "Forecast log", count: q.data.predictions?.length || undefined },
        ]}
      />
      {tab === "model" && (
        <div className="space-y-3">
      {!p ? (
        <Panel>
          <Empty title="No active model for this league yet">Train a model in Model Intelligence to generate projections.</Empty>
        </Panel>
      ) : (
        <>
          {live && (
            <Panel>
              <PanelHeader eyebrow="Live projection" title="In-game update" right={<span className="text-[11px] text-mist-500">{live.method}</span>} />
              <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-5">
                <Stat label="Live win prob (home)" value={pct(live.live_win_prob_home)} sub={`pre-game ${pct(p.simulation.win_prob_home)}`} tone="volt" />
                <Stat label="Live proj. total" value={num(live.live_projected_total)} sub={`pre-game ${num(p.projected.total)}`} />
                <Stat label="Live proj. margin" value={signed(live.live_projected_margin)} sub={`current ${signed(live.current_margin, 0)}`} />
                <Stat label="Pace vs projection" value={`${num(live.pace_vs_projection * 100, 0)}%`} tone={live.pace_vs_projection > 1.04 ? "flare" : live.pace_vs_projection < 0.96 ? "cyan" : undefined} />
                <Stat label="Game remaining" value={pct(live.fraction_remaining, 0)} sub={`${num(live.minutes_elapsed, 1)} min elapsed`} />
              </div>
            </Panel>
          )}

          <div className="grid gap-3 xl:grid-cols-[340px_1fr]">
            <Panel>
              <PanelHeader eyebrow="Simulation" title="Win probability" right={<Segmented size="sm" value={sims} onChange={setSims} options={STATIC ? [{ value: "10000", label: "10k" }] : [{ value: "10000", label: "10k" }, { value: "50000", label: "50k" }]} />} />
              <div className="px-2">
                <WinGauge p={p.simulation.win_prob_home} home={g.home} away={g.away} />
              </div>
              <div className="space-y-0.5 border-t border-line/60 px-4 py-3">
                <KV k="Simulations" v={p.simulation.n_sims.toLocaleString()} />
                <KV k="Random seed" v={<span className="font-mono">{p.seed}</span>} />
                <KV k="Margin 90% interval" v={`${signed(p.simulation.margin.p05, 0)} to ${signed(p.simulation.margin.p95, 0)}`} />
                <KV k="Total 90% interval" v={`${num(p.simulation.total.p05, 0)}–${num(p.simulation.total.p95, 0)}`} />
                <KV k="Mean / median total" v={`${num(p.simulation.total.mean)} / ${num(p.simulation.total.median, 0)}`} />
                <KV k="Uncalibrated win %" v={pct(p.simulation.win_prob_home_raw)} />
                {p.posterior?.market_informed && (
                  <KV
                    k={
                      <Tip content="Probabilities combine the model projection with the market line using weights fit on historical out-of-sample data. w is the weight on the model.">
                        <span className="cursor-help border-b border-dotted border-mist-500">Market-informed weights</span>
                      </Tip>
                    }
                    v={`w spread ${num(p.posterior.w_margin, 2)} · total ${num(p.posterior.w_total, 2)}`}
                  />
                )}
              </div>
              <div className="px-4 pb-3">
                <SourceStamp source={p.model_version} />
                {p.model_data_source === "synthetic_demo" && <div className="mt-1 text-[10.5px] text-flare">Model trained on synthetic demo data.</div>}
              </div>
            </Panel>

            <div className="space-y-3">
              <Panel>
                <PanelHeader eyebrow="Model vs Vegas" title="Market comparison" right={<SourceStamp source={p.market.books?.join(", ")} at={p.market.captured_at} demo={p.market.is_demo} />} />
                {p.vs_market.spread || p.vs_market.total ? (
                  <>
                    <ModelVsVegas g={g} vs={p.vs_market} projected={p.projected} sim={p.simulation} />
                    <div className="border-t border-line/60 p-4">
                      <div className="label mb-2">Model-implied expected value per unit (best available consensus price)</div>
                      <EVChips vs={p.vs_market} g={g} />
                    </div>
                  </>
                ) : (
                  <Empty title="No sportsbook odds captured yet">Projections are shown without market comparison until a licensed odds feed provides a line.</Empty>
                )}
              </Panel>
              {p.market.by_book && p.market.by_book.length > 0 && (
                <Panel>
                  <PanelHeader eyebrow="Sportsbooks" title="Book-by-book" />
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-[12.5px]">
                      <thead>
                        <tr className="border-b border-line/70">
                          {["Book", `${g.home.abbr} spread`, `${g.away.abbr} spread`, "Total O/U", `${g.home.abbr} ML`, `${g.away.abbr} ML`, "Updated"].map((h) => (
                            <th key={h} className="label px-3 py-2 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {p.market.by_book.map((b: any) => (
                          <tr key={b.book} className="border-b border-line/40 font-mono tabular text-mist-300">
                            <td className="px-3 py-2 font-sans font-medium text-mist">{b.book}</td>
                            <td className="px-3 py-2">{spreadLine(b.spreads_home?.line)} <span className="text-mist-500">{american(b.spreads_home?.price)}</span></td>
                            <td className="px-3 py-2">{spreadLine(b.spreads_away?.line)} <span className="text-mist-500">{american(b.spreads_away?.price)}</span></td>
                            <td className="px-3 py-2">{num(b.totals_over?.line)} <span className="text-mist-500">{american(b.totals_over?.price)}/{american(b.totals_under?.price)}</span></td>
                            <td className="px-3 py-2">{american(b.h2h_home?.price)}</td>
                            <td className="px-3 py-2">{american(b.h2h_away?.price)}</td>
                            <td className="px-3 py-2 text-mist-500">{dateTime(b.captured_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel>
              <PanelHeader eyebrow="Outcome distribution" title={`Final margin (${g.home.abbr} − ${g.away.abbr})`} />
              <div className="p-2">
                <DistributionChart hist={p.simulation.margin_hist ?? []} line={p.simulation.spread ? -p.simulation.spread.line_home : null} label="Margin" />
              </div>
              {p.simulation.spread && (
                <div className="px-4 pb-4">
                  <ProbBar left={p.simulation.spread.p_home_cover} right={p.simulation.spread.p_away_cover} push={p.simulation.spread.p_push} leftLabel={`${g.home.abbr} ${spreadLine(p.simulation.spread.line_home)} covers ${pct(p.simulation.spread.p_home_cover)}`} rightLabel={`${g.away.abbr} ${pct(p.simulation.spread.p_away_cover)}`} />
                </div>
              )}
            </Panel>
            <Panel>
              <PanelHeader eyebrow="Outcome distribution" title="Full-game total" />
              <div className="p-2">
                <DistributionChart hist={p.simulation.total_hist ?? []} line={p.simulation.totals?.line} label="Total" color={C.cyan} />
              </div>
              {p.simulation.totals && (
                <div className="px-4 pb-4">
                  <ProbBar left={p.simulation.totals.p_over} right={p.simulation.totals.p_under} push={p.simulation.totals.p_push} leftLabel={`Over ${p.simulation.totals.line}: ${pct(p.simulation.totals.p_over)}`} rightLabel={`Under ${pct(p.simulation.totals.p_under)}`} leftColor={C.cyan} rightColor={C.flare} />
                </div>
              )}
            </Panel>
          </div>

          {p.simulation.ladder && (
            <Panel>
              <PanelHeader eyebrow="Alternate lines" title="Price any line from the simulation" />
              <LadderTable ladder={p.simulation.ladder} g={g} mainSpread={p.market.spread_home} mainTotal={p.market.total} />
            </Panel>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel>
              <PanelHeader eyebrow="Explainability (SHAP)" title="What drives the spread projection" />
              <div className="p-4">
                {p.explain && (
                  <>
                    <div className="mb-3 text-xs text-mist-400">
                      Structural efficiency baseline <span className="font-mono text-mist">{signed(p.explain.margin[0]?.structural_baseline)}</span> → ML adjustments below → projection{" "}
                      <span className="font-mono text-volt-300">{signed(p.projected.margin)}</span> (home margin).
                    </div>
                    <ShapBars items={p.explain.margin} />
                  </>
                )}
              </div>
            </Panel>
            <Panel>
              <PanelHeader eyebrow="Explainability (SHAP)" title="What drives the total projection" />
              <div className="p-4">
                {p.explain && (
                  <>
                    <div className="mb-3 text-xs text-mist-400">
                      Baseline <span className="font-mono text-mist">{num(p.explain.total[0]?.structural_baseline)}</span> (pace × adjusted efficiency) → projection{" "}
                      <span className="font-mono text-volt-300">{num(p.projected.total)}</span>.
                    </div>
                    <ShapBars items={p.explain.total} />
                  </>
                )}
              </div>
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
            <Panel>
              <PanelHeader
                eyebrow="Odds movement"
                title="Line history by sportsbook"
               
                right={<Segmented size="sm" value={mvMarket} onChange={setMvMarket} options={[{ value: "spreads", label: "Spread" }, { value: "totals", label: "Total" }, { value: "h2h", label: "ML" }]} />}
              />
              <div className="p-2">
                {q.data.movement?.n ? <LineMovementChart series={q.data.movement.series} market={mvMarket} /> : <Empty title="No snapshots captured" />}
              </div>
              <div className="grid grid-cols-3 gap-px border-t border-line/60 bg-line/40">
                {(["spreads", "totals", "h2h"] as const).map((k) => {
                  const s = q.data.movement?.summary?.[k];
                  return (
                    <div key={k} className="bg-ink-850 px-4 py-2.5">
                      <div className="label">{k === "h2h" ? "Moneyline (home)" : k === "spreads" ? "Spread (home)" : "Total"}</div>
                      <div className="mt-0.5 font-mono text-xs text-mist-300">
                        {s ? (
                          <>
                            open {k === "h2h" ? american(s.open) : s.open} → {s.closed ? "close" : "now"}{" "}
                            {k === "h2h" ? american(s.closed && s.close != null ? s.close : s.current) : s.closed && s.close != null ? s.close : s.current}{" "}
                            <span className={cn(s.move ? "text-flare" : "text-mist-500")}>({signed(s.move, 1)})</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                      {s && <div className="text-[10px] text-mist-500">{s.n_snapshots} snapshots</div>}
                    </div>
                  );
                })}
              </div>
            </Panel>
            <Panel>
              <PanelHeader eyebrow="Pre-game context" title="Rest, travel, availability" />
              <div className="divide-y divide-line/50">
                {(["away", "home"] as const).map((side) => {
                  const c = ctx[side] ?? {};
                  const t = side === "home" ? g.home : g.away;
                  return (
                    <div key={side} className="px-4 py-3">
                      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-mist">
                        <TeamCrest team={t} size={18} /> {t.name}
                      </div>
                      <KV k="Rest days" v={c.rest_days ?? "—"} />
                      <KV k="Travel (miles)" v={c.travel_miles != null ? num(c.travel_miles, 0) : "—"} />
                      <KV k="Injury impact (pts/100)" v={c.injury_impact != null ? num(c.injury_impact, 1) : "—"} />
                      <KV k="Lineup change" v={c.lineup_change ? "yes" : "no"} />
                      {g.league === "CBB" && <KV k="Roster continuity" v={c.roster_continuity != null ? pct(c.roster_continuity, 0) : "—"} />}
                    </div>
                  );
                })}
                <div className="px-4 py-2 text-[10.5px] text-mist-500">Known as of {ctx.known_at ? dateTime(ctx.known_at) : "—"}</div>
              </div>
            </Panel>
          </div>
        </>
      )}
        </div>
      )}
      {tab === "flow" && (
        <div className="space-y-3">
          <GameFlowTab g={g} modelPregame={p?.simulation?.win_prob_home} />
      {q.data.box?.home && (
        <Panel>
          <PanelHeader eyebrow="Box score" title="Team totals" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line/70">
                  {["Team", "PTS", "1H", "FGM-A", "3PM-A", "FTM-A", "OREB", "DREB", "TOV", "Poss", "eFG%"].map((h) => (
                    <th key={h} className="label px-3 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["away", "home"] as const).map((side) => {
                  const b = q.data.box[side];
                  const t = side === "home" ? g.home : g.away;
                  return (
                    <tr key={side} className="border-b border-line/40 font-mono tabular text-mist-300">
                      <td className="px-3 py-2 font-sans"><span className="flex items-center gap-2"><TeamCrest team={t} size={18} />{t.abbr}</span></td>
                      <td className="px-3 py-2 font-semibold text-mist">{b.points}</td>
                      <td className="px-3 py-2">{b.h1_points}</td>
                      <td className="px-3 py-2">{b.fgm}-{b.fga}</td>
                      <td className="px-3 py-2">{b.fg3m}-{b.fg3a}</td>
                      <td className="px-3 py-2">{b.ftm}-{b.fta}</td>
                      <td className="px-3 py-2">{b.oreb}</td>
                      <td className="px-3 py-2">{b.dreb}</td>
                      <td className="px-3 py-2">{b.tov}</td>
                      <td className="px-3 py-2">{num(b.possessions)}</td>
                      <td className="px-3 py-2">{pct((b.fgm + 0.5 * b.fg3m) / b.fga)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {q.data.events?.length > 0 && (
        <Panel>
          <PanelHeader eyebrow="Game feed" title="Scoring updates" />
          <ul className="max-h-64 divide-y divide-line/40 overflow-y-auto">
            {[...q.data.events].reverse().map((e: any) => (
              <li key={e.seq} className="flex items-center gap-3 px-4 py-2 text-xs">
                <span className="w-16 font-mono text-mist-500">{g.league === "NBA" ? `Q${e.period}` : `H${e.period}`} {e.clock}</span>
                <span className="flex-1 text-mist-300">{e.description}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
        </div>
      )}
      {tab === "h2h" && <HeadToHead g={g} />}
      {tab === "props" && (
        <div className="space-y-3">
      {(props.data?.length ?? 0) > 0 && (
        <Panel>
          <PanelHeader
            eyebrow="Player props"
            title="Projected player outcomes"
            right={<Segmented size="sm" value={stat} onChange={setStat} options={["pts", "reb", "ast", "fg3m", "pra"].map((s) => ({ value: s, label: STAT_LABEL[s].replace("PTS+REB+AST", "PRA") }))} />}
          />
          <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
            {props.data!.map((pp) => (
              <Link key={pp.player_id} href={`/players/${pp.player_id}`}>
                <PropCard p={{ ...pp, game: g }} stat={stat} />
              </Link>
            ))}
          </div>
        </Panel>
      )}
          {!(props.data?.length ?? 0) && <Panel><Empty title="No player projections for this game">Player projections cover NBA games with an active props model.</Empty></Panel>}
        </div>
      )}
      {tab === "log" && (
      <Panel>
        <PanelHeader eyebrow="Prediction archive" title="Frozen forecasts for this game" right={<span className="text-[11px] text-mist-500">append-only · never overwritten on retrain</span>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line/70">
                {["Created", "Data as of", "Market", "Selection", "Line", "Prob", "Projection", "Price", "Model", "Actual", "Result"].map((h) => (
                  <th key={h} className="label px-3 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(q.data.predictions ?? []).filter((r: any) => !r.player_id).slice(0, 40).map((r: any) => (
                <tr key={r.id} className="border-b border-line/40 font-mono tabular text-mist-300">
                  <td className="px-3 py-2">{dateTime(r.created_at)}</td>
                  <td className="px-3 py-2">{dateTime(r.data_as_of)}</td>
                  <td className="px-3 py-2 font-sans">{MARKET_LABEL[r.market] ?? r.market}</td>
                  <td className="px-3 py-2 font-sans">{r.selection}</td>
                  <td className="px-3 py-2">{r.line ?? "—"}</td>
                  <td className="px-3 py-2 text-volt-300">{pct(r.prob)}</td>
                  <td className="px-3 py-2">{num(r.value)}</td>
                  <td className="px-3 py-2">{american(r.price)}</td>
                  <td className="px-3 py-2 text-[11px] text-mist-500">{r.model_version}</td>
                  <td className="px-3 py-2">{num(r.actual, 0)}</td>
                  <td className="px-3 py-2"><ResultBadge result={r.result} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q.data.predictions?.length && <Empty title="No archived forecasts yet">Forecasts are frozen automatically once odds are available inside 30 hours of tip-off.</Empty>}
        </div>
      </Panel>
      )}
    </div>
  );
}

function GameHeader({ g, p, live }: { g: Game; p: Projection | null; live: any }) {
  const [ca, ch] = pairColors(g.away, g.home);
  const wpHome = live ? live.live_win_prob_home : p?.simulation.win_prob_home;
  const scored = g.status !== "scheduled";
  const side = (t: Game["home"], score: number | null, proj: number | undefined, label: string, right?: boolean) => (
    <Link href={`/teams/${t.id}`} className={cn("flex min-w-0 items-center gap-3", right && "flex-row-reverse text-right")}>
      <TeamCrest team={t} size={44} />
      <div className="min-w-0">
        <div className="text-2xs text-subtle">{label}</div>
        <div className="truncate text-base font-semibold text-fg hover:underline">{t.name}</div>
      </div>
      <div className={cn("num text-[34px] font-medium leading-none", right ? "mr-auto" : "ml-auto", scored ? "text-fg" : "text-muted")} title={scored ? undefined : "model projection"}>
        {scored ? (score ?? "–") : num(proj, 0)}
      </div>
    </Link>
  );
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hair px-3 py-1.5 text-xs">
        <span className="text-muted">
          {g.league === "CBB" ? "NCAA" : "NBA"} · {g.season} · {dateTime(g.start_time)}
          {g.neutral ? " · neutral site" : ""}
        </span>
        <span className="flex items-center gap-2">
          <DemoBadge show={g.is_demo} />
          <StatusPill g={g} />
        </span>
      </div>
      <div className="grid items-center gap-4 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {side(g.away, g.away_score, p?.projected.away_score, g.neutral ? "Team A" : "Away")}
        <div className="num flex flex-col items-center text-center text-2xs text-subtle">
          {scored ? <span>{g.status === "final" ? "Final" : "Live"}</span> : <span>Projected</span>}
          {g.home_h1 != null && (
            <span>
              1H {g.away_h1}–{g.home_h1}
            </span>
          )}
          {p?.market?.spread_home != null && (
            <span className="text-muted">
              {g.home.abbr} {spreadLine(p.market.spread_home)} · O/U {num(p.market.total, 1)}
            </span>
          )}
        </div>
        {side(g.home, g.home_score, p?.projected.home_score, g.neutral ? "Team B" : "Home", true)}
      </div>
      {wpHome != null && (
        <div className="px-4 pb-3">
          <ProbBar left={1 - wpHome} right={wpHome} leftColor={ca} rightColor={ch} leftLabel={`${g.away.abbr} ${pct(1 - wpHome)}`} rightLabel={`${pct(wpHome)} ${g.home.abbr}`} />
          <div className="mt-1 text-center text-2xs text-subtle">{live ? "Live model win probability" : "Model win probability, frozen before tip-off"}</div>
        </div>
      )}
    </Panel>
  );
}

function GameFlowTab({ g, modelPregame }: { g: Game; modelPregame?: number }) {
  const eg = useEspnGame(g.league, g.espn_id, g.status === "live");
  if (!g.espn_id) return <Panel><Empty title="No ESPN event linked to this game" /></Panel>;
  if (eg.isLoading) return <Skeleton className="h-[360px]" />;
  if (eg.isError || !eg.data) return <ErrorState error={new Error("ESPN play-by-play is unavailable right now.")} />;
  const d = eg.data;
  if (!d.plays.length) return <Panel><Empty title={g.status === "scheduled" ? "Game has not started" : "No play-by-play published"}>The win probability curve, shot chart and play-by-play appear from tip-off.</Empty></Panel>;
  const pace = livePace(d);
  return (
    <>
      <Panel>
        <PanelHeader title="Win probability and margin" eyebrow="ESPN, per play" right={pace ? <span className="num text-2xs text-subtle">pace {num(pace.pace, 1)} · {num(pace.possessions, 0)} poss.</span> : undefined} />
        <GameFlow g={d} modelPregame={modelPregame} height={320} />
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Shot chart" eyebrow="field goals" />
          <ShotChart plays={d.plays} home={d.home} away={d.away} league={g.league} />
        </Panel>
        <Panel>
          <PanelHeader title="Play-by-play" />
          <PlayFeed g={d} height={392} />
        </Panel>
      </div>
      {Object.keys(d.players).length > 0 && (
        <Panel>
          <PanelHeader title="Box score" eyebrow="ESPN" />
          <BoxScore g={d} />
        </Panel>
      )}
    </>
  );
}
