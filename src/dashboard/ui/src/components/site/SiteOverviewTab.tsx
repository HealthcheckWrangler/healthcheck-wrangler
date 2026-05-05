import { KpiTrend } from "../KpiTrend";
import { cn } from "../../lib/utils";
import type { KpiTrendPoint, LighthouseResult } from "../../api";

interface SiteOverviewTabProps {
  pagesUp: number;
  pagesDown: number;
  totalPages: number;
  pagesWithData: number;
  avgDuration: number | null;
  kpiTrend: KpiTrendPoint[];
  latestLh: LighthouseResult | undefined;
}

export function SiteOverviewTab({
  pagesUp, pagesDown, totalPages, pagesWithData, avgDuration, kpiTrend, latestLh,
}: SiteOverviewTabProps) {
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
        />
        <KpiTrend
          label="Avg. response — all pages"
          value={avgDuration != null ? `${avgDuration.toFixed(2)}s` : "—"}
          trendData={kpiTrend.map((pt) => ({ bucket: pt.bucket, value: pt.avgDuration }))}
          trendColor="hsl(217 91% 60%)"
        />
      </div>

      {latestLh?.scores && (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <h3 className="mb-4 text-sm font-medium">Lighthouse Scores</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(["performance", "accessibility", "best_practices", "seo"] as const).map((cat) => (
              <div key={cat} className="text-center">
                <ScoreRing score={latestLh.scores[cat]} />
                <div className="mt-1 text-xs capitalize text-[hsl(var(--muted-foreground))]">
                  {cat.replace("_", " ")}
                </div>
              </div>
            ))}
          </div>
          {latestLh.metrics && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 text-xs">
              <Vital label="LCP"         value={`${latestLh.metrics.lcp_seconds.toFixed(2)}s`}         thresholdOk={latestLh.metrics.lcp_seconds < 2.5} />
              <Vital label="FCP"         value={`${latestLh.metrics.fcp_seconds.toFixed(2)}s`}         thresholdOk={latestLh.metrics.fcp_seconds < 1.8} />
              <Vital label="TTFB"        value={`${latestLh.metrics.ttfb_seconds.toFixed(2)}s`}        thresholdOk={latestLh.metrics.ttfb_seconds < 0.6} />
              <Vital label="TBT"         value={`${latestLh.metrics.tbt_seconds.toFixed(2)}s`}         thresholdOk={latestLh.metrics.tbt_seconds < 0.2} />
              <Vital label="CLS"         value={latestLh.metrics.cls.toFixed(3)}                       thresholdOk={latestLh.metrics.cls < 0.1} />
              <Vital label="Speed Index" value={`${latestLh.metrics.speed_index_seconds.toFixed(2)}s`} thresholdOk={latestLh.metrics.speed_index_seconds < 3.4} />
            </div>
          )}
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

export function Vital({ label, value, thresholdOk }: { label: string; value: string; thresholdOk: boolean }) {
  return (
    <div className="rounded bg-[hsl(var(--muted))] px-3 py-2">
      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className={cn("font-medium", thresholdOk ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]")}>{value}</div>
    </div>
  );
}
