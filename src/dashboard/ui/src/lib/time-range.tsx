import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface TimeRange {
  startMs: number;
  endMs: number;
  label: string;
}

const PRESETS: { label: string; ms: number }[] = [
  { label: "1h",  ms: 3_600_000 },
  { label: "6h",  ms: 6 * 3_600_000 },
  { label: "24h", ms: 24 * 3_600_000 },
  { label: "7d",  ms: 7 * 86_400_000 },
  { label: "30d", ms: 30 * 86_400_000 },
];

interface TimeRangeCtx {
  range: TimeRange;
  activePreset: string | null;
  setPreset: (label: string) => void;
  setCustom: (startMs: number, endMs: number) => void;
  presets: typeof PRESETS;
}

const Ctx = createContext<TimeRangeCtx | null>(null);

export function TimeRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<TimeRange>(() => {
    const now = Date.now();
    return { startMs: now - 24 * 3_600_000, endMs: now, label: "24h" };
  });
  const [activePreset, setActivePreset] = useState<string | null>("24h");

  const setPreset = useCallback((label: string) => {
    const preset = PRESETS.find((p) => p.label === label);
    if (!preset) return;
    const now = Date.now();
    setRange({ startMs: now - preset.ms, endMs: now, label });
    setActivePreset(label);
  }, []);

  const setCustom = useCallback((startMs: number, endMs: number) => {
    setRange({ startMs, endMs, label: "custom" });
    setActivePreset(null);
  }, []);

  return (
    <Ctx.Provider value={{ range, activePreset, setPreset, setCustom, presets: PRESETS }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTimeRange(): TimeRangeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTimeRange must be used inside TimeRangeProvider");
  return ctx;
}
