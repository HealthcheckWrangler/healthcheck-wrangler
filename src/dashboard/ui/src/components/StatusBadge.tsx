import { cn } from "../lib/utils";

type Status = "up" | "down" | "running" | "pending" | "unknown";

const STATUS_STYLES: Record<Status, string> = {
  up: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] ring-[hsl(var(--success)/0.3)]",
  down: "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))] ring-[hsl(var(--destructive)/0.3)]",
  running: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] ring-[hsl(var(--warning)/0.3)]",
  pending: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] ring-[hsl(var(--border))]",
  unknown: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] ring-[hsl(var(--border))]",
};

const STATUS_LABELS: Record<Status, string> = {
  up: "UP",
  down: "DOWN",
  running: "RUNNING",
  pending: "PENDING",
  unknown: "UNKNOWN",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
        STATUS_STYLES[status],
        className,
      )}
    >
      {status === "running" && (
        <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--warning))] animate-pulse" />
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}

export function LevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    error: "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]",
    fatal: "bg-[hsl(var(--destructive)/0.25)] text-[hsl(var(--destructive))] font-bold",
    warn: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
    info: "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]",
    debug: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
    trace: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] opacity-70",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase", styles[level] ?? styles.info)}>
      {level}
    </span>
  );
}
