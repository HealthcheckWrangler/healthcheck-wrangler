export interface RunnerStatus {
  version: string;
  runningSince: string;
  uptimeSeconds: number;
  workers: { active: number; max: number };
  running: string[];
  paused: boolean;
}

export interface SitePage {
  path: string;
  name: string;
  selectors: string[];
}

export interface SelectorResult {
  selector: string;
  visible: boolean;
  error?: string;
}

export interface HealthcheckResult {
  site: string;
  page: string;
  up: boolean;
  durationSeconds: number;
  selectorsTotal: number;
  selectorsFailed: number;
  httpStatus: number;
  timestamp: number;
  selectors?: SelectorResult[];
}

export interface PageLatest {
  healthcheck: HealthcheckResult | null;
}

export interface LighthouseScores {
  performance: number;
  accessibility: number;
  best_practices: number;
  seo: number;
}

export interface LighthouseResult {
  site: string;
  page: string;
  scores: LighthouseScores;
  metrics: {
    lcp_seconds: number;
    fcp_seconds: number;
    tbt_seconds: number;
    cls: number;
    ttfb_seconds: number;
    speed_index_seconds: number;
  };
  timestamp: string;
  recordedAt: number;
}

export interface Site {
  name: string;
  baseUrl: string;
  alerting: boolean;
  healthcheck: { enabled: boolean; intervalMinutes: number; timeoutSeconds: number };
  lighthouse: { enabled: boolean; intervalMinutes: number; throttling: string };
  pages: SitePage[];
  pageLatest: Record<string, PageLatest>;
}

export interface SiteDetail extends Site {
  results: {
    healthcheck: HealthcheckResult[];
    lighthouse: LighthouseResult[];
  };
  pageLatest: Record<string, PageLatest>;
}

export interface ScheduleTask {
  type: "healthcheck" | "lighthouse";
  site: string;
  intervalMs: number;
  nextRun: number;
  nextRunInSeconds: number;
  running: boolean;
}

export interface LogEntry {
  id: number;
  ts: number;
  level: string;
  site?: string;
  page?: string;
  msg: string;
  data: unknown;
}

export interface LogQuery {
  startMs?: number;
  endMs?: number;
  level?: string;
  site?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TimelinePoint {
  bucket: number;
  up: boolean;
  avgDuration: number;
  checksUp: number;
  checksTotal: number;
}

export interface TimelineSeries {
  name: string;
  points: TimelinePoint[];
}

export interface KpiTrendPoint {
  bucket: number;
  checksUp: number;
  checksTotal: number;
  avgDuration: number;
}

export interface LighthouseHistoryPoint {
  page: string;
  ts: number;
  perf: number;
  a11y: number;
  bp: number;
  seo: number;
  lcp: number;
  fcp: number;
  ttfb: number;
  cls: number;
  tbt: number;
}

export interface SystemStats {
  memory: { totalBytes: number; usedBytes: number };
  cpu: { count: number; load1m: number; load5m: number; load15m: number };
  process: { rssBytes: number };
}

const BASE = "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  system: () => get<SystemStats>("/api/system"),
  status: () => get<RunnerStatus>("/api/status"),
  sites: () => get<Site[]>("/api/sites"),
  site: (name: string) => get<SiteDetail>(`/api/sites/${encodeURIComponent(name)}`),
  schedule: () => get<ScheduleTask[]>("/api/schedule"),
  fleetStatus: (startMs: number, endMs: number) =>
    get<TimelineSeries[]>(`/api/fleet-status?startMs=${startMs}&endMs=${endMs}`),
  siteTimeline: (name: string, startMs: number, endMs: number) =>
    get<TimelineSeries[]>(`/api/sites/${encodeURIComponent(name)}/timeline?startMs=${startMs}&endMs=${endMs}`),
  siteKpiTrend: (name: string, startMs: number, endMs: number) =>
    get<KpiTrendPoint[]>(`/api/sites/${encodeURIComponent(name)}/kpi-trend?startMs=${startMs}&endMs=${endMs}`),
  siteLighthouseHistory: (name: string, startMs: number, endMs: number) =>
    get<LighthouseHistoryPoint[]>(`/api/sites/${encodeURIComponent(name)}/lighthouse-history?startMs=${startMs}&endMs=${endMs}`),
  trigger: (site: string, type: "healthcheck" | "lighthouse") =>
    fetch(`/api/sites/${encodeURIComponent(site)}/trigger/${type}`, { method: "POST" })
      .then((r) => r.json() as Promise<{ triggered: boolean } | { error: string }>),
  pause: () => fetch("/api/runner/pause", { method: "POST" }).then((r) => r.json()),
  resume: () => fetch("/api/runner/resume", { method: "POST" }).then((r) => r.json()),
  logs: async (query: LogQuery = {}): Promise<LogEntry[]> => {
    const params = new URLSearchParams();
    if (query.startMs !== undefined) params.set("startMs", String(query.startMs));
    if (query.endMs !== undefined) params.set("endMs", String(query.endMs));
    if (query.level) params.set("level", query.level);
    if (query.site) params.set("site", query.site);
    if (query.search) params.set("search", query.search);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.offset !== undefined) params.set("offset", String(query.offset));
    const entries = await get<Array<LogEntry & { ts: string | number }>>(`/api/logs/query?${params}`);
    return entries.map((e) => ({ ...e, ts: typeof e.ts === "string" ? new Date(e.ts).getTime() : e.ts }));
  },
};

export function createLogStream(onEntry: (e: LogEntry) => void): () => void {
  const es = new EventSource("/api/logs");
  es.onmessage = (ev) => {
    try {
      const raw = JSON.parse(ev.data) as LogEntry & { ts: string | number };
      onEntry({ ...raw, ts: typeof raw.ts === "string" ? new Date(raw.ts).getTime() : raw.ts });
    } catch {
      /* ignore */
    }
  };
  return () => es.close();
}
