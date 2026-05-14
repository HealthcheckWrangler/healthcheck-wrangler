import { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";
import { api, type WorkerStatPoint, type WorkerForecast, type WorkerScenario, type RunnerStatus } from "../api";
import { useTimeRange, WORKER_PRESETS } from "../lib/time-range";
import { cn } from "../lib/utils";

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
};

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function fmtAxisDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:00`;
}

function satColor(pct: number): string {
  if (pct >= 90) return "text-[hsl(var(--destructive))]";
  if (pct >= 60) return "text-[hsl(var(--warning))]";
  return "text-[hsl(var(--success))]";
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="text-xs text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{sub}</div>}
    </div>
  );
}

function RecommendationCard({ text }: { text: string }) {
  const isGood    = /healthy|no changes|idle|reducing/i.test(text);
  const isCrit    = /over capacity|immediately/i.test(text);
  const isQueued  = /currently queued/i.test(text);

  const Icon = isCrit || isQueued ? XCircle : isGood ? CheckCircle : AlertTriangle;
  const iconCls  = isCrit || isQueued
    ? "text-[hsl(var(--destructive))]"
    : isGood
      ? "text-[hsl(var(--success))]"
      : "text-[hsl(var(--warning))]";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-sm">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconCls)} />
      <span>{text}</span>
    </div>
  );
}

function ForecastTable({ forecast }: { forecast: WorkerForecast }) {
  const current = forecast.scenarios.find((s) => s.workers === forecast.maxWorkers);

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-medium">Capacity Forecast</h3>
        <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
          Based on {forecast.sampleCount} completed task{forecast.sampleCount !== 1 ? "s" : ""} · avg duration {fmtMs(forecast.avgDurationMs)} · {forecast.tasksPerHour.toFixed(1)} tasks/hr scheduled
        </span>
      </div>

      {forecast.historySampleCount >= 30 && (
        <div className="mb-3 flex items-center gap-4 rounded-lg bg-[hsl(var(--muted)/0.4)] px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))]">
          <span>
            <span className="font-medium text-[hsl(var(--foreground))]">Peak observed:</span>{" "}
            {forecast.peakActive}/{forecast.maxWorkers} workers · last 3 days
          </span>
          <span>
            <span className="font-medium text-[hsl(var(--foreground))]">Queue events:</span>{" "}
            {forecast.queueEvents === 0
              ? <span className="text-[hsl(var(--success))]">none</span>
              : <span className="text-[hsl(var(--destructive))]">{forecast.queueEvents}</span>
            }
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--border))] text-left text-xs text-[hsl(var(--muted-foreground))]">
              <th className="pb-2 pr-4">Scenario</th>
              <th className="pb-2 pr-4 text-right">Capacity</th>
              <th className="pb-2 pr-4 text-right">Saturation <span className="font-normal opacity-60">(theoretical)</span></th>
              <th className="pb-2 pr-4 text-right">Avg queue wait</th>
              <th className="pb-2 text-right">Est. process RAM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border)/0.5)]">
            {forecast.scenarios.map((s: WorkerScenario) => {
              const isCurrent = s.workers === forecast.maxWorkers;
              const ramDelta = current ? s.estimatedRamMb - current.estimatedRamMb : 0;
              return (
                <tr
                  key={s.workers}
                  className={cn(
                    "text-xs",
                    isCurrent && "bg-[hsl(var(--muted)/0.5)] font-medium",
                  )}
                >
                  <td className="py-2 pr-4">
                    {s.workers} worker{s.workers !== 1 ? "s" : ""}
                    {isCurrent && <span className="ml-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">(current)</span>}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{s.tasksPerHourCapacity}/hr</td>
                  <td className={cn("py-2 pr-4 text-right tabular-nums", satColor(s.satPct))}>
                    {Math.min(s.satPct, 999)}%
                    {s.satPct > 999 && "+"}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {s.avgWaitMs > 0 ? fmtMs(s.avgWaitMs) : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    ~{s.estimatedRamMb} MB
                    {!isCurrent && ramDelta !== 0 && (
                      <span className={cn(
                        "ml-1 text-[10px]",
                        ramDelta > 0 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--success))]",
                      )}>
                        ({ramDelta > 0 ? "+" : ""}{ramDelta} MB)
                      </span>
                    )}
                    {s.projectedMemPct > 85 && (
                      <AlertTriangle className="ml-1 inline h-3 w-3 text-[hsl(var(--warning))]" aria-label="Container RAM may be strained" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
        <Info className="h-3 w-3 shrink-0" />
        {forecast.sampleCount < 20
          ? `Estimates improve as more tasks complete — ${forecast.sampleCount}/20 samples collected. `
          : ""}
        Saturation % is a steady-state model — actual usage is spiky for polling systems. Use the Peak Observed row above as the primary sizing signal. RAM figures are approximate.
      </div>
    </div>
  );
}

function UtilizationChart({ points, maxWorkers }: { points: WorkerStatPoint[]; maxWorkers: number }) {
  const showDots = points.length <= 20;
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Worker Utilization</h3>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
          Healthcheck (blue) + Lighthouse (amber) workers · dashed line = max workers
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="ts" tickFormatter={fmtAxisDate} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} minTickGap={60} type="number" domain={["dataMin", "dataMax"]} scale="time" />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={24} domain={[0, Math.max(maxWorkers + 1, 4)]} allowDecimals={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(v) => new Date(v as number).toLocaleString()}
            formatter={(v, name) => [Math.round(v as number), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine y={maxWorkers} stroke="hsl(var(--primary))" strokeDasharray="5 3" strokeOpacity={0.6} label={{ value: "max workers", position: "insideTopRight", fontSize: 9, fill: "hsl(var(--primary))" }} />
          <Area type="linear" dataKey="activeHc" name="Healthcheck" stackId="1" stroke="hsl(217 91% 60%)" fill="hsl(217 91% 60%)" fillOpacity={0.6} dot={showDots} animationDuration={400} />
          <Area type="linear" dataKey="activeLh"  name="Lighthouse"  stackId="1" stroke="hsl(32 95% 54%)"  fill="hsl(32 95% 54%)"  fillOpacity={0.6} dot={showDots} animationDuration={400} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function bucketSaturation(points: WorkerStatPoint[], bucketCount = 24) {
  if (points.length < 2) return [];
  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const bucketMs = (maxTs - minTs) / bucketCount;
  if (bucketMs <= 0) return [];

  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    ts:    minTs + i * bucketMs,
    endTs: minTs + (i + 1) * bucketMs,
    saturated: 0,
    partial: 0,
    idle: 0,
  }));

  for (const p of points) {
    const idx = Math.min(Math.floor((p.ts - minTs) / bucketMs), bucketCount - 1);
    const active = p.activeHc + p.activeLh;
    if (active >= p.maxWorkers) buckets[idx].saturated++;
    else if (active === 0) buckets[idx].idle++;
    else buckets[idx].partial++;
  }

  return buckets.filter((b) => b.saturated + b.partial + b.idle > 0);
}

function SaturationChart({ points, rangeLabel }: { points: WorkerStatPoint[]; rangeLabel: string }) {
  const totalSamples = points.length;
  const atCapacity = points.filter((p) => p.activeHc + p.activeLh >= p.maxWorkers).length;
  const idle       = points.filter((p) => p.activeHc + p.activeLh === 0).length;
  const partial    = totalSamples - atCapacity - idle;
  const buckets    = useMemo(() => bucketSaturation(points), [points]);

  const pct = (n: number) => totalSamples > 0 ? Math.round((n / totalSamples) * 100) : 0;

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Times at full capacity · last {rangeLabel}
          </div>
          <div className="mt-0.5 text-4xl font-bold tabular-nums">{atCapacity}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))] flex-wrap">
            <span><span className="font-medium text-[hsl(var(--destructive))]">{atCapacity} min</span> at full capacity ({pct(atCapacity)}%)</span>
            <span className="opacity-40">·</span>
            <span><span className="font-medium text-[hsl(217_91%_60%)]">{partial} min</span> partial ({pct(partial)}%)</span>
            <span className="opacity-40">·</span>
            <span><span className="font-medium text-[hsl(var(--foreground))]">{idle} min</span> idle ({pct(idle)}%)</span>
          </div>
        </div>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
          Idle (gray) · Partial (blue) · At capacity (red) · per time slot
        </span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={buckets} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barCategoryGap="15%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="ts" tickFormatter={fmtAxisDate} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} minTickGap={60} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={24} allowDecimals={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(v, payload) => {
              const endTs = (payload?.[0]?.payload as { endTs?: number })?.endTs;
              const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              return endTs ? `${fmt(v as number)} – ${fmt(endTs)}` : new Date(v as number).toLocaleString();
            }}
            formatter={(v, name) => [`${v} min`, String(name)]}
          />
          <Bar dataKey="idle"      name="Idle"        stackId="a" fill="hsl(var(--muted-foreground))" fillOpacity={0.35} />
          <Bar dataKey="partial"   name="Partial"     stackId="a" fill="hsl(217 91% 60%)" fillOpacity={0.7} />
          <Bar dataKey="saturated" name="At capacity" stackId="a" fill="hsl(var(--destructive))" fillOpacity={0.85} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function QueueDepthChart({ points }: { points: WorkerStatPoint[] }) {
  const hasQueue = points.some((p) => p.queueDepth > 0);
  const showDots = points.length <= 20;
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Queue Depth</h3>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
          Tasks waiting for a free worker slot · 0 is ideal
        </span>
      </div>
      {!hasQueue && points.length > 0 ? (
        <div className="flex h-[60px] items-center gap-2 text-sm text-[hsl(var(--success))]">
          <CheckCircle className="h-4 w-4" />
          No queuing detected in this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="ts" tickFormatter={fmtAxisDate} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} minTickGap={60} type="number" domain={["dataMin", "dataMax"]} scale="time" />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={24} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => new Date(v as number).toLocaleString()} formatter={(v) => [(v as number).toFixed(0), "queued tasks"]} />
            <Area type="monotone" dataKey="queueDepth" name="Queue depth" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.3} dot={showDots} animationDuration={400} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

const MAX_WORKER_MS = 3 * 86_400_000;

export function WorkersDashboard() {
  const { range, setPreset } = useTimeRange();
  const [points, setPoints] = useState<WorkerStatPoint[]>([]);
  const [forecast, setForecast] = useState<WorkerForecast | null>(null);
  const [status, setStatus] = useState<RunnerStatus | null>(null);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (range.endMs - range.startMs > MAX_WORKER_MS) {
      setPreset(WORKER_PRESETS[2].label, WORKER_PRESETS[2].ms); // "24h"
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
    api.workerForecast()
      .then(setForecast)
      .catch((e: unknown) => {
        if (e instanceof Error && e.message.includes("404")) setDisabled(true);
      });
    const id = setInterval(() => {
      api.status().then(setStatus).catch(() => {});
      api.workerForecast().then(setForecast).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (disabled) return;
    api.workerStats(range.startMs, range.endMs).then(setPoints).catch(() => {});
  }, [range, disabled]);

  if (disabled) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="text-[hsl(var(--muted-foreground))]">Worker monitoring is disabled.</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Set <code>runner.workerMonitoring: true</code> in config.yaml to enable it.</p>
        </div>
      </div>
    );
  }

  const currentUtil = status
    ? Math.round((status.workers.active / Math.max(status.workers.max, 1)) * 100)
    : null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Workers</h1>

      {/* Live KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Current utilization"
          value={currentUtil != null ? `${currentUtil}%` : "—"}
          sub={status ? `${status.workers.active} / ${status.workers.max} workers busy` : undefined}
        />
        <StatCard
          label="Queue depth"
          value={forecast ? String(forecast.currentQueueDepth) : "—"}
          sub={forecast?.currentQueueDepth === 0 ? "No tasks waiting" : "Tasks waiting for a worker"}
        />
        <StatCard
          label="Avg task duration"
          value={forecast && forecast.avgDurationMs > 0 ? fmtMs(forecast.avgDurationMs) : "—"}
          sub={forecast ? `${forecast.sampleCount} samples` : "Collecting…"}
        />
      </div>

      {/* Charts */}
      {points.length > 0 ? (
        <>
          <UtilizationChart points={points} maxWorkers={forecast?.maxWorkers ?? (status?.workers.max ?? 3)} />
          <SaturationChart points={points} rangeLabel={range.label} />
          <QueueDepthChart points={points} />
        </>
      ) : (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] flex h-40 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
          No utilization data yet for this time range — samples are recorded every minute.
        </div>
      )}

      {/* Forecast */}
      {forecast && <ForecastTable forecast={forecast} />}

      {/* Recommendations */}
      {forecast && forecast.recommendations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Recommendations</h3>
          {forecast.recommendations.map((r, i) => (
            <RecommendationCard key={i} text={r} />
          ))}
        </div>
      )}
    </div>
  );
}
