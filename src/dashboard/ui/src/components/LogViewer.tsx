import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Trash2, Radio, Clock } from "lucide-react";
import { cn, fmtRelative } from "../lib/utils";
import { LevelBadge } from "./StatusBadge";
import { createLogStream, api, type LogEntry } from "../api";
import { useTimeRange } from "../lib/time-range";

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
const PAGE_SIZE = 100;

interface LogViewerProps {
  site?: string;
}

export function LogViewer({ site }: LogViewerProps) {
  const [isLive, setIsLive] = useState(true);
  const { range } = useTimeRange();

  // Live mode
  const [buffer, setBuffer] = useState<LogEntry[]>([]);
  const lastClearedId = useRef(0);
  const [autoScroll, setAutoScroll] = useState(true);

  // Historical mode
  const [histEntries, setHistEntries] = useState<LogEntry[]>([]);
  const [histOffset, setHistOffset] = useState(0);
  const [histHasMore, setHistHasMore] = useState(false);
  const [histLoading, setHistLoading] = useState(false);

  // Shared
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search for historical mode
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // Live mode: SSE
  useEffect(() => {
    if (!isLive) return;
    lastClearedId.current = 0;
    setBuffer([]);

    const unsub = createLogStream((entry) => {
      if (site && entry.site !== site) return;
      if (entry.id <= lastClearedId.current) return;
      setBuffer((prev) => {
        const next = [...prev, entry];
        return next.length > 1000 ? next.slice(-1000) : next;
      });
    });
    return () => { unsub(); setBuffer([]); };
  }, [isLive, site]);

  // Historical mode: fetch when range / search / site changes
  useEffect(() => {
    if (isLive) return;
    let cancelled = false;
    setHistLoading(true);
    setHistEntries([]);
    setHistOffset(0);
    setHistHasMore(false);

    api.logs({
      startMs: range.startMs,
      endMs: range.endMs,
      site: site ?? undefined,
      search: debouncedSearch || undefined,
      limit: PAGE_SIZE,
      offset: 0,
    }).then((entries) => {
      if (cancelled) return;
      setHistEntries(entries);
      setHistOffset(entries.length);
      setHistHasMore(entries.length === PAGE_SIZE);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setHistLoading(false);
    });

    return () => { cancelled = true; };
  }, [isLive, range.startMs, range.endMs, debouncedSearch, site]);

  const loadMore = () => {
    if (histLoading || !histHasMore) return;
    setHistLoading(true);
    api.logs({
      startMs: range.startMs,
      endMs: range.endMs,
      site: site ?? undefined,
      search: debouncedSearch || undefined,
      limit: PAGE_SIZE,
      offset: histOffset,
    }).then((entries) => {
      setHistEntries((prev) => [...prev, ...entries]);
      setHistOffset((prev) => prev + entries.length);
      setHistHasMore(entries.length === PAGE_SIZE);
    }).catch(() => {}).finally(() => setHistLoading(false));
  };

  // Live: client-side filter (level + text search), newest first
  const displayed = useMemo(() => {
    const filtered = buffer.filter((entry) => {
      if (levelFilter.size > 0 && !levelFilter.has(entry.level)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!entry.msg.toLowerCase().includes(q) && !(entry.site ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return filtered.slice().reverse();
  }, [buffer, levelFilter, search]);

  // Historical: client-side level filter (search is server-side via FTS)
  const histDisplayed = useMemo(() =>
    levelFilter.size > 0 ? histEntries.filter((e) => levelFilter.has(e.level)) : histEntries,
  [histEntries, levelFilter]);

  // Auto-scroll to top so newest entries stay visible (live mode only)
  useEffect(() => {
    if (isLive && autoScroll) {
      containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [displayed.length, isLive, autoScroll]);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setAutoScroll(el.scrollTop < 40);
  };

  const toggleLevel = (level: string) => setLevelFilter((prev) => {
    const next = new Set(prev);
    if (next.has(level)) next.delete(level); else next.add(level);
    return next;
  });

  const clearLog = () => {
    if (isLive) {
      lastClearedId.current = buffer.reduce((m, e) => Math.max(m, e.id), 0);
      setBuffer([]);
    } else {
      setHistEntries([]);
      setHistOffset(0);
      setHistHasMore(false);
    }
  };

  const activeEntries = isLive ? displayed : histDisplayed;

  const levelBorderColor: Record<string, string> = {
    error: "border-l-[hsl(var(--destructive))]",
    fatal: "border-l-[hsl(var(--destructive))]",
    warn:  "border-l-[hsl(var(--warning))]",
    info:  "border-l-transparent",
    debug: "border-l-transparent",
    trace: "border-l-transparent",
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2">

        {/* Live / History toggle */}
        <div className="flex items-center rounded-md border border-[hsl(var(--border))] overflow-hidden text-xs font-medium shrink-0">
          <button
            onClick={() => setIsLive(true)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
              isLive
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
            )}
          >
            <Radio className="h-3 w-3" />
            Live
          </button>
          <button
            onClick={() => setIsLive(false)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
              !isLive
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
            )}
          >
            <Clock className="h-3 w-3" />
            History
          </button>
        </div>

        {/* Level filter */}
        <div className="flex items-center gap-1">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => toggleLevel(l)}
              className={cn(
                "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                levelFilter.has(l)
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
              )}
            >
              {l}
            </button>
          ))}
          {levelFilter.size > 0 && (
            <button
              onClick={() => setLevelFilter(new Set())}
              className="ml-1 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] underline"
            >
              clear filter
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <input
            type="text"
            placeholder={isLive ? "Filter logs…" : "Full-text search…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] py-1 pl-7 pr-3 text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
          />
        </div>

        {/* Count */}
        <span className="text-[11px] text-[hsl(var(--muted-foreground))] shrink-0">
          {isLive
            ? `${displayed.length} / ${buffer.length}`
            : histLoading && histEntries.length === 0
              ? "Loading…"
              : `${histDisplayed.length}${histHasMore ? "+" : ""} entries`}
        </span>

        <button
          onClick={clearLog}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      {/* Log list */}
      <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto font-mono text-[12px]">
        {histLoading && histEntries.length === 0 && (
          <div className="flex h-40 items-center justify-center text-[hsl(var(--muted-foreground))]">
            Loading…
          </div>
        )}

        {!histLoading && activeEntries.length === 0 && (
          <div className="flex h-40 items-center justify-center text-[hsl(var(--muted-foreground))]">
            {isLive
              ? buffer.length === 0
                ? "No log entries — is the runner connected?"
                : "No entries match the current filter"
              : "No log entries in this time range"}
          </div>
        )}

        {activeEntries.map((entry) => {
          const isExpanded = expandedId === entry.id;
          const parsed: Record<string, unknown> =
            typeof entry.data === "string"
              ? (() => { try { return JSON.parse(entry.data) as Record<string, unknown>; } catch { return {}; } })()
              : ((entry.data as Record<string, unknown>) ?? {});

          return (
            <div
              key={entry.id}
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              className={cn(
                "cursor-pointer border-b border-[hsl(var(--border)/0.5)] border-l-2 px-4 py-1.5 transition-colors hover:bg-[hsl(var(--accent)/0.5)]",
                levelBorderColor[entry.level] ?? "border-l-transparent",
                isExpanded && "bg-[hsl(var(--accent)/0.5)]",
              )}
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-[hsl(var(--muted-foreground))]">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
                <LevelBadge level={entry.level} />
                {entry.site && (
                  <span className="shrink-0 rounded bg-[hsl(var(--muted))] px-1.5 text-[hsl(var(--muted-foreground))]">
                    {entry.site}
                  </span>
                )}
                <span className="flex-1 break-all text-[hsl(var(--foreground))]">{entry.msg}</span>
                <span className="shrink-0 text-[hsl(var(--muted-foreground))] text-[10px]">
                  {fmtRelative(entry.ts)}
                </span>
              </div>

              {isExpanded && (
                <pre className="mt-2 overflow-x-auto rounded bg-[hsl(var(--muted))] p-3 text-[11px] text-[hsl(var(--muted-foreground))]">
                  {JSON.stringify(parsed, null, 2)}
                </pre>
              )}
            </div>
          );
        })}

        {/* Load more — historical only */}
        {!isLive && (histLoading || histHasMore || histEntries.length > 0) && (
          <div className="flex justify-center p-4">
            {histLoading && histEntries.length > 0 ? (
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Loading…</span>
            ) : histHasMore ? (
              <button
                onClick={loadMore}
                className="rounded border border-[hsl(var(--border))] px-4 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
              >
                Load more
              </button>
            ) : (
              <span className="text-[11px] text-[hsl(var(--muted-foreground))]">End of results</span>
            )}
          </div>
        )}

      </div>

      {isLive && !autoScroll && (
        <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-1.5 text-center">
          <button
            onClick={() => { setAutoScroll(true); containerRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="text-xs text-[hsl(var(--primary))] hover:underline"
          >
            ↑ Jump to latest
          </button>
        </div>
      )}
    </div>
  );
}
