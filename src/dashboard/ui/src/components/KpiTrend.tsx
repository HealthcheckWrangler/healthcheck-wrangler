import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "../lib/utils";

interface KpiTrendProps {
  label: string;
  value: string;
  ok?: boolean;
  trendData: { bucket: number; value: number }[];
  trendColor?: string;
  className?: string;
}

export function KpiTrend({ label, value, ok, trendData, trendColor = "hsl(217 91% 60%)", className }: KpiTrendProps) {
  const hasData = trendData.length > 1;

  return (
    <div className={cn(
      "rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 flex items-center gap-4",
      className,
    )}>
      {/* Left: label + sparkline */}
      <div className="flex-1 min-w-0">
        <div className="mb-1 text-xs text-[hsl(var(--muted-foreground))]">{label}</div>
        {hasData ? (
          <ResponsiveContainer width="100%" height={48}>
            <AreaChart data={trendData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`kpiGrad-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={trendColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={trendColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as { bucket: number; value: number };
                  return (
                    <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 text-[11px]">
                      <span className="text-[hsl(var(--foreground))]">{typeof d.value === "number" ? d.value.toFixed(2) : d.value}</span>
                      <span className="ml-1 text-[hsl(var(--muted-foreground))]">
                        · {new Date(d.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={trendColor}
                strokeWidth={1.5}
                fill={`url(#kpiGrad-${label})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-12 flex items-center text-xs text-[hsl(var(--muted-foreground))]">
            No trend data yet
          </div>
        )}
      </div>

      {/* Right: large current value */}
      <div className={cn(
        "shrink-0 text-right text-3xl font-bold tabular-nums",
        ok === false
          ? "text-[hsl(var(--destructive))]"
          : ok === true
            ? "text-[hsl(var(--success))]"
            : "text-[hsl(var(--foreground))]",
      )}>
        {value}
      </div>
    </div>
  );
}
