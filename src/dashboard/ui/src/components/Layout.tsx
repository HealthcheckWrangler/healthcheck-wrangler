import { NavLink, useLocation } from "react-router-dom";
import { Activity, LayoutDashboard, ScrollText, Wifi, WifiOff } from "lucide-react";
import { cn } from "../lib/utils";
import type { RunnerStatus, Site } from "../api";
import { TimeRangePicker } from "./TimeRangePicker";

interface LayoutProps {
  children: React.ReactNode;
  status: RunnerStatus | null;
  sites: Site[];
}

export function Layout({ children, status, sites }: LayoutProps) {
  const location = useLocation();
  const isOnline = status !== null;

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))]">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {/* Logo */}
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-4 py-4">
          <Activity className="h-5 w-5 text-[hsl(var(--primary))]" />
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

        {/* Footer */}
        {status && (
          <div className="border-t border-[hsl(var(--border))] px-4 py-3 text-[11px] text-[hsl(var(--muted-foreground))]">
            <div>v{status.version}</div>
            <div>{status.workers.active}/{status.workers.max} workers</div>
          </div>
        )}
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar with time range picker */}
        <div className="flex items-center justify-end border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2">
          <TimeRangePicker />
        </div>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
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
