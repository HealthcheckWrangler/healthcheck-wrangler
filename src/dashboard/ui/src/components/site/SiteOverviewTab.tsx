import { KpiTrend } from "../KpiTrend";
import { cn, fmtRelative } from "../../lib/utils";
import type { KpiTrendPoint, LighthouseResult, UptimeStats, Annotation } from "../../api";

interface SiteOverviewTabProps {
  pagesUp: number;
  pagesDown: number;
  totalPages: number;
  pagesWithData: number;
  avgDuration: number | null;
  kpiTrend: KpiTrendPoint[];
  latestLhPerPage: Map<string, LighthouseResult>;
  uptime: UptimeStats | null;
  annotations: Annotation[];
}

function avgOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function SiteOverviewTab({
  pagesUp, pagesDown, totalPages, pagesWithData, avgDuration, kpiTrend, latestLhPerPage, uptime, annotations,
}: SiteOverviewTabProps) {
  const lhPages = [...latestLhPerPage.values()];
  const hasLh = lhPages.length > 0;

  // Average scores across pages, ignoring -1 (not measurable)
  const avgScore = (key: keyof LighthouseResult["scores"]): number => {
    const valid = lhPages.map((p) => p.scores[key]).filter((s) => s >= 0);
    return valid.length > 0 ? Math.round(avgOf(valid)) : -1;
  };

  // Average metrics across pages
  const avgMetric = (key: keyof LighthouseResult["metrics"]): number =>
    lhPages.length > 0 ? avgOf(lhPages.map((p) => p.metrics[key])) : 0;

  const mostRecentAudit = hasLh
    ? Math.max(...lhPages.map((p) => p.recordedAt))
    : null;

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiTrend
          label="Pages up"
          value={pagesWithData === 0 ? "—" : `${pagesUp} / ${totalPages}`}
          ok={pagesWithData > 0 ? pagesDown === 0 : undefined}
          trendData={kpiTrend.map((pt) => ({
            bucket: pt.bucket,
            value: pt.checksTotal > 0 ? (pt.checksUp / pt.checksTotal) * 100 : 0,
          }))}
          trendColor={pagesDown === 0 ? "hsl(142 71% 45%)" : "hsl(0 63% 55%)"}
          annotations={annotations}
        />
        <KpiTrend
          label="Avg. response — all pages"
          value={avgDuration != null ? `${avgDuration.toFixed(2)}s` : "—"}
          trendData={kpiTrend.map((pt) => ({ bucket: pt.bucket, value: pt.avgDuration }))}
          trendColor="hsl(217 91% 60%)"
        />
      </div>

      {uptime && (uptime.h24 != null || uptime.d7 != null || uptime.d30 != null) && (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <h3 className="mb-3 text-sm font-medium">Uptime</h3>
          <div className="grid grid-cols-3 gap-3">
            <UptimeWindow label="Last 24h" value={uptime.h24} />
            <UptimeWindow label="Last 7d"  value={uptime.d7} />
            <UptimeWindow label="Last 30d" value={uptime.d30} />
          </div>
        </div>
      )}

      {hasLh && (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <div className="mb-4 flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-medium">Lighthouse Scores</h3>
            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
              Average of latest audit per page · {lhPages.length} page{lhPages.length !== 1 ? "s" : ""}
              {mostRecentAudit != null && ` · last run ${fmtRelative(mostRecentAudit)}`}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(["performance", "accessibility", "best_practices", "seo"] as const).map((cat) => (
              <div key={cat} className="text-center">
                <ScoreRing score={avgScore(cat)} />
                <div className="mt-1 text-xs capitalize text-[hsl(var(--muted-foreground))]">
                  {cat.replace("_", " ")}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 text-xs">
            <Vital label="LCP"         value={`${avgMetric("lcp_seconds").toFixed(2)}s`}         thresholdOk={avgMetric("lcp_seconds") < 2.5} />
            <Vital label="FCP"         value={`${avgMetric("fcp_seconds").toFixed(2)}s`}         thresholdOk={avgMetric("fcp_seconds") < 1.8} />
            <Vital label="TTFB"        value={`${avgMetric("ttfb_seconds").toFixed(2)}s`}        thresholdOk={avgMetric("ttfb_seconds") < 0.6} />
            <Vital label="TBT"         value={`${avgMetric("tbt_seconds").toFixed(2)}s`}         thresholdOk={avgMetric("tbt_seconds") < 0.2} />
            <Vital label="CLS"         value={avgMetric("cls").toFixed(3)}                       thresholdOk={avgMetric("cls") < 0.1} />
            <Vital label="Speed Index" value={`${avgMetric("speed_index_seconds").toFixed(2)}s`} thresholdOk={avgMetric("speed_index_seconds") < 3.4} />
          </div>
        </div>
      )}
    </div>
  );
}

export function ScoreRing({ score }: { score: number }) {
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

function uptimeColor(pct: number): string {
  if (pct >= 99) return "text-[hsl(var(--success))]";
  if (pct >= 95) return "text-[hsl(var(--warning))]";
  return "text-[hsl(var(--destructive))]";
}

export function UptimeWindow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-[hsl(var(--muted))] px-4 py-3 text-center">
      <div className={cn("text-xl font-bold tabular-nums", value != null ? uptimeColor(value) : "text-[hsl(var(--muted-foreground))]")}>
        {value != null ? `${value.toFixed(2)}%` : "—"}
      </div>
      <div className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{label}</div>
    </div>
  );
}

export function Vital({ label, value, thresholdOk }: { label: string; value: string; thresholdOk: boolean }) {
  return (
    <div className="rounded bg-[hsl(var(--muted))] px-3 py-2">
      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className={cn("font-medium", thresholdOk ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]")}>{value}</div>
    </div>
  );
}
