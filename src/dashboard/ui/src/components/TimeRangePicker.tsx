import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "../lib/utils";
import { useTimeRange } from "../lib/time-range";

export function TimeRangePicker() {
  const { presets, activePreset, setPreset, setCustom } = useTimeRange();
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const applyCustom = () => {
    const startMs = new Date(customStart).getTime();
    const endMs = new Date(customEnd).getTime();
    if (!isNaN(startMs) && !isNaN(endMs) && startMs < endMs) {
      setCustom(startMs, endMs);
      setShowCustom(false);
    }
  };

  return (
    <div className="relative flex items-center gap-1">
      {presets.map((p) => (
        <button
          key={p.label}
          onClick={() => setPreset(p.label)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            activePreset === p.label
              ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
              : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
          )}
        >
          {p.label}
        </button>
      ))}

      <button
        onClick={() => setShowCustom((v) => !v)}
        className={cn(
          "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
          showCustom || activePreset === null
            ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
            : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
        )}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        Custom
      </button>

      {showCustom && (
        <div className="absolute right-0 top-8 z-50 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xl w-72">
          <p className="mb-3 text-xs font-medium text-[hsl(var(--foreground))]">Custom range</p>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-[hsl(var(--muted-foreground))]">From</label>
              <input
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="mt-0.5 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-1 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[hsl(var(--muted-foreground))]">To</label>
              <input
                type="datetime-local"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="mt-0.5 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-1 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={applyCustom}
                className="flex-1 rounded bg-[hsl(var(--primary))] py-1 text-xs font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
              >
                Apply
              </button>
              <button
                onClick={() => setShowCustom(false)}
                className="flex-1 rounded border border-[hsl(var(--border))] py-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
