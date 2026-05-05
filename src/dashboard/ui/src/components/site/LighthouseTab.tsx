import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { cn } from "../../lib/utils";
import type { LighthouseHistoryPoint } from "../../api";

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
const CLS_COLOR = "hsl(340 82% 60%)";

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
};

type ChartPoint = {
  ts: number;
  perf: number | null; a11y: number | null; bp: number | null; seo: number | null;
  lcp: number | null; fcp: number | null; ttfb: number | null; cls: number | null;
};

function fmtAxisDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:00`;
}

function buildAveragedPoints(history: LighthouseHistoryPoint[]): ChartPoint[] {
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
    b.lcp.push(pt.lcp); b.fcp.push(pt.fcp); b.ttfb.push(pt.ttfb); b.cls.push(pt.cls);
  }

  const avg = (arr: number[]): number | null =>
    arr.length > 0 ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100 : null;

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ts, b]) => ({
      ts,
      perf: avg(b.perf), a11y: avg(b.a11y), bp: avg(b.bp), seo: avg(b.seo),
      lcp: avg(b.lcp), fcp: avg(b.fcp), ttfb: avg(b.ttfb), cls: avg(b.cls),
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
            formatter={(v: number, name: string) => name === "CLS" ? [v.toFixed(3), name] : [`${v.toFixed(2)}s`, name]}
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

interface LighthouseTabProps {
  history: LighthouseHistoryPoint[];
  selectedPage: string;
  onSelectPage: (p: string) => void;
}

export function LighthouseTab({ history, selectedPage, onSelectPage }: LighthouseTabProps) {
  const pages = useMemo(() => [...new Set(history.map((h) => h.page))].sort(), [history]);
  const averagedPoints = useMemo(() => buildAveragedPoints(history), [history]);
  const pagePoints = useMemo((): ChartPoint[] =>
    history
      .filter((h) => h.page === selectedPage)
      .map((h) => ({
        ts: h.ts,
        perf: h.perf >= 0 ? h.perf : null, a11y: h.a11y >= 0 ? h.a11y : null,
        bp: h.bp >= 0 ? h.bp : null, seo: h.seo >= 0 ? h.seo : null,
        lcp: h.lcp, fcp: h.fcp, ttfb: h.ttfb, cls: h.cls,
      })),
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
