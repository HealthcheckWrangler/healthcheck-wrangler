import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

interface SparkLineProps {
  data: HealthcheckResult[];
}

export function SparkLine({ data }: SparkLineProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-12 items-center justify-center text-[11px] text-[hsl(var(--muted-foreground))]">
        No data yet
      </div>
    );
  }

  const chartData = data.map((r) => ({
    value: r.up ? 1 : 0,
    duration: r.durationSeconds,
    ts: r.timestamp,
  }));

  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload as { value: number; duration: number };
            return (
              <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 text-[11px]">
                <span className={d.value ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]"}>
                  {d.value ? "UP" : "DOWN"}
                </span>
                {" · "}
                <span className="text-[hsl(var(--muted-foreground))]">{d.duration.toFixed(2)}s</span>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="hsl(142 71% 45%)"
          strokeWidth={1.5}
          fill="url(#sparkGrad)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface DurationChartProps {
  data: { value: number; up: boolean; ts: number }[];
}

export function DurationChart({ data }: DurationChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-[11px] text-[hsl(var(--muted-foreground))]">
        No data yet
      </div>
    );
  }

  const chartData = data;

  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="durGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload as { value: number; up: boolean };
            return (
              <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 text-[11px]">
                <span className="text-[hsl(var(--primary))]">{d.value.toFixed(2)}s</span>
                {" · "}
                <span className={d.up ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]"}>
                  {d.up ? "UP" : "DOWN"}
                </span>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="hsl(217 91% 60%)"
          strokeWidth={1.5}
          fill="url(#durGrad)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
