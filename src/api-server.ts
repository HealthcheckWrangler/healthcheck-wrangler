import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as os from "node:os";
import type postgres from "postgres";
import { logger } from "./logger.js";
import type { Scheduler } from "./scheduler.js";
import type { ConfigStore } from "./config.js";
import type { ResultsStore } from "./results-store.js";
import { queryLogs, subscribe } from "./db/logs.js";
import {
  getFleetStatusTimeline,
  getSitePageTimeline,
  getSiteKpiTrend,
  getSiteUptimeStats,
} from "./db/healthchecks.js";
import { getLighthouseHistoryForRange } from "./db/lighthouse.js";
import { insertAnnotation, getAnnotations, updateAnnotation, deleteAnnotation } from "./db/annotations.js";
import { getWorkerStats } from "./db/worker-stats.js";

interface ApiDeps {
  scheduler: Scheduler;
  store: ConfigStore;
  results: ResultsStore;
  sql: postgres.Sql;
  startedAt: number;
  maxWorkers: number;
  workerMonitoring: boolean;
}

import type { StoredHealthcheck } from "./results-store.js";
import type { StoredLighthouse } from "./db/lighthouse.js";

function mapHealthcheck(row: StoredHealthcheck) {
  return {
    site: row.site,
    page: row.page,
    up: row.up,
    durationSeconds: Number(row.duration),
    httpStatus: Number(row.http),
    selectorsTotal: Number(row.sel_total),
    selectorsFailed: Number(row.sel_failed),
    timestamp: row.ts instanceof Date ? row.ts.getTime() : Number(row.ts),
    selectors: typeof row.selectors === "string"
      ? JSON.parse(row.selectors as string)
      : (row.selectors ?? []),
  };
}

