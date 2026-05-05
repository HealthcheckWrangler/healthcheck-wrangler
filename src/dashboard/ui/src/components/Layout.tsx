import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronUp, LayoutDashboard, Menu, Moon, Pause, Play, ScrollText, Sun, Wifi, WifiOff, X } from "lucide-react";
import { cn } from "../lib/utils";
import { api, type RunnerStatus, type TaskStatus, type Site } from "../api";
import { TimeRangePicker } from "./TimeRangePicker";
import { useTheme } from "../lib/theme";

interface LayoutProps {
  children: React.ReactNode;
  status: RunnerStatus | null;
  sites: Site[];
}

export function Layout({ children, status, sites }: LayoutProps) {
  const location = useLocation();
  const isOnline = status !== null;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isWorkerOpen, setIsWorkerOpen] = useState(false);
  const [pauseSubmitting, setPauseSubmitting] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => { setIsSidebarOpen(false); }, [location.pathname]);

  const isPaused = status?.paused ?? false;

  const handlePauseToggle = async () => {
    const msg = isPaused
      ? "Resume monitoring? Overdue checks will run immediately."
      : "Pause monitoring? In-progress checks will finish, but no new checks will start until you resume.";
    if (!window.confirm(msg)) return;
    setPauseSubmitting(true);
    try { await (isPaused ? api.resume() : api.pause()); } finally { setPauseSubmitting(false); }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))]">
      {/* Mobile backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "flex w-56 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]",
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200",
        "md:static md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}>
        {/* Logo */}
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-4 py-4">
          <img src="/favicon.png" alt="" className="h-6 w-6 object-contain" />
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">HCW</span>
          {isOnline ? (
            <Wifi className="ml-auto h-3.5 w-3.5 text-[hsl(var(--success))]" />
          ) : (
            <WifiOff className="ml-auto h-3.5 w-3.5 text-[hsl(var(--destructive))]" />
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2">
          <NavItem to="/" icon={<LayoutDashboard className="h-4 w-4" />} label="Overview" exact />
          <NavItem to="/logs" icon={<ScrollText className="h-4 w-4" />} label="Logs" />

          {sites.length > 0 && (
            <>
              <div className="mt-3 mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Sites
              </div>
              {sites.map((site) => {
                const isActive = location.pathname === `/sites/${site.name}`;
                const latestHc = site.latestHealthcheck;
                const isUp = latestHc?.up;
                return (
                  <NavLink
                    key={site.name}
                    to={`/sites/${site.name}`}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"
                        : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full flex-shrink-0",
                        latestHc == null
                          ? "bg-[hsl(var(--muted-foreground))]"
                          : isUp
                            ? "bg-[hsl(var(--success))]"
                            : "bg-[hsl(var(--destructive))]",
                      )}
                    />
                    <span className="truncate">{site.name}</span>
                  </NavLink>
                );
              })}
            </>
          )}
        </nav>

        {/* Worker panel */}
        {status && isWorkerOpen && <WorkerPanel status={status} />}

        {/* Footer */}
        {status && (
          <button
            onClick={() => setIsWorkerOpen((v) => !v)}
            className="w-full border-t border-[hsl(var(--border))] px-4 py-3 text-left text-[11px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
          >
            <div>v{status.version}</div>
            <div className="flex items-center justify-between">
              <span>{status.workers.active}/{status.workers.max} workers</span>
              <ChevronUp className={cn("h-3 w-3 transition-transform duration-200", isWorkerOpen ? "" : "rotate-180")} />
            </div>
          </button>
        )}
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar with time range picker */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2">
          <button
            className="md:hidden rounded p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
            onClick={() => setIsSidebarOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void handlePauseToggle()}
              disabled={!status || pauseSubmitting}
              title={isPaused ? "Resume monitoring" : "Pause monitoring"}
              className={cn(
                "rounded p-1.5 transition-colors disabled:opacity-40",
                isPaused
                  ? "text-[hsl(var(--warning))] hover:bg-[hsl(var(--accent))]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
              )}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            <button
              onClick={toggleTheme}
              className="rounded p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <TimeRangePicker />
          </div>
        </div>
        {isPaused && <PausedTicker />}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

const TICKER_TEXT = "⏸  MONITORING PAUSED — No new checks will start until you resume  ·  ";

function PausedTicker() {
  const item = (
    <span className="shrink-0">
      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} className="inline-block px-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "hsl(25 30% 12%)" }}>
          {TICKER_TEXT}
        </span>
      ))}
    </span>
  );
  return (
    <div
      className="shrink-0 overflow-hidden border-b border-[hsl(38_60%_40%)]"
      style={{ background: "hsl(var(--warning))" }}
    >
      <div style={{ display: "inline-flex", animation: "ticker 12s linear infinite", willChange: "transform" }}>
        {item}
        {item}
      </div>
    </div>
  );
}

function WorkerPanel({ status }: { status: RunnerStatus }) {
  const slots = Array.from({ length: status.workers.max }, (_, i) => status.tasks[i] ?? null);
  return (
    <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      {slots.map((task, i) => (
        <div key={i} className="border-b border-[hsl(var(--border)/0.5)] px-4 py-2.5 last:border-b-0">
          {task ? <RunningSlot task={task} /> : <IdleSlot />}
        </div>
      ))}
    </div>
  );
}

function RunningSlot({ task }: { task: TaskStatus }) {
  const pct = task.pagesTotal > 0 ? (task.pagesCompleted / task.pagesTotal) * 100 : 0;
  const elapsed = Math.round((Date.now() - task.startedAt) / 1000);
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={cn(
          "rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide shrink-0",
          task.type === "healthcheck"
            ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
            : "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
        )}>
          {task.type === "healthcheck" ? "HC" : "LH"}
        </span>
        <span className="truncate text-[11px] font-medium text-[hsl(var(--foreground))]" title={task.site}>
          {task.site}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
          <div
            className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className="shrink-0 text-[10px] text-[hsl(var(--muted-foreground))]"
          title={`${elapsed}s elapsed`}
        >
          {task.pagesCompleted}/{task.pagesTotal}
        </span>
      </div>
    </div>
  );
}

function IdleSlot() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--border))]" />
      Idle
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  exact,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"
            : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]",
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
