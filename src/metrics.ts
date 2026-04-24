import { createServer } from "node:http";
import { Registry, Gauge, collectDefaultMetrics } from "prom-client";
import { logger } from "./logger.js";

export type MetricsSink = "stdout" | "prometheus" | "none";

export interface HealthcheckResult {
  site: string;
  page: string;
  up: boolean;
  durationSeconds: number;
  selectorsTotal: number;
  selectorsFailed: number;
  httpStatus: number;
}

export interface LighthouseResult {
  site: string;
  page: string;
  scores: {
    performance: number;
    accessibility: number;
    best_practices: number;
    seo: number;
  };
  metrics: {
    lcp_seconds: number;
    fcp_seconds: number;
    tbt_seconds: number;
    cls: number;
    ttfb_seconds: number;
    speed_index_seconds: number;
  };
  reportUrl: string | null;
  timestamp: string;
}

export class MetricsRegistry {
  readonly registry = new Registry();
  readonly healthcheckUp: Gauge;
  readonly healthcheckDuration: Gauge;
  readonly healthcheckSelectorsTotal: Gauge;
  readonly healthcheckSelectorsFailed: Gauge;
  readonly healthcheckHttpStatus: Gauge;
  readonly healthcheckLastRun: Gauge;
  readonly siteAlertingEnabled: Gauge;
  readonly lighthouseScore: Gauge;
  readonly lighthouseLcp: Gauge;
  readonly lighthouseFcp: Gauge;
  readonly lighthouseTbt: Gauge;
  readonly lighthouseCls: Gauge;
  readonly lighthouseTtfb: Gauge;
  readonly lighthouseSpeedIndex: Gauge;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.healthcheckUp = new Gauge({
      name: "healthcheck_up",
      help: "1 if the last healthcheck passed, 0 otherwise",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
    this.healthcheckDuration = new Gauge({
      name: "healthcheck_duration_seconds",
      help: "Duration of the last healthcheck in seconds",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
    this.healthcheckSelectorsTotal = new Gauge({
      name: "healthcheck_selectors_total",
      help: "Number of CSS selectors asserted on the last healthcheck",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
    this.healthcheckSelectorsFailed = new Gauge({
      name: "healthcheck_selectors_failed",
      help: "Number of CSS selectors not visible on the last healthcheck",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
    this.healthcheckHttpStatus = new Gauge({
      name: "healthcheck_http_status",
      help: "HTTP status code from the last healthcheck navigation",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
    this.healthcheckLastRun = new Gauge({
      name: "healthcheck_last_run_seconds",
      help: "Unix timestamp of the last completed healthcheck for this page",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
    this.siteAlertingEnabled = new Gauge({
      name: "site_alerting_enabled",
      help: "1 if alerting is enabled for this site, 0 if opted out",
      labelNames: ["site"],
      registers: [this.registry],
    });

    this.lighthouseScore = new Gauge({
      name: "lighthouse_score",
      help: "Lighthouse category score 0-100",
      labelNames: ["site", "page", "category"],
      registers: [this.registry],
    });
    this.lighthouseLcp = new Gauge({
      name: "lighthouse_lcp_seconds",
      help: "Largest Contentful Paint in seconds",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
    this.lighthouseFcp = new Gauge({
      name: "lighthouse_fcp_seconds",
      help: "First Contentful Paint in seconds",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
    this.lighthouseTbt = new Gauge({
      name: "lighthouse_tbt_seconds",
      help: "Total Blocking Time in seconds",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
    this.lighthouseCls = new Gauge({
      name: "lighthouse_cls",
      help: "Cumulative Layout Shift (unitless)",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
    this.lighthouseTtfb = new Gauge({
      name: "lighthouse_ttfb_seconds",
      help: "Time To First Byte in seconds",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
    this.lighthouseSpeedIndex = new Gauge({
      name: "lighthouse_speed_index_seconds",
      help: "Speed Index in seconds",
      labelNames: ["site", "page"],
      registers: [this.registry],
    });
  }

  recordHealthcheck(r: HealthcheckResult): void {
    const labels = { site: r.site, page: r.page };
    this.healthcheckUp.set(labels, r.up ? 1 : 0);
    this.healthcheckDuration.set(labels, r.durationSeconds);
    this.healthcheckSelectorsTotal.set(labels, r.selectorsTotal);
    this.healthcheckSelectorsFailed.set(labels, r.selectorsFailed);
    this.healthcheckHttpStatus.set(labels, r.httpStatus);
    this.healthcheckLastRun.set(labels, Date.now() / 1000);
  }

  recordLighthouse(r: LighthouseResult): void {
    const labels = { site: r.site, page: r.page };
    this.lighthouseScore.set({ ...labels, category: "performance" }, r.scores.performance);
    this.lighthouseScore.set({ ...labels, category: "accessibility" }, r.scores.accessibility);
    this.lighthouseScore.set({ ...labels, category: "best_practices" }, r.scores.best_practices);
    this.lighthouseScore.set({ ...labels, category: "seo" }, r.scores.seo);
    this.lighthouseLcp.set(labels, r.metrics.lcp_seconds);
    this.lighthouseFcp.set(labels, r.metrics.fcp_seconds);
    this.lighthouseTbt.set(labels, r.metrics.tbt_seconds);
    this.lighthouseCls.set(labels, r.metrics.cls);
    this.lighthouseTtfb.set(labels, r.metrics.ttfb_seconds);
    this.lighthouseSpeedIndex.set(labels, r.metrics.speed_index_seconds);
  }

  setAlertingEnabled(site: string, enabled: boolean): void {
    this.siteAlertingEnabled.set({ site }, enabled ? 1 : 0);
  }

  dropSite(site: string): void {
    this.healthcheckUp.remove({ site });
    this.healthcheckDuration.remove({ site });
    this.healthcheckSelectorsTotal.remove({ site });
    this.healthcheckSelectorsFailed.remove({ site });
    this.healthcheckHttpStatus.remove({ site });
    this.healthcheckLastRun.remove({ site });
    this.siteAlertingEnabled.remove({ site });
    this.lighthouseScore.remove({ site });
    this.lighthouseLcp.remove({ site });
    this.lighthouseFcp.remove({ site });
    this.lighthouseTbt.remove({ site });
    this.lighthouseCls.remove({ site });
    this.lighthouseTtfb.remove({ site });
    this.lighthouseSpeedIndex.remove({ site });
  }
}

export function startMetricsServer(
  registry: MetricsRegistry,
  port: number,
): () => Promise<void> {
  const server = createServer(async (req, res) => {
    if (req.url === "/metrics") {
      res.writeHead(200, { "Content-Type": registry.registry.contentType });
      res.end(await registry.registry.metrics());
      return;
    }
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logger.info({ port }, "metrics server listening");
  });

  return () =>
    new Promise<void>((done) => {
      server.close(() => done());
    });
}
