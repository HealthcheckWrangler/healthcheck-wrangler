import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Clock, Zap } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { api, type SiteDetail, type ScheduleTask, type HealthcheckResult, type TimelineSeries, type KpiTrendPoint, type LighthouseResult, type LighthouseHistoryPoint } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { LogViewer } from "../components/LogViewer";
import { StateTimeline } from "../components/StateTimeline";
import { KpiTrend } from "../components/KpiTrend";
import { cn, fmtRelative, fmtCountdown } from "../lib/utils";
import type { HealthcheckResult as _HC } from "../api";
import { useTimeRange } from "../lib/time-range";

type Tab = "overview" | "timeline" | "lighthouse" | "pages" | "logs";

/** Group healthcheck results by approximate check round (pages checked within 60s of each other) */
function buildAverageSeries(results: HealthcheckResult[]): { value: number; up: boolean; ts: number }[] {
  if (results.length === 0) return [];
  const sorted = [...results].sort((a, b) => a.timestamp - b.timestamp);
  const rounds: HealthcheckResult[][] = [];
  let current: HealthcheckResult[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].timestamp - sorted[i - 1].timestamp < 60_000) {
      current.push(sorted[i]);
    } else {
      rounds.push(current);
      current = [sorted[i]];
    }
  }
  rounds.push(current);
  return rounds.map((round) => ({
    ts: Math.round(round.reduce((s, r) => s + r.timestamp, 0) / round.length),
    value: round.reduce((s, r) => s + r.durationSeconds, 0) / round.length,
    up: round.every((r) => r.up),
  }));
}

