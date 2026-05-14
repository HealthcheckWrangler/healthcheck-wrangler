import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, MessageSquarePlus, Pencil, Trash2, Zap } from "lucide-react";
import { StatusBadge } from "../StatusBadge";
import { cn, fmtOverdue } from "../../lib/utils";
import type { SiteDetail, ScheduleTask, Annotation } from "../../api";

export type Tab = "overview" | "timeline" | "lighthouse" | "pages" | "logs";

const TABS: Tab[] = ["overview", "timeline", "lighthouse", "pages", "logs"];

function toDatetimeLocalStr(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtAnnotationDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const INPUT_CLS = "rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-0.5 text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]";

interface SiteHeaderProps {
  site: SiteDetail;
  siteStatus: "up" | "down" | "running" | "unknown";
  hcTask: ScheduleTask | undefined;
  lhTask: ScheduleTask | undefined;
  triggering: "healthcheck" | "lighthouse" | null;
  onRunNow: (type: "healthcheck" | "lighthouse") => void;
  annotations: Annotation[];
  onAddAnnotation: (label: string, ts: number) => Promise<void>;
  onUpdateAnnotation: (id: number, label: string, ts: number) => Promise<void>;
  onDeleteAnnotation: (id: number) => Promise<void>;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function SiteHeader({
  site, siteStatus, hcTask, lhTask, triggering, onRunNow,
  annotations, onAddAnnotation, onUpdateAnnotation, onDeleteAnnotation,
  tab, onTabChange,
}: SiteHeaderProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addTs, setAddTs] = useState(() => toDatetimeLocalStr(Date.now()));
  const [addSaving, setAddSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editTs, setEditTs] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  const openPanel = () => {
    setAddTs(toDatetimeLocalStr(Date.now()));
    setPanelOpen(true);
    setTimeout(() => labelRef.current?.focus(), 0);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setAddLabel("");
    setEditingId(null);
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = addLabel.trim();
    if (!label) return;
    setAddSaving(true);
    try {
      await onAddAnnotation(label, new Date(addTs).getTime());
      setAddLabel("");
      setAddTs(toDatetimeLocalStr(Date.now()));
    } finally {
      setAddSaving(false);
    }
  };

  const startEdit = (a: Annotation) => {
    setEditingId(a.id);
    setEditLabel(a.label);
    setEditTs(toDatetimeLocalStr(a.ts));
  };

  const submitEdit = async (e: React.FormEvent, id: number) => {
    e.preventDefault();
    const label = editLabel.trim();
    if (!label) return;
    setEditSaving(true);
    try {
      await onUpdateAnnotation(id, label, new Date(editTs).getTime());
      setEditingId(null);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-4">
      <Link
        to="/"
        className="mb-2 flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        <ArrowLeft className="h-3 w-3" /> Overview
      </Link>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold">{site.displayName ?? site.name}</h1>
            {!site.enabled && (
              <span className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Disabled
              </span>
            )}
          </div>
          <a
            href={site.baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"
          >
            {site.baseUrl}
          </a>
        </div>
        {site.enabled
          ? <StatusBadge status={siteStatus} />
          : <span className="shrink-0 rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--muted-foreground))]">Disabled</span>
        }
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-[hsl(var(--muted-foreground))]">
        {hcTask && (
          <span className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Healthcheck
            {(() => {
              if (hcTask.running) return <span className="text-[hsl(var(--warning))]">running now</span>;
              if (hcTask.triggeredAt) return <span className="text-[hsl(var(--warning))]">queued</span>;
              const { overdue, label } = fmtOverdue(hcTask.nextRun);
              return <span className={overdue ? "text-[hsl(var(--destructive))]" : ""}>{label}</span>;
            })()}
            <span className="text-[hsl(var(--border))]">·</span>
            every {Math.round(hcTask.intervalMs / 60_000)}m
            {!hcTask.running && !hcTask.triggeredAt && (
              <button
                onClick={() => onRunNow("healthcheck")}
                disabled={triggering !== null}
                className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 text-[10px] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] disabled:opacity-40 transition-colors"
              >
                {triggering === "healthcheck" ? "…" : "Run now"}
              </button>
            )}
          </span>
        )}
        {lhTask && (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Lighthouse
            {(() => {
              if (lhTask.running) return <span className="text-[hsl(var(--warning))]">running now</span>;
              if (lhTask.triggeredAt) return <span className="text-[hsl(var(--warning))]">queued</span>;
              const { overdue, label } = fmtOverdue(lhTask.nextRun);
              return <span className={overdue ? "text-[hsl(var(--destructive))]" : ""}>{label}</span>;
            })()}
            <span className="text-[hsl(var(--border))]">·</span>
            every {Math.round(lhTask.intervalMs / 3_600_000)}h
            {!lhTask.running && !lhTask.triggeredAt && (
              <button
                onClick={() => onRunNow("lighthouse")}
                disabled={triggering !== null}
                className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 text-[10px] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] disabled:opacity-40 transition-colors"
              >
                {triggering === "lighthouse" ? "…" : "Run now"}
              </button>
            )}
          </span>
        )}
      </div>

      {/* Notes panel toggle */}
      <div className="mt-3">
        <button
          onClick={panelOpen ? closePanel : openPanel}
          className={cn(
            "flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] transition-colors",
            panelOpen
              ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)]"
              : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]",
          )}
        >
          <MessageSquarePlus className="h-3 w-3" />
          {annotations.length > 0 ? `Notes (${annotations.length})` : "Add note"}
        </button>

        {panelOpen && (
          <div className="mt-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] p-3 space-y-3 max-w-2xl">
            {/* Add form */}
            <form onSubmit={submitAdd} className="flex flex-wrap items-center gap-2">
              <input
                ref={labelRef}
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="Label — e.g. Deploy v2.3.1"
                className={cn(INPUT_CLS, "flex-1 min-w-40")}
              />
              <input
                type="datetime-local"
                value={addTs}
                onChange={(e) => setAddTs(e.target.value)}
                className={cn(INPUT_CLS, "shrink-0")}
                style={{ colorScheme: "dark" }}
              />
              <button
                type="submit"
                disabled={!addLabel.trim() || addSaving}
                className="rounded border border-[hsl(var(--primary))] px-2 py-0.5 text-[10px] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))] disabled:opacity-40 transition-colors"
              >
                {addSaving ? "…" : "Save"}
              </button>
              <button
                type="button"
                onClick={closePanel}
                className="rounded border border-[hsl(var(--border))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
              >
                Close
              </button>
            </form>

            {/* Existing annotations */}
            {annotations.length > 0 && (
              <div className="space-y-1 border-t border-[hsl(var(--border)/0.5)] pt-2">
                {[...annotations].sort((a, b) => b.ts - a.ts).map((a) => (
                  <div key={a.id}>
                    {editingId === a.id ? (
                      <form onSubmit={(e) => submitEdit(e, a.id)} className="flex flex-wrap items-center gap-2">
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className={cn(INPUT_CLS, "flex-1 min-w-40")}
                        />
                        <input
                          type="datetime-local"
                          value={editTs}
                          onChange={(e) => setEditTs(e.target.value)}
                          className={cn(INPUT_CLS, "shrink-0")}
                          style={{ colorScheme: "dark" }}
                        />
                        <button
                          type="submit"
                          disabled={!editLabel.trim() || editSaving}
                          className="rounded border border-[hsl(var(--primary))] px-2 py-0.5 text-[10px] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))] disabled:opacity-40 transition-colors"
                        >
                          {editSaving ? "…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded border border-[hsl(var(--border))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                        <span className="flex-1 truncate font-medium">{a.label}</span>
                        <span className="shrink-0 text-[10px] text-[hsl(var(--muted-foreground))]">
                          {fmtAnnotationDate(a.ts)}
                        </span>
                        <button
                          onClick={() => startEdit(a)}
                          className="shrink-0 rounded p-0.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => onDeleteAnnotation(a.id)}
                          className="shrink-0 rounded p-0.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--accent))] transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-0 border-b border-[hsl(var(--border))] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
                : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
