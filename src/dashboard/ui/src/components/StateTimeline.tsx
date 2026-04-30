import { useState, useCallback } from "react";
import { cn } from "../lib/utils";
import type { TimelineSeries, TimelinePoint } from "../api";

const ROW_H = 26;
const ROW_GAP = 3;
const AXIS_H = 24;
const VB_W = 1000; // fixed viewBox width for bar area

interface TooltipData {
  xPct: number;
  bucketMs: number;
  rows: { name: string; point: TimelinePoint | null }[];
}

interface StateTimelineProps {
  series: TimelineSeries[];
  startMs: number;
  endMs: number;
  title?: string;
  className?: string;
}

function fmtAxisTime(ms: number, rangeMs: number): string {
  const d = new Date(ms);
  if (rangeMs <= 2 * 86_400_000) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function StateTimeline({ series, startMs, endMs, title, className }: StateTimelineProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const rangeMs = endMs - startMs;

  const allBuckets = [...new Set(
    series.flatMap((s) => s.points.map((p) => p.bucket))
  )].sort((a, b) => a - b);

  const bucketMs = allBuckets.length > 1
    ? allBuckets[1] - allBuckets[0]
    : 600_000;

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const hoverMs = startMs + xPct * rangeMs;

    let nearest = allBuckets[0];
    let nearestDist = Infinity;
    for (const b of allBuckets) {
      const d = Math.abs(b - hoverMs);
      if (d < nearestDist) { nearestDist = d; nearest = b; }
    }
    if (nearest === undefined) { setTooltip(null); return; }

    const rows = series.map((s) => ({
      name: s.name,
      point: s.points.find((p) => p.bucket === nearest) ?? null,
    }));

    setTooltip({ xPct, bucketMs: nearest, rows });
  }, [allBuckets, series, startMs, rangeMs]);

  const svgH = series.length * (ROW_H + ROW_GAP) - ROW_GAP;

  // Axis ticks — max 10
  const tickStep = Math.max(1, Math.ceil(allBuckets.length / 10));
  const axisTicks = allBuckets.filter((_, i) => i % tickStep === 0);

  if (series.length === 0) {
    return (
      <div className={cn("rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6", className)}>
        {title && <h3 className="mb-4 text-sm font-medium">{title}</h3>}
        <div className="flex h-20 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
          No data for this time range
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4", className)}>
      {title && <h3 className="mb-3 text-sm font-medium text-[hsl(var(--foreground))]">{title}</h3>}

      <div className="flex gap-0 overflow-x-auto">
        {/* Label column */}
        <div className="shrink-0 w-44 pr-2" style={{ paddingTop: 0 }}>
          {series.map((s, i) => (
            <div
              key={s.name}
              className="flex items-center justify-end text-[11px] text-[hsl(var(--muted-foreground))] truncate"
              style={{ height: ROW_H, marginBottom: i < series.length - 1 ? ROW_GAP : 0 }}
              title={s.name}
            >
              {s.name}
            </div>
          ))}
          {/* axis label spacer matches rotated label height */}
          <div style={{ height: AXIS_H + 8 }} />
        </div>

        {/* Bar + axis SVG */}
        <div className="relative flex-1 min-w-0 flex flex-col">
          <svg
            viewBox={`0 0 ${VB_W} ${svgH}`}
            preserveAspectRatio="none"
            width="100%"
            height={svgH}
            onMouseMove={onMouseMove}
            onMouseLeave={() => setTooltip(null)}
            className="cursor-crosshair"
            style={{ display: "block" }}
          >
            {/* Row backgrounds */}
            {series.map((_, i) => (
              <rect
                key={i}
                x={0} y={i * (ROW_H + ROW_GAP)}
                width={VB_W} height={ROW_H}
                fill="hsl(var(--muted))"
                rx={2}
              />
            ))}

            {/* Bars */}
            {series.map((s, i) => {
              const rowY = i * (ROW_H + ROW_GAP);
              return s.points.map((pt) => {
                const xFrac = (pt.bucket - startMs) / rangeMs;
                const wFrac = bucketMs / rangeMs;
                if (xFrac + wFrac < 0 || xFrac > 1) return null;
                const x = Math.max(0, xFrac * VB_W);
                const w = Math.min(wFrac * VB_W, VB_W - x);
                return (
                  <rect
                    key={`${s.name}-${pt.bucket}`}
                    x={x} y={rowY}
                    width={Math.max(w, 1)}
                    height={ROW_H}
                    fill={pt.up ? "hsl(142 71% 38%)" : "hsl(0 63% 48%)"}
                    rx={1}
                  />
                );
              });
            })}

            {/* Axis tick lines only — labels rendered as HTML below */}
            {axisTicks.map((t) => {
              const x = ((t - startMs) / rangeMs) * VB_W;
              return (
                <line
                  key={t}
                  x1={x} x2={x}
                  y1={0} y2={svgH}
                  stroke="hsl(var(--border))"
                  strokeWidth={0.5}
                  strokeDasharray="3,3"
                />
              );
            })}

            {/* Hover cursor */}
            {tooltip && (
              <line
                x1={tooltip.xPct * VB_W} x2={tooltip.xPct * VB_W}
                y1={0} y2={svgH - AXIS_H}
                stroke="hsl(var(--primary))"
                strokeWidth={1.5}
              />
            )}
          </svg>

          {/* HTML axis labels — rotated -45deg, never distorted by SVG stretch */}
          <div className="relative mt-1" style={{ height: AXIS_H + 8 }}>
            {axisTicks.map((t) => {
              const leftPct = ((t - startMs) / rangeMs) * 100;
              return (
                <div
                  key={t}
                  className="absolute text-[10px] text-[hsl(var(--muted-foreground))] select-none whitespace-nowrap"
                  style={{
                    left: `${leftPct}%`,
                    top: 4,
                    transform: "translateX(-50%) rotate(-40deg)",
                    transformOrigin: "top center",
                  }}
                >
                  {fmtAxisTime(t, rangeMs)}
                </div>
              );
            })}
          </div>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="pointer-events-none absolute z-50 w-52 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-xl text-xs"
              style={{
                left: `${tooltip.xPct * 100}%`,
                top: 0,
                transform: tooltip.xPct > 0.6 ? "translateX(-105%)" : "translateX(8px)",
              }}
            >
              <div className="mb-2 font-medium text-[hsl(var(--foreground))]">
                {new Date(tooltip.bucketMs).toLocaleString([], {
                  month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {tooltip.rows.map(({ name, point }) => (
                  <div key={name} className="flex items-center justify-between gap-2">
                    <span className="truncate text-[hsl(var(--muted-foreground))]">{name}</span>
                    {point ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          point.up ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--destructive))]",
                        )} />
                        <span className={point.up ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]"}>
                          {point.up ? "UP" : "DOWN"}
                        </span>
                        {point.avgDuration > 0 && (
                          <span className="text-[hsl(var(--muted-foreground))]">
                            {point.avgDuration.toFixed(2)}s
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[hsl(var(--muted-foreground))]">—</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
