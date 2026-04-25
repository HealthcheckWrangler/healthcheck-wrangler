import { resolve } from "node:path";
import { chromium } from "playwright";
import { loadRuntimeConfig } from "./runtime-config.js";
import { ConfigStore, type Site } from "./config.js";
import {
  MetricsRegistry,
  startMetricsServer,
  type MetricsSink,
} from "./metrics.js";
import { logger } from "./logger.js";
import { runHealthcheck } from "./runner/healthcheck.js";
import { runLighthouse } from "./runner/lighthouse.js";

interface ScheduledTask {
  type: "healthcheck" | "lighthouse";
  site: string;
  intervalMs: number;
  nextRun: number;
}

class Scheduler {
  private tasks: ScheduledTask[] = [];
  private stopping = false;

  rebuild(sites: Site[]): void {
    const now = Date.now();
    const next: ScheduledTask[] = [];
    for (const site of sites) {
      if (site.healthcheck.enabled) {
        const existing = this.tasks.find(
          (t) => t.type === "healthcheck" && t.site === site.name,
        );
        next.push({
          type: "healthcheck",
          site: site.name,
          intervalMs: site.healthcheck.intervalMinutes * 60_000,
          nextRun: existing?.nextRun ?? now,
        });
      }
      if (site.lighthouse.enabled) {
        const existing = this.tasks.find(
          (t) => t.type === "lighthouse" && t.site === site.name,
        );
        next.push({
          type: "lighthouse",
          site: site.name,
          intervalMs: site.lighthouse.intervalMinutes * 60_000,
          nextRun: existing?.nextRun ?? now + lighthouseStartDelayMs,
        });
      }
    }
    this.tasks = next;
    logger.info({ tasks: this.tasks.length }, "scheduler rebuilt");
  }

  due(now: number): ScheduledTask[] {
    return this.tasks.filter((t) => t.nextRun <= now);
  }

  markRan(task: ScheduledTask): void {
    task.nextRun = Date.now() + task.intervalMs;
  }

  nextDue(): { task: ScheduledTask; at: number } | null {
    if (this.tasks.length === 0) return null;
    const soonest = this.tasks.reduce((a, b) => (a.nextRun < b.nextRun ? a : b));
    return { task: soonest, at: soonest.nextRun };
  }

  stop(): void {
    this.stopping = true;
  }

  get isStopping(): boolean {
    return this.stopping;
  }
}

// Module-level so Scheduler.rebuild() can reference it before config is fully wired.
let lighthouseStartDelayMs = 30_000;

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  lighthouseStartDelayMs = config.runner.lighthouseStartDelayMs;

  const sitesDir = resolve(config.runner.sitesDir);
  const reportsDir = resolve(config.runner.reportsDir);
  const sink = config.runner.metricsSink as MetricsSink;

  logger.info({ sitesDir, reportsDir, sink, workers: config.runner.workers }, "starting runner");

  const metrics = new MetricsRegistry();
  const store = new ConfigStore(sitesDir, config);
  const knownSites = new Set<string>();

  const applySites = (sites: Site[]): void => {
    const current = new Set(sites.map((s) => s.name));
    for (const site of sites) {
      metrics.setAlertingEnabled(site.name, site.alerting);
      knownSites.add(site.name);
    }
    for (const name of knownSites) {
      if (!current.has(name)) {
        metrics.dropSite(name);
        knownSites.delete(name);
      }
    }
    scheduler.rebuild(sites);
  };

  const scheduler = new Scheduler();
  store.on("change", applySites);

  const initial = store.loadAll();
  applySites(initial);
  store.watch();
  logger.info({ sites: initial.length }, "initial sites loaded");

  let stopServer: (() => Promise<void>) | null = null;
  if (sink === "prometheus") {
    stopServer = startMetricsServer(metrics, config.runner.metricsPort);
  }

  const inFlight = new Map<string, Promise<void>>();
  let idleLoggedAt = 0;

  const runTask = (task: ScheduledTask): Promise<void> => {
    const site = store.get(task.site);
    if (!site) return Promise.resolve();

    if (task.type === "healthcheck") {
      return (async () => {
        const browser = await chromium.launch({ headless: true });
        try {
          for (const page of site.pages) {
            const result = await runHealthcheck(site, page, {
              reuseBrowser: browser,
              projectName: config.project.name,
              selectorTimeoutMs: config.healthcheck.selectorTimeoutMs,
              forceCloseTimeoutMs: config.healthcheck.forceCloseTimeoutMs,
            });
            metrics.recordHealthcheck(result);
            if (sink === "stdout") logger.info({ result }, "healthcheck complete");
            if (config.runner.pageDelayMs > 0) await sleep(config.runner.pageDelayMs);
          }
        } finally {
          await browser.close().catch(() => {});
        }
      })();
    }

    return (async () => {
      for (const page of site.pages) {
        const result = await runLighthouse(site, page, reportsDir, {
          desktopWidth: config.lighthouse.desktopWidth,
          desktopHeight: config.lighthouse.desktopHeight,
          forceCloseTimeoutMs: config.lighthouse.forceCloseTimeoutMs,
        });
        if (result) {
          metrics.recordLighthouse(result);
          if (sink === "stdout") logger.info({ result }, "lighthouse complete");
        }
      }
    })();
  };

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    scheduler.stop();
    await store.stop();
    await Promise.allSettled(inFlight.values());
    if (stopServer) await stopServer();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  while (!scheduler.isStopping) {
    const now = Date.now();
    const due = scheduler.due(now);

    const lighthouseRunning = [...inFlight.keys()].some((k) => k.startsWith("lighthouse:"));

    let dispatched = 0;
    for (const task of due) {
      const key = `${task.type}:${task.site}`;
      if (inFlight.has(key)) continue;
      if (task.type === "lighthouse" && lighthouseRunning) continue;
      if (inFlight.size >= config.runner.workers) break;

      logger.info({ site: task.site, type: task.type, workers: inFlight.size + 1 }, "task started");
      const promise = runTask(task)
        .catch((err) => logger.error({ err, site: task.site, page: task.type }, "task failed"))
        .finally(() => {
          inFlight.delete(key);
          scheduler.markRan(task);
          logger.info({ site: task.site, type: task.type }, "task complete");
        });
      inFlight.set(key, promise);
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
