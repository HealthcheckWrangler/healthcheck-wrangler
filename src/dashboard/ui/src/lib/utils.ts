import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function fmtCountdown(targetMs: number): string {
  const diff = targetMs - Date.now();
  if (diff <= 0) return "now";
  return `in ${fmtDuration(diff)}`;
}

export function fmtOverdue(targetMs: number): { overdue: boolean; label: string } {
  const diff = Date.now() - targetMs;
  if (diff <= 0) return { overdue: false, label: `next ${fmtDuration(-diff)}` };
  return { overdue: true, label: `${fmtDuration(diff)} past due` };
}