function mapLighthouse(row: StoredLighthouse) {
  return {
    site: row.site,
    page: row.page,
    scores: {
      performance:    row.perf           ?? -1,
      accessibility:  row.a11y           ?? -1,
      best_practices: row.best_practices ?? -1,
      seo:            row.seo            ?? -1,
    },
    metrics: {
      lcp_seconds:         Number(row.lcp         ?? 0),
      fcp_seconds:         Number(row.fcp         ?? 0),
      tbt_seconds:         Number(row.tbt         ?? 0),
      cls:                 Number(row.cls         ?? 0),
      ttfb_seconds:        Number(row.ttfb        ?? 0),
      speed_index_seconds: Number(row.speed_index ?? 0),
    },
    reportUrl: row.report_url ?? null,
    timestamp: row.ts instanceof Date ? row.ts.toISOString() : String(row.ts),
    recordedAt: row.ts instanceof Date ? row.ts.getTime() : Number(row.ts),
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

async function handleStatus(req: IncomingMessage, res: ServerResponse, deps: ApiDeps): Promise<void> {
  void req;
  const progress = deps.scheduler.taskProgress;
  const tasks = deps.scheduler.runningKeys.map((key) => {
    const [type, ...siteParts] = key.split(":");
    const site = siteParts.join(":");
    const p = progress.get(key);
    return {
      key,
      type: type as "healthcheck" | "lighthouse",
      site,
      pagesCompleted: p?.pagesCompleted ?? 0,
      pagesTotal: p?.pagesTotal ?? 0,
      startedAt: p?.startedAt ?? Date.now(),
    };
  });
  json(res, {
    version: process.env.HCW_VERSION ?? "dev",
    runningSince: new Date(deps.startedAt).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
    workers: { active: deps.scheduler.inFlightCount, max: deps.maxWorkers },
    running: deps.scheduler.runningKeys,
    tasks,
    paused: deps.scheduler.isPaused,
  });
}

async function handleSites(req: IncomingMessage, res: ServerResponse, deps: ApiDeps, siteName?: string): Promise<void> {
  void req;
  if (siteName) {
    const site = deps.store.get(siteName);
    if (!site) { json(res, { error: "not found" }, 404); return; }
    const pages = site.pages.map((p) => p.name);
    const [rawLatest, hcHistory, lhHistory] = await Promise.all([
      deps.results.getPageLatest(siteName, pages),
      deps.results.getHealthcheckHistory(siteName),
      deps.results.getAllLatestLighthouse(siteName),
    ]);
    const pageLatest = Object.fromEntries(
      Object.entries(rawLatest).map(([k, v]) => [
        k,
        { healthcheck: v.healthcheck ? mapHealthcheck(v.healthcheck) : null },
      ]),
    );
    json(res, {
      ...site,
      pageLatest,
      results: {
        healthcheck: hcHistory.map(mapHealthcheck),
        lighthouse: lhHistory.map(mapLighthouse),
      },
    });
    return;
  }

  const sites = await Promise.all(
    deps.store.list().map(async (site) => {
      const pages = site.pages.map((p) => p.name);
      const rawLatest = await deps.results.getPageLatest(site.name, pages);
      const pageLatest = Object.fromEntries(
        Object.entries(rawLatest).map(([k, v]) => [
          k,
          { healthcheck: v.healthcheck ? mapHealthcheck(v.healthcheck) : null },
        ]),
      );
      return { ...site, pageLatest };
    }),
  );
  json(res, sites);
}

async function handleSchedule(req: IncomingMessage, res: ServerResponse, deps: ApiDeps): Promise<void> {
  void req;
  const now = Date.now();
  const tasks = deps.scheduler.taskList.map((t) => ({
    type: t.type,
    site: t.site,
    intervalMs: t.intervalMs,
    nextRun: t.nextRun,
    nextRunInSeconds: Math.max(0, Math.round((t.nextRun - now) / 1000)),
    running: deps.scheduler.isRunning(`${t.type}:${t.site}`),
    triggeredAt: t.triggeredAt ?? null,
  }));
  json(res, tasks);
}

async function handleLogsQuery(req: IncomingMessage, res: ServerResponse, deps: ApiDeps): Promise<void> {
  const url = new URL(req.url!, `http://localhost`);
  const p = url.searchParams;
  const entries = await queryLogs(deps.sql, {
    startMs: p.has("startMs") ? Number(p.get("startMs")) : undefined,
    endMs:   p.has("endMs")   ? Number(p.get("endMs"))   : undefined,
    level:   p.get("level")   ?? undefined,
    site:    p.get("site")    ?? undefined,
    search:  p.get("search")  ?? undefined,
    limit:   p.has("limit")   ? Math.min(Number(p.get("limit")), 1000) : 200,
    offset:  p.has("offset")  ? Number(p.get("offset")) : 0,
  });
  json(res, entries);
}

function handleLogsSse(req: IncomingMessage, res: ServerResponse, deps: ApiDeps): void {
  void deps;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Send recent history first
  queryLogs(deps.sql, { limit: 200 })
    .then((history) => {
      for (const entry of [...history].reverse()) {
        res.write(`id: ${entry.id}\ndata: ${JSON.stringify(entry)}\n\n`);
      }
    })
    .catch(() => {});

  // Then stream live entries
  const unsub = subscribe((entry) => {
    res.write(`id: ${entry.id}\ndata: ${JSON.stringify(entry)}\n\n`);
  });

  req.on("close", unsub);
}

function handleSystem(_req: IncomingMessage, res: ServerResponse): void {
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();
  const [load1m, load5m, load15m] = os.loadavg();
  json(res, {
    memory: {
      totalBytes: totalMem,
      usedBytes:  totalMem - freeMem,
    },
    cpu: {
      count:  os.cpus().length,
      load1m,
      load5m,
      load15m,
    },
    process: {
      rssBytes: process.memoryUsage().rss,
    },
  });
}

async function route(req: IncomingMessage, res: ServerResponse, deps: ApiDeps): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE" });
    res.end();
    return;
  }

  const url = new URL(req.url!, `http://localhost`);
  const path = url.pathname;

  if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
    if (req.method === "POST" && path === "/api/runner/pause") {
      deps.scheduler.pause();
      json(res, { paused: true }); return;
    }
    if (req.method === "POST" && path === "/api/runner/resume") {
      deps.scheduler.resume();
      json(res, { paused: false }); return;
    }
    const triggerMatch = path.match(/^\/api\/sites\/([^/]+)\/trigger\/(healthcheck|lighthouse)$/);
    if (req.method === "POST" && triggerMatch) {
      const site = decodeURIComponent(triggerMatch[1]!);
      const type = triggerMatch[2] as "healthcheck" | "lighthouse";
      const key = `${type}:${site}`;
      if (deps.scheduler.isRunning(key)) {
        json(res, { error: "already running" }, 409); return;
      }
      const triggered = deps.scheduler.triggerNow(type, site);
      if (!triggered) {
        json(res, { error: "task not found — check may be disabled" }, 404); return;
      }
      json(res, { triggered: true }); return;
    }
    if (req.method === "POST" && path === "/api/annotations") {
      const body = await readBody(req);
      let data: { label?: unknown; site?: unknown; ts?: unknown; color?: unknown };
      try { data = JSON.parse(body); } catch { json(res, { error: "invalid JSON" }, 400); return; }
      if (!data.label || typeof data.label !== "string") {
        json(res, { error: "label is required" }, 400); return;
      }
      const row = await insertAnnotation(deps.sql, {
        label: data.label,
        site: typeof data.site === "string" ? data.site : null,
        ts: typeof data.ts === "number" ? new Date(data.ts) : undefined,
        color: typeof data.color === "string" ? data.color : undefined,
      });
      json(res, {
        id: row.id,
        ts: row.ts instanceof Date ? row.ts.getTime() : Number(row.ts),
        label: row.label, site: row.site, color: row.color,
      }, 201);
      return;
    }
    const annotationIdMatch = path.match(/^\/api\/annotations\/(\d+)$/);
    if (annotationIdMatch?.[1]) {
      const id = Number(annotationIdMatch[1]);
      if (req.method === "PUT") {
        const body = await readBody(req);
        let data: { label?: unknown; ts?: unknown };
        try { data = JSON.parse(body); } catch { json(res, { error: "invalid JSON" }, 400); return; }
        const row = await updateAnnotation(deps.sql, id, {
          label: typeof data.label === "string" ? data.label : undefined,
          ts:    typeof data.ts    === "number" ? new Date(data.ts) : undefined,
        });
        if (!row) { json(res, { error: "not found" }, 404); return; }
        json(res, { id: row.id, ts: row.ts instanceof Date ? row.ts.getTime() : Number(row.ts), label: row.label, site: row.site, color: row.color });
        return;
      }
      if (req.method === "DELETE") {
        await deleteAnnotation(deps.sql, id);
        json(res, { deleted: true });
        return;
      }
    }
    json(res, { error: "not found" }, 404); return;
  }

  if (path === "/api/system")     { handleSystem(req, res); return; }
  if (path === "/api/status")     return handleStatus(req, res, deps);
  if (path === "/api/sites")      return handleSites(req, res, deps);
  if (path === "/api/schedule")   return handleSchedule(req, res, deps);
  if (path === "/api/logs/query") return handleLogsQuery(req, res, deps);
  if (path === "/api/logs")       { handleLogsSse(req, res, deps); return; }

  if (path === "/api/fleet-status") {
    const p = url.searchParams;
    const startMs = p.has("startMs") ? Number(p.get("startMs")) : Date.now() - 86_400_000;
    const endMs   = p.has("endMs")   ? Number(p.get("endMs"))   : Date.now();
    const series = await getFleetStatusTimeline(deps.sql, startMs, endMs);
    json(res, series.map((s) => ({
      name: s.name,
      points: s.points.map((pt) => ({
        bucket: pt.bucket instanceof Date ? pt.bucket.getTime() : Number(pt.bucket),
        up: pt.up,
        avgDuration: pt.avg_duration,
        checksUp: pt.checks_up,
        checksTotal: pt.checks_total,
      })),
    })));
    return;
  }

  const siteTimelineMatch = path.match(/^\/api\/sites\/([^/]+)\/timeline$/);
  if (siteTimelineMatch?.[1]) {
    const site = decodeURIComponent(siteTimelineMatch[1]);
    const p = url.searchParams;
    const startMs = p.has("startMs") ? Number(p.get("startMs")) : Date.now() - 86_400_000;
    const endMs   = p.has("endMs")   ? Number(p.get("endMs"))   : Date.now();
    const series = await getSitePageTimeline(deps.sql, site, startMs, endMs);
    json(res, series.map((s) => ({
      name: s.name,
      points: s.points.map((pt) => ({
        bucket: pt.bucket instanceof Date ? pt.bucket.getTime() : Number(pt.bucket),
        up: pt.up,
        avgDuration: pt.avg_duration,
        checksUp: pt.checks_up,
        checksTotal: pt.checks_total,
      })),
    })));
    return;
  }

  const uptimeMatch = path.match(/^\/api\/sites\/([^/]+)\/uptime$/);
  if (uptimeMatch?.[1]) {
    const site = decodeURIComponent(uptimeMatch[1]);
    const stats = await getSiteUptimeStats(deps.sql, site);
    json(res, stats);
    return;
  }

  const siteKpiMatch = path.match(/^\/api\/sites\/([^/]+)\/kpi-trend$/);
  if (siteKpiMatch?.[1]) {
    const site = decodeURIComponent(siteKpiMatch[1]);
    const p = url.searchParams;
    const startMs = p.has("startMs") ? Number(p.get("startMs")) : Date.now() - 86_400_000;
    const endMs   = p.has("endMs")   ? Number(p.get("endMs"))   : Date.now();
    const points = await getSiteKpiTrend(deps.sql, site, startMs, endMs);
    json(res, points.map((pt) => ({
      bucket: pt.bucket instanceof Date ? pt.bucket.getTime() : Number(pt.bucket),
      checksUp: pt.checks_up,
      checksTotal: pt.checks_total,
      avgDuration: pt.avg_duration,
    })));
    return;
  }

  const lhHistoryMatch = path.match(/^\/api\/sites\/([^/]+)\/lighthouse-history$/);
  if (lhHistoryMatch?.[1]) {
    const site = decodeURIComponent(lhHistoryMatch[1]);
    const p = url.searchParams;
    const startMs = p.has("startMs") ? Number(p.get("startMs")) : Date.now() - 7 * 86_400_000;
    const endMs   = p.has("endMs")   ? Number(p.get("endMs"))   : Date.now();
    const rows = await getLighthouseHistoryForRange(deps.sql, site, startMs, endMs);
    json(res, rows.map((r) => ({
      page:  r.page,
      ts:    r.ts instanceof Date ? r.ts.getTime() : Number(r.ts),
      perf:  r.perf  ?? -1,
      a11y:  r.a11y  ?? -1,
      bp:    r.best_practices ?? -1,
      seo:   r.seo   ?? -1,
      lcp:   Number(r.lcp  ?? 0),
      fcp:   Number(r.fcp  ?? 0),
      ttfb:  Number(r.ttfb ?? 0),
      cls:   Number(r.cls  ?? 0),
      tbt:   Number(r.tbt  ?? 0),
    })));
    return;
  }

  if (path === "/api/annotations") {
    const p = url.searchParams;
    const startMs = p.has("startMs") ? Number(p.get("startMs")) : undefined;
    const endMs   = p.has("endMs")   ? Number(p.get("endMs"))   : undefined;
    const site    = p.get("site") ?? undefined;
    const rows = await getAnnotations(deps.sql, site, startMs, endMs);
    json(res, rows.map((r) => ({
      id: r.id,
      ts: r.ts instanceof Date ? r.ts.getTime() : Number(r.ts),
      label: r.label,
      site: r.site,
      color: r.color,
    })));
    return;
  }

  if (path === "/api/worker-stats" || path === "/api/worker-forecast") {
    if (!deps.workerMonitoring) { json(res, { error: "worker monitoring is disabled" }, 404); return; }
  }

  if (path === "/api/worker-stats") {
    const p = url.searchParams;
    const startMs = p.has("startMs") ? Number(p.get("startMs")) : Date.now() - 24 * 3_600_000;
    const endMs   = p.has("endMs")   ? Number(p.get("endMs"))   : Date.now();
    const rows = await getWorkerStats(deps.sql, startMs, endMs);
    json(res, rows.map((r) => ({
      ts:         r.ts instanceof Date ? r.ts.getTime() : Number(r.ts),
      utilPct:    Number(r.util_pct ?? 0),
      queueDepth: Number(r.queue_depth ?? 0),
      activeLh:   Number(r.active_lh ?? 0),
      activeHc:   Number(r.active_hc ?? 0),
      maxWorkers: Number(r.max_workers ?? deps.maxWorkers),
    })));
    return;
  }

  if (path === "/api/worker-forecast") {
    const maxWorkers = deps.maxWorkers;
    const avgDurationMs = deps.scheduler.avgTaskDurationMs || 30_000;
    const sampleCount = deps.scheduler.completionCount;
    const tasks = deps.scheduler.taskList;
    const tasksPerHour = tasks.reduce((s, t) => s + 3_600_000 / t.intervalMs, 0);
    const requiredCapacity = tasksPerHour * (avgDurationMs / 3_600_000);

    const totalMem = os.totalmem();
    const processRss = process.memoryUsage().rss;
    const perWorkerRss = processRss / Math.max(1, deps.scheduler.inFlightCount || maxWorkers);

    const scenarioFor = (n: number) => {
      const satPct = Math.round(Math.min((requiredCapacity / Math.max(n, 1)) * 100, 999));
      const capacityTasksPerHour = n > 0 ? Math.round(n / (avgDurationMs / 3_600_000)) : 0;
      const overflowTasksPerHr = Math.max(0, tasksPerHour - capacityTasksPerHour);
      const avgWaitMs = overflowTasksPerHr > 0
        ? Math.round((overflowTasksPerHr / Math.max(tasksPerHour, 1)) * avgDurationMs)
        : 0;
      const estimatedRamMb = Math.round((perWorkerRss * n) / 1_048_576);
      const projectedMemPct = Math.round(((os.totalmem() - os.freemem() - processRss + perWorkerRss * n) / totalMem) * 100);
      return { workers: n, satPct, avgWaitMs, estimatedRamMb, tasksPerHourCapacity: capacityTasksPerHour, projectedMemPct };
    };

    const current = scenarioFor(maxWorkers);
    const plus1   = scenarioFor(maxWorkers + 1);
    const minus1  = maxWorkers > 1 ? scenarioFor(maxWorkers - 1) : null;

    const recommendations: string[] = [];
    if (deps.scheduler.queueDepth > 0) {
      recommendations.push("Tasks are currently queued — workers cannot keep up with demand right now.");
    }
    if (current.satPct > 90) {
      recommendations.push("Workers are near or over capacity. Consider adding a worker (`runner.workers`).");
      if (plus1.projectedMemPct > 85) {
        recommendations.push("Adding a worker may push container RAM above 85%. Consider increasing Docker memory allocation first.");
      }
      const avgIntervalMin = tasks.length > 0
        ? Math.round(tasks.reduce((s, t) => s + t.intervalMs, 0) / tasks.length / 60_000)
        : 0;
      if (avgIntervalMin > 0 && avgIntervalMin < 30) {
        const suggested = Math.round(avgIntervalMin * (tasksPerHour / (requiredCapacity * 0.75)));
        recommendations.push(`Alternatively, increasing check intervals (currently avg ${avgIntervalMin}m) to ~${suggested}m would reduce load to ~75% capacity without adding a worker.`);
      }
    } else if (current.satPct < 25 && maxWorkers > 1) {
      recommendations.push(`Workers are mostly idle (${current.satPct}% utilization). Reducing to ${maxWorkers - 1} worker(s) would free ~${Math.round(perWorkerRss / 1_048_576)} MB RAM with minimal impact.`);
    } else if (current.satPct <= 90 && current.satPct >= 25) {
      recommendations.push("Worker utilization is healthy. No changes needed.");
    }

    const scenarios = [...(minus1 ? [minus1] : []), current, plus1];
    json(res, {
      scenarios,
      recommendations,
      sampleCount,
      avgDurationMs,
      currentQueueDepth: deps.scheduler.queueDepth,
      tasksPerHour: Math.round(tasksPerHour * 10) / 10,
      maxWorkers,
    });
    return;
  }

  const siteMatch = path.match(/^\/api\/sites\/([^/]+)$/);
  if (siteMatch?.[1]) return handleSites(req, res, deps, decodeURIComponent(siteMatch[1]));

  json(res, { error: "not found" }, 404);
}

export function startApiServer(port: number, deps: ApiDeps): () => Promise<void> {
  const server = createServer((req, res) => {
    route(req, res, deps).catch((err) => {
      logger.error({ err }, "api server error");
      if (!res.headersSent) json(res, { error: "internal error" }, 500);
    });
  });

  server.listen(port, () => {
    logger.info({ port }, "dashboard api server listening");
  });

  return () => new Promise<void>((done) => server.close(() => done()));
}
