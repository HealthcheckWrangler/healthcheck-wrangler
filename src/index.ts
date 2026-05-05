import { resolve } from "node:path";
import { readdir, rmdir, stat, unlink } from "node:fs/promises";
import * as os from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { loadRuntimeConfig } from "./runtime-config.js";
import { ConfigStore, type Site } from "./config.js";
import { logger, initLogDb } from "./logger.js";
import { runHealthcheck } from "./runner/healthcheck.js";
import { runLighthouse } from "./runner/lighthouse.js";
import { Scheduler } from "./scheduler.js";
import { ResultsStore } from "./results-store.js";
import { getClient, closeClient, isDatabaseConfigured } from "./db/client.js";
import { initSchema } from "./db/schema.js";
import { getLatestHealthcheck, type StoredHealthcheck } from "./db/healthchecks.js";
import { startApiServer } from "./api-server.js";
import { AlertManager } from "./alerting/index.js";
import type { DetailedHealthcheckResult } from "./runner/healthcheck.js";
import type { Page } from "./config.js";

async function purgeOldReports(reportsDir: string, retentionDays: number): Promise<number> {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  let deleted = 0;
  try {
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir).catch(() => [] as string[]);
      for (const entry of entries) {
        const full = join(dir, entry);
        const s = await stat(full).catch(() => null);
        if (!s) continue;
        if (s.isDirectory()) {
          await walk(full);
          // Remove directory if it is now empty
          const remaining = await readdir(full).catch(() => null);
          if (remaining?.length === 0) await rmdir(full).catch(() => {});
        } else if (s.mtimeMs < cutoff) {
          await unlink(full).catch(() => {});
          deleted++;
        }
      }
    };
    await walk(reportsDir);
  } catch { /* ignore */ }
  return deleted;
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const sitesDir = resolve(config.runner.sitesDir);
  const reportsDir = resolve(config.runner.reportsDir);

  // Database setup (if DATABASE_URL is configured)
  let sql: ReturnType<typeof getClient> | null = null;
  let results: ResultsStore | null = null;

  if (isDatabaseConfigured()) {
    sql = getClient();
    await initSchema(sql, {
      logs: config.runner.logRetentionDays,
      results: config.runner.resultsRetentionDays,
    });
    initLogDb(sql);
    results = new ResultsStore(sql);
    logger.info("database connected and schema initialised");

    // Purge old lighthouse reports
    const purged = await purgeOldReports(reportsDir, config.runner.lighthouseReportRetentionDays);
    if (purged > 0) logger.info({ purged }, "purged old lighthouse reports");
  }

  // Alert manager (channel-based, state-transition driven)
  const alertManager = new AlertManager(config);

  logger.info(
    {
      sitesDir,
      reportsDir,
      workers: config.runner.workers,
      version: process.env.HCW_VERSION ?? "dev",
      db: isDatabaseConfigured(),
    },
    "starting runner",
  );

  const store = new ConfigStore(sitesDir, config);
  const knownSites = new Set<string>();
  const scheduler = new Scheduler();

  const applySites = (sites: Site[]): void => {
    const current = new Set(sites.map((s) => s.name));
    for (const site of sites) {
      knownSites.add(site.name);
    }
    for (const name of knownSites) {
      if (!current.has(name)) {
        knownSites.delete(name);
      }
    }
    scheduler.rebuild(sites, config.runner.lighthouseStartDelayMs);
    logger.info({ tasks: scheduler.taskList.length }, "scheduler rebuilt");
  };

  store.on("change", applySites);
  const initial = store.loadAll();
  applySites(initial);
  store.watch();
  logger.info({ sites: initial.length }, "initial sites loaded");

  let stopApi: (() => Promise<void>) | null = null;
  if (config.runner.apiPort > 0 && sql && results) {
    stopApi = startApiServer(config.runner.apiPort, {
      scheduler,
      store,
      results,
      sql,
      startedAt: Date.now(),
      maxWorkers: config.runner.workers,
    });
  }

  // Resource monitoring — sample every 60s and alert on threshold crossings
  const resourceInterval = setInterval(async () => {
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    await alertManager.onResourceStats({
      memPct:        Math.round(((totalMem - freeMem) / totalMem) * 100),
      memUsedBytes:  totalMem - freeMem,
      memTotalBytes: totalMem,
      load1m:        os.loadavg()[0] ?? 0,
      cpuCount:      os.cpus().length,
    });
  }, 60_000);

  // Periodic lighthouse report cleanup (every 24h)
  const reportCleanupInterval = sql
    ? setInterval(async () => {
        const n = await purgeOldReports(reportsDir, config.runner.lighthouseReportRetentionDays);
        if (n > 0) logger.info({ purged: n }, "purged old lighthouse reports");
      }, 86_400_000)
    : null;

  let idleLoggedAt = 0;

  const runTask = (task: import("./scheduler.js").ScheduledTask): Promise<void> => {
    const site = store.get(task.site);
    if (!site) return Promise.resolve();
    const key = `${task.type}:${task.site}`;

    if (task.type === "healthcheck") {
      return (async () => {
        scheduler.setProgress(key, site.pages.length);

        // Snapshot previous state for all pages before running any check
        const prevStates = new Map<string, StoredHealthcheck | null>();
        if (sql) {
          for (const page of site.pages) {
            prevStates.set(page.name, await getLatestHealthcheck(sql, site.name, page.name));
          }
        }

        const pageResults: Array<{ page: Page; result: DetailedHealthcheckResult }> = [];
        const browser = await chromium.launch({ headless: true });
        try {
          for (const page of site.pages) {
            const result = await runHealthcheck(site, page, {
              reuseBrowser: browser,
              projectName: config.project.name,
              selectorTimeoutMs: config.healthcheck.selectorTimeoutMs,
              forceCloseTimeoutMs: config.healthcheck.forceCloseTimeoutMs,
            });
            await results?.recordHealthcheck(result);
            scheduler.incrementProgress(key);
            pageResults.push({ page, result });
            if (config.runner.pageDelayMs > 0) await sleep(config.runner.pageDelayMs);
          }
        } finally {
          await browser.close().catch(() => {});
        }

        // Fire one site-level alert only when all pages completed
        if (pageResults.length === site.pages.length) {
          await alertManager.onSiteHealthcheckResults(pageResults, prevStates, site);
        }
      })();
    }

    return (async () => {
      scheduler.setProgress(key, site.pages.length);
      for (const page of site.pages) {
        const result = await runLighthouse(site, page, reportsDir, {
          desktopWidth: config.lighthouse.desktopWidth,
          desktopHeight: config.lighthouse.desktopHeight,
          forceCloseTimeoutMs: config.lighthouse.forceCloseTimeoutMs,
        });
        if (result) {
          await results?.recordLighthouse(result);
        }
        scheduler.incrementProgress(key);
      }
    })();
  };

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    scheduler.stop();
    clearInterval(resourceInterval);
    if (reportCleanupInterval) clearInterval(reportCleanupInterval);
    await store.stop();
    await Promise.allSettled(scheduler.inFlightValues);
    if (stopApi) await stopApi();
    await closeClient();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  while (!scheduler.isStopping) {
    const now = Date.now();

    let dispatched = 0;
    if (!scheduler.isPaused) {
      const due = scheduler.due(now);

      for (const task of due) {
        const key = `${task.type}:${task.site}`;
        if (scheduler.isRunning(key)) continue;
        if (task.type === "lighthouse" && scheduler.hasLighthouseRunning()) continue;
        if (scheduler.inFlightCount >= config.runner.workers) break;

        logger.info({ site: task.site, type: task.type, workers: scheduler.inFlightCount + 1 }, "task started");
        const promise = runTask(task)
          .catch((err) => logger.error({ err, site: task.site, type: task.type }, "task failed"))
          .finally(() => {
            scheduler.markDone(key);
            scheduler.markRan(task);
            logger.info({ site: task.site, type: task.type }, "task complete");
          });
        scheduler.markRunning(key, promise);
        dispatched++;
        idleLoggedAt = 0;
      }

      if (dispatched === 0 && due.length === 0 && now - idleLoggedAt > 60_000) {
        const next = scheduler.nextDue();
        if (next) {
          const inSec = Math.round(Math.max(0, next.at - now) / 1000);
          logger.info(
            { nextSite: next.task.site, nextType: next.task.type, inSeconds: inSec },
            "idle — next task scheduled",
          );
          idleLoggedAt = now;
        }
      }
    }

    await sleep(config.runner.schedulerTickMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

main().catch((err) => {
  logger.fatal({ err }, "runner crashed");
  process.exit(1);
});
