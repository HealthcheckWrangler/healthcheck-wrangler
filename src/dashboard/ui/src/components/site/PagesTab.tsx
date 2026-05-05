import { StatusBadge } from "../StatusBadge";
import { cn, fmtRelative } from "../../lib/utils";
import type { SitePage, PageLatest, LighthouseResult } from "../../api";

function lhScoreColor(score: number): string {
  if (score < 0) return "text-[hsl(var(--muted-foreground))]";
  if (score >= 90) return "text-[hsl(var(--success))]";
  if (score >= 50) return "text-[hsl(var(--warning))]";
  return "text-[hsl(var(--destructive))]";
}

interface PagesTabProps {
  pages: SitePage[];
  pageLatest: Record<string, PageLatest>;
  latestLhPerPage: Map<string, LighthouseResult>;
}

export function PagesTab({ pages, pageLatest, latestLhPerPage }: PagesTabProps) {
  return (
    <div className="p-6 space-y-4">
      {pages.map((page) => {
        const pageResult = pageLatest[page.name]?.healthcheck ?? null;
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

            {lh && (
              <div className="mt-3 border-t border-[hsl(var(--border)/0.5)] pt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">Lighthouse</span>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground)/0.7)]">{fmtRelative(lh.recordedAt)}</span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                  <div className="flex gap-3">
                    {([
                      ["Perf", lh.scores.performance],
                      ["A11y", lh.scores.accessibility],
                      ["BP",   lh.scores.best_practices],
                      ["SEO",  lh.scores.seo],
                    ] as [string, number][]).map(([label, score]) => (
                      <span key={label} className="flex flex-col items-center gap-0.5">
                        <span className={cn("text-sm font-semibold", lhScoreColor(score))}>
                          {score >= 0 ? score : "—"}
                        </span>
                        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</span>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-3 text-[11px]">
                    {([
                      ["LCP",  lh.metrics.lcp_seconds,  "s", lh.metrics.lcp_seconds < 2.5],
                      ["FCP",  lh.metrics.fcp_seconds,  "s", lh.metrics.fcp_seconds < 1.8],
                      ["TTFB", lh.metrics.ttfb_seconds, "s", lh.metrics.ttfb_seconds < 0.6],
                      ["CLS",  lh.metrics.cls,          "",  lh.metrics.cls < 0.1],
                      ["TBT",  lh.metrics.tbt_seconds * 1000, "ms", lh.metrics.tbt_seconds < 0.2],
                    ] as [string, number, string, boolean][]).map(([label, val, unit, ok]) => (
                      <span key={label}>
                        <span className="text-[hsl(var(--muted-foreground))]">{label} </span>
                        <span className={ok ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}>
                          {unit === "ms" ? `${val.toFixed(0)}${unit}` : unit === "s" ? `${(val as number).toFixed(2)}${unit}` : (val as number).toFixed(3)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
