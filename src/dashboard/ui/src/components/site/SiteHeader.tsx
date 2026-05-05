import { Link } from "react-router-dom";
import { ArrowLeft, Clock, Zap } from "lucide-react";
import { StatusBadge } from "../StatusBadge";
import { cn, fmtOverdue } from "../../lib/utils";
import type { SiteDetail, ScheduleTask } from "../../api";

export type Tab = "overview" | "timeline" | "lighthouse" | "pages" | "logs";

const TABS: Tab[] = ["overview", "timeline", "lighthouse", "pages", "logs"];

interface SiteHeaderProps {
  site: SiteDetail;
  siteStatus: "up" | "down" | "running" | "unknown";
  hcTask: ScheduleTask | undefined;
  lhTask: ScheduleTask | undefined;
  triggering: "healthcheck" | "lighthouse" | null;
  onRunNow: (type: "healthcheck" | "lighthouse") => void;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function SiteHeader({
  site, siteStatus, hcTask, lhTask, triggering, onRunNow, tab, onTabChange,
}: SiteHeaderProps) {
  return (
    <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-4">
      <Link
        to="/"
        className="mb-2 flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        <ArrowLeft className="h-3 w-3" /> Overview
      </Link>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{site.name}</h1>
          <a
            href={site.baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"
          >
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
            {(() => {
              if (hcTask.running) return <span className="text-[hsl(var(--warning))]">running now</span>;
              const { overdue, label } = fmtOverdue(hcTask.nextRun);
              return <span className={overdue ? "text-[hsl(var(--destructive))]" : ""}>{label}</span>;
            })()}
            <span className="text-[hsl(var(--border))]">·</span>
            every {Math.round(hcTask.intervalMs / 60_000)}m
            {!hcTask.running && (
              <button
                onClick={() => onRunNow("healthcheck")}
                disabled={triggering !== null}
                className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 text-[10px] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] disabled:opacity-40 transition-colors"
              >
                {triggering === "healthcheck" ? "…" : "Run now"}
              </button>
            )}
          </span>
        )}
        {lhTask && (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Lighthouse
            {(() => {
              if (lhTask.running) return <span className="text-[hsl(var(--warning))]">running now</span>;
              const { overdue, label } = fmtOverdue(lhTask.nextRun);
              return <span className={overdue ? "text-[hsl(var(--destructive))]" : ""}>{label}</span>;
            })()}
            <span className="text-[hsl(var(--border))]">·</span>
            every {Math.round(lhTask.intervalMs / 3_600_000)}h
            {!lhTask.running && (
              <button
                onClick={() => onRunNow("lighthouse")}
                disabled={triggering !== null}
                className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 text-[10px] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] disabled:opacity-40 transition-colors"
              >
                {triggering === "lighthouse" ? "…" : "Run now"}
              </button>
            )}
          </span>
        )}
      </div>

      <div className="mt-4 flex gap-0 border-b border-[hsl(var(--border))] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
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
  );
}
