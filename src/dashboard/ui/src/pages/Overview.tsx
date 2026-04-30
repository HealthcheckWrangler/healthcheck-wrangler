import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, ExternalLink, Shield, Zap } from "lucide-react";
import { api, type Site, type ScheduleTask, type TimelineSeries, type SystemStats } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { StateTimeline } from "../components/StateTimeline";
import { cn, fmtCountdown, fmtRelative } from "../lib/utils";
import { useTimeRange } from "../lib/time-range";

export function Overview() {
  const [sites, setSites] = useState<Site[]>([]);
  const [schedule, setSchedule] = useState<ScheduleTask[]>([]);
  const [fleetSeries, setFleetSeries] = useState<TimelineSeries[]>([]);
  const [sysStats, setSysStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { range } = useTimeRange();

  useEffect(() => {
    const load = () => {
      Promise.all([api.sites(), api.schedule()]).then(([s, sc]) => {
        setSites(s);
        setSchedule(sc);
        setLoading(false);
      }).catch(() => setLoading(false));
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const loadSys = () => { api.system().then(setSysStats).catch(() => {}); };
    loadSys();
    const id = setInterval(loadSys, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.fleetStatus(range.startMs, range.endMs).then(setFleetSeries).catch(() => {});
  }, [range]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-[hsl(var(--muted-foreground))]">
        Connecting to runner…
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-[hsl(var(--muted-foreground))]">
        <p className="font-medium">No sites configured</p>
        <p className="text-sm">Add site YAML files to the sites/ directory to get started.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Overview</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{sites.length} site{sites.length !== 1 ? "s" : ""} monitored</p>
      </div>

      {/* Server resources */}
      {sysStats && <SystemCard stats={sysStats} />}

      {/* Fleet status timeline */}
      <StateTimeline
        series={fleetSeries}
        startMs={range.startMs}
        endMs={range.endMs}
        title={`Fleet status (${range.label})`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => {
          const tasks = schedule.filter((t) => t.site === site.name);
          const hcTask = tasks.find((t) => t.type === "healthcheck");
          const lhTask = tasks.find((t) => t.type === "lighthouse");

          const pageEntries = Object.values(site.pageLatest);
          const pagesWithData = pageEntries.filter((p) => p.healthcheck != null);
          const pagesDown = pagesWithData.filter((p) => !p.healthcheck!.up).length;
          const pagesUp = pagesWithData.filter((p) => p.healthcheck!.up).length;
          const totalPages = site.pages.length;

          const avgDuration = pagesWithData.length > 0
            ? pagesWithData.reduce((sum, p) => sum + p.healthcheck!.durationSeconds, 0) / pagesWithData.length
            : null;

          const lastRun = pagesWithData.length > 0
            ? Math.max(...pagesWithData.map((p) => p.healthcheck!.timestamp))
            : null;

          const siteStatus = hcTask?.running
            ? "running"
            : pagesWithData.length === 0
              ? "unknown"
              : pagesDown > 0
                ? "down"
                : "up";

          return (
            <Link
              key={site.name}
              to={`/sites/${site.name}`}
              className="group block rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden transition-all hover:border-[hsl(var(--primary)/0.5)] hover:shadow-lg hover:shadow-[hsl(var(--primary)/0.05)]"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 p-4 pb-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))]">
                    {site.name}
                  </h2>
                  <a
                    href={site.baseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 truncate text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"
                  >
                    {site.baseUrl}
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                </div>
                <StatusBadge status={siteStatus} />
              </div>

              {/* Pages-down counter */}
              <div
                className={cn(
                  "mx-4 mb-3 rounded-lg flex flex-col items-center justify-center py-4",
                  pagesWithData.length === 0
                    ? "bg-[hsl(var(--muted))]"
                    : pagesDown === 0
                      ? "bg-[hsl(var(--success)/0.15)]"
                      : "bg-[hsl(var(--destructive)/0.15)]",
                )}
              >
                <span
                  className={cn(
                    "text-5xl font-bold tabular-nums leading-none",
                    pagesWithData.length === 0
                      ? "text-[hsl(var(--muted-foreground))]"
                      : pagesDown === 0
                        ? "text-[hsl(var(--success))]"
                        : "text-[hsl(var(--destructive))]",
                  )}
                >
                  {pagesWithData.length === 0 ? "—" : pagesDown}
                </span>
                <span className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {pagesWithData.length === 0
                    ? "no data yet"
                    : pagesDown === 0
                      ? `all ${totalPages} pages up`
                      : `page${pagesDown !== 1 ? "s" : ""} down`}
                </span>
              </div>

              {/* Aggregate stats */}
              <div className="grid grid-cols-3 gap-2 px-4 pb-3 text-xs">
                <div className="rounded bg-[hsl(var(--muted))] px-2 py-1.5">
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))]">Pages up</div>
                  <div className={cn("font-medium", pagesDown > 0 ? "text-[hsl(var(--destructive))]" : "text-[hsl(var(--foreground))]")}>
                    {pagesWithData.length === 0 ? "—" : `${pagesUp}/${totalPages}`}
                  </div>
                </div>
                <div className="rounded bg-[hsl(var(--muted))] px-2 py-1.5">
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))]">Avg. response</div>
                  <div className="font-medium text-[hsl(var(--foreground))]">
                    {avgDuration != null ? `${avgDuration.toFixed(2)}s` : "—"}
                  </div>
                </div>
                <div className="rounded bg-[hsl(var(--muted))] px-2 py-1.5">
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))]">Last run</div>
                  <div className="font-medium text-[hsl(var(--foreground))]">
                    {lastRun != null ? fmtRelative(lastRun) : "—"}
                  </div>
                </div>
              </div>

              {/* Lighthouse scores (if available) */}
              {(() => {
                const latestLh = site.pages.map((p) =>
                  (site as unknown as { latestLighthouse?: import("../api").LighthouseResult }).latestLighthouse
                ).find(Boolean);
                if (!latestLh) return null;
                return (
                  <div className="grid grid-cols-4 gap-1 px-4 pb-3">
                    {(["performance", "accessibility", "best_practices", "seo"] as const).map((cat) => {
                      const score = (latestLh as import("../api").LighthouseResult).scores[cat];
                      return (
                        <div key={cat} className="rounded bg-[hsl(var(--muted))] p-1.5 text-center">
                          <div className={cn("text-sm font-bold", scoreColor(score))}>{score}</div>
                          <div className="text-[9px] text-[hsl(var(--muted-foreground))] capitalize">{cat.replace("_", " ")}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Schedule */}
              <div className="flex flex-wrap gap-3 border-t border-[hsl(var(--border))] px-4 py-2.5 text-[11px] text-[hsl(var(--muted-foreground))]">
                {hcTask && (
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    HC {hcTask.running ? <span className="text-[hsl(var(--warning))]">running</span> : fmtCountdown(hcTask.nextRun)}
                  </span>
                )}
                {lhTask && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    LH {lhTask.running ? <span className="text-[hsl(var(--warning))]">running</span> : fmtCountdown(lhTask.nextRun)}
                  </span>
                )}
                {site.alerting && (
                  <span className="flex items-center gap-1 text-[hsl(var(--success))]">
                    <Shield className="h-3 w-3" />
                    Alerting
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-[hsl(var(--success))]";
  if (score >= 50) return "text-[hsl(var(--warning))]";
  return "text-[hsl(var(--destructive))]";
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  return `${(bytes / 1_048_576).toFixed(0)} MB`;
}

function BarMeter({ pct, warn = 70, danger = 85 }: { pct: number; warn?: number; danger?: number }) {
  const color = pct >= danger
    ? "bg-[hsl(var(--destructive))]"
    : pct >= warn
      ? "bg-[hsl(var(--warning))]"
      : "bg-[hsl(var(--success))]";
  return (
    <div className="h-1.5 w-full rounded-full bg-[hsl(var(--muted))]">
      <div className={cn("h-1.5 rounded-full transition-all", color)} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function SystemCard({ stats }: { stats: SystemStats }) {
  const memPct = Math.round((stats.memory.usedBytes / stats.memory.totalBytes) * 100);
  const loadPct = Math.round((stats.cpu.load1m / stats.cpu.count) * 100);
  const loadColor = loadPct >= 90
    ? "text-[hsl(var(--destructive))]"
    : loadPct >= 60
      ? "text-[hsl(var(--warning))]"
      : "text-[hsl(var(--success))]";

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-3">
      <h2 className="mb-3 text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Server resources</h2>
      <div className="grid grid-cols-3 gap-6">
        {/* RAM */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-[hsl(var(--muted-foreground))]">RAM</span>
            <span className="font-medium">{fmtBytes(stats.memory.usedBytes)} <span className="font-normal text-[hsl(var(--muted-foreground))]">/ {fmtBytes(stats.memory.totalBytes)}</span></span>
          </div>
          <BarMeter pct={memPct} />
          <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{memPct}% used</div>
        </div>

        {/* CPU load */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-[hsl(var(--muted-foreground))]">Load avg</span>
            <span className={cn("font-medium", loadColor)}>{stats.cpu.load1m.toFixed(2)}</span>
          </div>
          <BarMeter pct={loadPct} warn={60} danger={90} />
          <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {stats.cpu.load5m.toFixed(2)} · {stats.cpu.load15m.toFixed(2)} &nbsp;({stats.cpu.count} CPU{stats.cpu.count !== 1 ? "s" : ""})
          </div>
        </div>

        {/* Runner process */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-[hsl(var(--muted-foreground))]">Runner RSS</span>
            <span className="font-medium">{fmtBytes(stats.process.rssBytes)}</span>
          </div>
          <BarMeter pct={Math.round((stats.process.rssBytes / stats.memory.totalBytes) * 100)} warn={20} danger={40} />
          <div className="text-[10px] text-[hsl(var(--muted-foreground))]">Node.js process</div>
        </div>
      </div>
    </div>
  );
}
