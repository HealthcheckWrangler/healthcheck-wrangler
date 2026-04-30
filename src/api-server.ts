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
} from "./db/healthchecks.js";

interface ApiDeps {
  scheduler: Scheduler;
  store: ConfigStore;
  results: ResultsStore;
  sql: postgres.Sql;
  startedAt: number;
  maxWorkers: number;
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
  json(res, {
    version: process.env.HCW_VERSION ?? "dev",
    runningSince: new Date(deps.startedAt).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
    workers: { active: deps.scheduler.inFlightCount, max: deps.maxWorkers },
    running: deps.scheduler.runningKeys,
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
      deps.results.getLighthouseHistory(siteName),
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
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" });
    res.end();
    return;
  }

  const url = new URL(req.url!, `http://localhost`);
  const path = url.pathname;

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