export function SiteDashboard() {
  const { name } = useParams<{ name: string }>();
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [schedule, setSchedule] = useState<ScheduleTask[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [pageSeries, setPageSeries] = useState<TimelineSeries[]>([]);
  const [kpiTrend, setKpiTrend] = useState<KpiTrendPoint[]>([]);
  const [lhHistory, setLhHistory] = useState<LighthouseHistoryPoint[]>([]);
  const [selectedLhPage, setSelectedLhPage] = useState<string>("__all__");
  const { range } = useTimeRange();

  useEffect(() => {
    if (!name) return;
    const load = () => {
      Promise.all([api.site(name), api.schedule()]).then(([s, sc]) => {
        setSite(s);
        setSchedule(sc.filter((t) => t.site === name));
        setLoading(false);
      }).catch(() => setLoading(false));
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [name]);

  useEffect(() => {
    if (!name) return;
    api.siteTimeline(name, range.startMs, range.endMs).then(setPageSeries).catch(() => {});
    api.siteKpiTrend(name, range.startMs, range.endMs).then(setKpiTrend).catch(() => {});
    api.siteLighthouseHistory(name, range.startMs, range.endMs).then((pts) => {
      setLhHistory(pts);
      setSelectedLhPage((prev) => {
        if (prev === "__all__") return "__all__";
        const pages = [...new Set(pts.map((p) => p.page))].sort();
        return pages.includes(prev) ? prev : "__all__";
      });
    }).catch(() => {});
  }, [name, range]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-[hsl(var(--muted-foreground))]">Loading…</div>;
  }

  if (!site) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-[hsl(var(--muted-foreground))]">Site not found</p>
        <Link to="/" className="text-sm text-[hsl(var(--primary))] hover:underline">← Back to overview</Link>
      </div>
    );
  }

  const hcTask = schedule.find((t) => t.type === "healthcheck");
  const lhTask = schedule.find((t) => t.type === "lighthouse");

  const pageEntries = Object.values(site.pageLatest);
  const pagesWithData = pageEntries.filter((p) => p.healthcheck != null);
  const pagesDown = pagesWithData.filter((p) => !p.healthcheck!.up).length;
  const pagesUp = pagesWithData.filter((p) => p.healthcheck!.up).length;
  const totalPages = site.pages.length;
  const avgDuration = pagesWithData.length > 0
    ? pagesWithData.reduce((s, p) => s + p.healthcheck!.durationSeconds, 0) / pagesWithData.length
    : null;
  const lastRun = pagesWithData.length > 0
    ? Math.max(...pagesWithData.map((p) => p.healthcheck!.timestamp))
    : null;

  const siteStatus = hcTask?.running ? "running" : pagesWithData.length === 0 ? "unknown" : pagesDown > 0 ? "down" : "up";
  const latestLh = site.results.lighthouse.at(-1);
  const avgSeries = buildAverageSeries(site.results.healthcheck);

  // Latest lighthouse result per page (results come in DESC order, first match is newest)
  const latestLhPerPage = new Map<string, LighthouseResult>();
  for (const lh of site.results.lighthouse) {
    if (!latestLhPerPage.has(lh.page)) latestLhPerPage.set(lh.page, lh);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-4">
        <Link to="/" className="mb-2 flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          <ArrowLeft className="h-3 w-3" /> Overview
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{site.name}</h1>
            <a href={site.baseUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]">
              {site.baseUrl}
            </a>
          </div>
          <StatusBadge status={siteStatus} />
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-[hsl(var(--muted-foreground))]">
          {hcTask && (
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Healthcheck
              <span className={hcTask.running ? "text-[hsl(var(--warning))]" : ""}>
                {hcTask.running ? "running now" : `next ${fmtCountdown(hcTask.nextRun)}`}
              </span>
              <span className="text-[hsl(var(--border))]">·</span>
              every {Math.round(hcTask.intervalMs / 60_000)}m
            </span>
          )}
          {lhTask && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Lighthouse
              <span className={lhTask.running ? "text-[hsl(var(--warning))]" : ""}>
                {lhTask.running ? "running now" : `next ${fmtCountdown(lhTask.nextRun)}`}
              </span>
              <span className="text-[hsl(var(--border))]">·</span>
              every {Math.round(lhTask.intervalMs / 3_600_000)}h
            </span>
          )}
        </div>

        <div className="mt-4 flex gap-0 border-b border-[hsl(var(--border))] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["overview", "timeline", "lighthouse", "pages", "logs"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors",
                tab === t
                  ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
                  : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "overview" && (
          <div className="p-6 space-y-6">
            {/* KPI trend cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <KpiTrend
                label="Pages up"
                value={pagesWithData.length === 0 ? "—" : `${pagesUp} / ${totalPages}`}
                ok={pagesWithData.length > 0 ? pagesDown === 0 : undefined}
                trendData={kpiTrend.map((pt) => ({
                  bucket: pt.bucket,
                  value: pt.checksTotal > 0 ? (pt.checksUp / pt.checksTotal) * 100 : 0,
                }))}
                trendColor={pagesDown === 0 ? "hsl(142 71% 45%)" : "hsl(0 63% 55%)"}
              />
              <KpiTrend
                label="Avg. response — all pages"
                value={avgDuration != null ? `${avgDuration.toFixed(2)}s` : "—"}
                trendData={kpiTrend.map((pt) => ({ bucket: pt.bucket, value: pt.avgDuration }))}
                trendColor="hsl(217 91% 60%)"
              />
            </div>

            {/* Lighthouse */}
            {latestLh?.scores && (
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <h3 className="mb-4 text-sm font-medium">Lighthouse Scores</h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {(["performance", "accessibility", "best_practices", "seo"] as const).map((cat) => {
                    const score = latestLh.scores[cat];
                    return (
                      <div key={cat} className="text-center">
                        <ScoreRing score={score} />
                        <div className="mt-1 text-xs capitalize text-[hsl(var(--muted-foreground))]">
                          {cat.replace("_", " ")}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {latestLh.metrics && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 text-xs">
                  <Vital label="LCP" value={`${latestLh.metrics.lcp_seconds.toFixed(2)}s`} thresholdOk={latestLh.metrics.lcp_seconds < 2.5} />
                  <Vital label="FCP" value={`${latestLh.metrics.fcp_seconds.toFixed(2)}s`} thresholdOk={latestLh.metrics.fcp_seconds < 1.8} />
                  <Vital label="TTFB" value={`${latestLh.metrics.ttfb_seconds.toFixed(2)}s`} thresholdOk={latestLh.metrics.ttfb_seconds < 0.6} />
                  <Vital label="TBT" value={`${latestLh.metrics.tbt_seconds.toFixed(2)}s`} thresholdOk={latestLh.metrics.tbt_seconds < 0.2} />
                  <Vital label="CLS" value={latestLh.metrics.cls.toFixed(3)} thresholdOk={latestLh.metrics.cls < 0.1} />
                  <Vital label="Speed Index" value={`${latestLh.metrics.speed_index_seconds.toFixed(2)}s`} thresholdOk={latestLh.metrics.speed_index_seconds < 3.4} />
                </div>}
              </div>
            )}
          </div>
        )}

        {tab === "timeline" && (
          <div className="p-6">
            <StateTimeline
              series={pageSeries}
              startMs={range.startMs}
              endMs={range.endMs}
              title={`Page availability (${range.label})`}
            />
          </div>
        )}

        {tab === "lighthouse" && (
          <LighthouseHistoryTab
            history={lhHistory}
            selectedPage={selectedLhPage}
            onSelectPage={setSelectedLhPage}
          />
        )}

        {tab === "pages" && (
          <div className="p-6 space-y-4">
            {site.pages.map((page) => {
              const pageResult = site.pageLatest[page.name]?.healthcheck ?? null;
              const lh = latestLhPerPage.get(page.name) ?? null;
              return (
                <div key={page.path} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{page.name}</span>
                      <span className="ml-2 font-mono text-xs text-[hsl(var(--muted-foreground))]">{page.path}</span>
                    </div>
                    {pageResult && <StatusBadge status={pageResult.up ? "up" : "down"} />}
                  </div>

                  {/* Selectors */}
                  <div className="space-y-1.5">
                    {page.selectors.map((sel) => {
                      const selectorResult = pageResult?.selectors?.find((s) => s.selector === sel);
                      const dotColor = selectorResult == null
                        ? "bg-[hsl(var(--muted-foreground)/0.4)] border border-[hsl(var(--border))]"
                        : selectorResult.visible
                          ? "bg-[hsl(var(--success))]"
                          : "bg-[hsl(var(--destructive))]";
                      return (
                        <div key={sel} className="flex items-center gap-2 text-xs">
                          <span className={cn("h-2 w-2 rounded-full flex-shrink-0", dotColor)} />
                          <code className="text-[hsl(var(--muted-foreground))]">{sel}</code>
                          {selectorResult?.error && (
                            <span className="ml-1 text-[hsl(var(--destructive))] truncate" title={selectorResult.error}>
                              — {selectorResult.error.slice(0, 60)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {pageResult && (
                    <div className="mt-3 text-[11px] text-[hsl(var(--muted-foreground))]">
                      Last checked {fmtRelative(pageResult.timestamp)} · {pageResult.durationSeconds.toFixed(2)}s · HTTP {pageResult.httpStatus}
                    </div>
                  )}

                  {/* Lighthouse section */}
                  {lh && (
                    <div className="mt-3 border-t border-[hsl(var(--border)/0.5)] pt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">Lighthouse</span>
                        <span className="text-[10px] text-[hsl(var(--muted-foreground)/0.7)]">{fmtRelative(lh.recordedAt)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                        {/* Scores */}
                        <div className="flex gap-3">
                          {([
                            ["Perf",  lh.scores.performance],
                            ["A11y",  lh.scores.accessibility],
                            ["BP",    lh.scores.best_practices],
                            ["SEO",   lh.scores.seo],
                          ] as [string, number][]).map(([label, score]) => (
                            <span key={label} className="flex flex-col items-center gap-0.5">
                              <span className={cn("text-sm font-semibold", lhScoreColor(score))}>
                                {score >= 0 ? score : "—"}
                              </span>
                              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</span>
                            </span>
                          ))}
                        </div>
                        {/* Core vitals */}
                        <div className="flex gap-3 text-[11px]">
                          <span>
                            <span className="text-[hsl(var(--muted-foreground))]">LCP </span>
                            <span className={lh.metrics.lcp_seconds < 2.5 ? "text-[hsl(var(--success))]" : lh.metrics.lcp_seconds < 4 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--destructive))]"}>
                              {lh.metrics.lcp_seconds.toFixed(2)}s
                            </span>
                          </span>
                          <span>
                            <span className="text-[hsl(var(--muted-foreground))]">FCP </span>
                            <span className={lh.metrics.fcp_seconds < 1.8 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}>
                              {lh.metrics.fcp_seconds.toFixed(2)}s
                            </span>
                          </span>
                          <span>
                            <span className="text-[hsl(var(--muted-foreground))]">TTFB </span>
                            <span className={lh.metrics.ttfb_seconds < 0.6 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}>
                              {lh.metrics.ttfb_seconds.toFixed(2)}s
                            </span>
                          </span>
                          <span>
                            <span className="text-[hsl(var(--muted-foreground))]">CLS </span>
                            <span className={lh.metrics.cls < 0.1 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}>
                              {lh.metrics.cls.toFixed(3)}
                            </span>
                          </span>
                          <span>
                            <span className="text-[hsl(var(--muted-foreground))]">TBT </span>
                            <span className={lh.metrics.tbt_seconds < 0.2 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}>
                              {(lh.metrics.tbt_seconds * 1000).toFixed(0)}ms
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "logs" && (
          <div className="h-full">
            <LogViewer site={site.name} />
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, ok, className }: { label: string; value: string; ok?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4", className)}>
      <div className="text-xs text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className={cn("mt-1 text-xl font-bold", ok === false ? "text-[hsl(var(--destructive))]" : "text-[hsl(var(--foreground))]")}>
        {value}
      </div>
    </div>
  );
}

const SCORE_COLORS = {
  perf: "hsl(217 91% 60%)",
  a11y: "hsl(142 71% 45%)",
  bp:   "hsl(32 95% 54%)",
  seo:  "hsl(271 91% 65%)",
} as const;

const VITAL_COLORS = {
  lcp:  "hsl(217 91% 60%)",
  fcp:  "hsl(142 71% 45%)",
  ttfb: "hsl(32 95% 54%)",
} as const;

const SCORE_NAMES = { perf: "Performance", a11y: "Accessibility", bp: "Best Practices", seo: "SEO" } as const;
const VITAL_NAMES = { lcp: "LCP", fcp: "FCP", ttfb: "TTFB" } as const;

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
};

function fmtAxisDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:00`;
}

type ChartPoint = { ts: number; perf: number | null; a11y: number | null; bp: number | null; seo: number | null; lcp: number | null; fcp: number | null; ttfb: number | null; cls: number | null };

function buildAveragedPoints(history: LighthouseHistoryPoint[]): ChartPoint[] {
  // Group all pages' audits into 15-minute buckets to align concurrent runs
  const BUCKET_MS = 15 * 60 * 1000;
  const buckets = new Map<number, { perf: number[]; a11y: number[]; bp: number[]; seo: number[]; lcp: number[]; fcp: number[]; ttfb: number[]; cls: number[] }>();

  for (const pt of history) {
    const key = Math.floor(pt.ts / BUCKET_MS) * BUCKET_MS;
    if (!buckets.has(key)) buckets.set(key, { perf: [], a11y: [], bp: [], seo: [], lcp: [], fcp: [], ttfb: [], cls: [] });
    const b = buckets.get(key)!;
    if (pt.perf >= 0) b.perf.push(pt.perf);
    if (pt.a11y >= 0) b.a11y.push(pt.a11y);
    if (pt.bp   >= 0) b.bp.push(pt.bp);
    if (pt.seo  >= 0) b.seo.push(pt.seo);
    b.lcp.push(pt.lcp);
    b.fcp.push(pt.fcp);
    b.ttfb.push(pt.ttfb);
    b.cls.push(pt.cls);
  }

  const avg = (arr: number[]): number | null =>
    arr.length > 0 ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100 : null;

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ts, b]) => ({
      ts,
      perf: avg(b.perf),
      a11y: avg(b.a11y),
      bp:   avg(b.bp),
      seo:  avg(b.seo),
      lcp:  avg(b.lcp),
      fcp:  avg(b.fcp),
      ttfb: avg(b.ttfb),
      cls:  avg(b.cls),
    }));
}

function ScoresChart({ points }: { points: ChartPoint[] }) {
  const showDots = points.length <= 20;
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Scores</h3>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">↑ Higher is better · ≥ 90 good · ≥ 50 needs improvement</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="ts" tickFormatter={fmtAxisDate} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} minTickGap={60} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={28} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => new Date(v as number).toLocaleString()} formatter={(v: number, name: string) => [`${Math.round(v)}`, name]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={90} stroke="hsl(var(--success))" strokeDasharray="4 4" strokeOpacity={0.4} />
          <ReferenceLine y={50} stroke="hsl(var(--warning))"  strokeDasharray="4 4" strokeOpacity={0.4} />
          {(Object.keys(SCORE_COLORS) as (keyof typeof SCORE_COLORS)[]).map((key) => (
            <Line key={key} type="monotone" dataKey={key} name={SCORE_NAMES[key]} stroke={SCORE_COLORS[key]} strokeWidth={2} dot={showDots} activeDot={{ r: 4 }} connectNulls animationDuration={400} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const CLS_COLOR = "hsl(340 82% 60%)";

function VitalsChart({ points }: { points: ChartPoint[] }) {
  const showDots = points.length <= 20;
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Core Web Vitals</h3>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">↓ Lower is better · dashed lines = Good threshold</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
        <span><span style={{ color: VITAL_COLORS.lcp  }}>LCP</span> — how fast the largest element loads · Good &lt; 2.5s</span>
        <span><span style={{ color: VITAL_COLORS.fcp  }}>FCP</span> — when first content appears · Good &lt; 1.8s</span>
        <span><span style={{ color: VITAL_COLORS.ttfb }}>TTFB</span> — server response time · Good &lt; 0.6s</span>
        <span><span style={{ color: CLS_COLOR         }}>CLS</span> — layout shift score (right axis) · Good &lt; 0.1</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 8, right: 40, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="ts" tickFormatter={fmtAxisDate} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} minTickGap={60} />
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => `${v.toFixed(1)}s`} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 0.3]} tick={{ fontSize: 10, fill: CLS_COLOR }} tickLine={false} axisLine={false} width={32} tickFormatter={(v: number) => v.toFixed(2)} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(v) => new Date(v as number).toLocaleString()}
            formatter={(v: number, name: string) =>
              name === "CLS" ? [v.toFixed(3), name] : [`${v.toFixed(2)}s`, name]
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine yAxisId="left"  y={2.5} stroke={VITAL_COLORS.lcp}  strokeDasharray="4 4" strokeOpacity={0.35} label={{ value: "LCP 2.5s",  position: "insideTopRight", fontSize: 9, fill: VITAL_COLORS.lcp  }} />
          <ReferenceLine yAxisId="left"  y={1.8} stroke={VITAL_COLORS.fcp}  strokeDasharray="4 4" strokeOpacity={0.35} label={{ value: "FCP 1.8s",  position: "insideTopRight", fontSize: 9, fill: VITAL_COLORS.fcp  }} />
          <ReferenceLine yAxisId="left"  y={0.6} stroke={VITAL_COLORS.ttfb} strokeDasharray="4 4" strokeOpacity={0.35} label={{ value: "TTFB 0.6s", position: "insideTopRight", fontSize: 9, fill: VITAL_COLORS.ttfb }} />
          <ReferenceLine yAxisId="right" y={0.1} stroke={CLS_COLOR}         strokeDasharray="4 4" strokeOpacity={0.35} />
          {(Object.keys(VITAL_COLORS) as (keyof typeof VITAL_COLORS)[]).map((key) => (
            <Line key={key} yAxisId="left" type="monotone" dataKey={key} name={VITAL_NAMES[key]} stroke={VITAL_COLORS[key]} strokeWidth={2} dot={showDots} activeDot={{ r: 4 }} connectNulls animationDuration={400} />
          ))}
          <Line yAxisId="right" type="monotone" dataKey="cls" name="CLS" stroke={CLS_COLOR} strokeWidth={2} dot={showDots} activeDot={{ r: 4 }} connectNulls strokeDasharray="6 3" animationDuration={400} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LighthouseHistoryTab({
  history,
  selectedPage,
  onSelectPage,
}: {
  history: LighthouseHistoryPoint[];
  selectedPage: string;
  onSelectPage: (p: string) => void;
}) {
  const pages = useMemo(() => [...new Set(history.map((h) => h.page))].sort(), [history]);

  const averagedPoints = useMemo(() => buildAveragedPoints(history), [history]);

  const pagePoints = useMemo((): ChartPoint[] =>
    history
      .filter((h) => h.page === selectedPage)
      .map((h) => ({ ts: h.ts, perf: h.perf >= 0 ? h.perf : null, a11y: h.a11y >= 0 ? h.a11y : null, bp: h.bp >= 0 ? h.bp : null, seo: h.seo >= 0 ? h.seo : null, lcp: h.lcp, fcp: h.fcp, ttfb: h.ttfb, cls: h.cls })),
  [history, selectedPage]);

  if (history.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-[hsl(var(--muted-foreground))]">
        No Lighthouse data in this time range
      </div>
    );
  }

  const isAll = selectedPage === "__all__";
  const activePoints = isAll ? averagedPoints : pagePoints;

  return (
    <div className="p-6 space-y-6">
      {/* Page selector — scrollable row */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">View</span>
        <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => onSelectPage("__all__")}
            className={cn(
              "shrink-0 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
              isAll
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
            )}
          >
            All pages (avg)
          </button>
          {pages.map((p) => (
            <button
              key={p}
              onClick={() => onSelectPage(p)}
              className={cn(
                "shrink-0 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                selectedPage === p
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {activePoints.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-[hsl(var(--muted-foreground))]">
          No data for this page in the selected range
        </div>
      ) : (
        <>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            {isAll
              ? `Averaged across ${pages.length} page${pages.length !== 1 ? "s" : ""} · ${activePoints.length} audit rounds`
              : `${activePoints.length} audits`}
          </div>
          <ScoresChart points={activePoints} />
          <VitalsChart points={activePoints} />
        </>
      )}
    </div>
  );
}

function lhScoreColor(score: number): string {
  if (score < 0) return "text-[hsl(var(--muted-foreground))]";
  if (score >= 90) return "text-[hsl(var(--success))]";
  if (score >= 50) return "text-[hsl(var(--warning))]";
  return "text-[hsl(var(--destructive))]";
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 90 ? "hsl(var(--success))" : score >= 50 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg viewBox="0 0 72 72" className="mx-auto w-16 h-16">
      <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 36 36)" />
      <text x="36" y="36" textAnchor="middle" dominantBaseline="central" fontSize="16" fontWeight="bold" fill={color}>
        {score}
      </text>
    </svg>
  );
}

function Vital({ label, value, thresholdOk }: { label: string; value: string; thresholdOk: boolean }) {
  return (
    <div className="rounded bg-[hsl(var(--muted))] px-3 py-2">
      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className={cn("font-medium", thresholdOk ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]")}>{value}</div>
    </div>
  );
}
