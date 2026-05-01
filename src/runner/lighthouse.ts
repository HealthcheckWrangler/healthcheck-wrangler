import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import lighthouse from "lighthouse";
import type { Site, Page as PageConfig } from "../config.js";
import type { LighthouseResult } from "../types.js";
import { logger } from "../logger.js";

/** Bind a server to port 0 to let the OS pick a free port, then release it. */
async function getFreePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.listen(0, () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close(() => res(port));
    });
    srv.on("error", rej);
  });
}

export interface LighthouseRunResult extends LighthouseResult {
  reportHtmlPath: string;
  reportJsonPath: string;
}

export interface LighthouseRunOptions {
  desktopWidth?: number;
  desktopHeight?: number;
  forceCloseTimeoutMs?: number;
}

function forceClose(p: Promise<void>, ms: number): Promise<void> {
  return Promise.race([
    p,
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error("close timed out")), ms)),
  ]).catch(() => {});
}

export async function runLighthouse(
  site: Site,
  page: PageConfig,
  reportsDir: string,
  opts: LighthouseRunOptions = {},
): Promise<LighthouseRunResult | null> {
  const url = new URL(page.path, site.baseUrl).toString();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safePageName = slugify(page.name);
  const outDir = resolve(reportsDir, site.name, safePageName);
  await mkdir(outDir, { recursive: true });

  const htmlPath = join(outDir, `${timestamp}.html`);
  const jsonPath = join(outDir, `${timestamp}.json`);
  const desktopWidth = opts.desktopWidth ?? 1350;
  const desktopHeight = opts.desktopHeight ?? 940;
  const forceCloseTimeoutMs = opts.forceCloseTimeoutMs ?? 5000;

  // Launch via Playwright so Lighthouse inherits the same stealth fingerprint
  // that lets healthchecks pass Wordfence bot detection.
  // We allocate a free port ourselves and pass it as --remote-debugging-port
  // so Lighthouse can reach the CDP JSON API directly.
  const port = await getFreePort();
  const browser = await chromium.launch({
    args: [`--remote-debugging-port=${port}`, "--disable-dev-shm-usage"],
  });

  try {
    const isDesktop = site.lighthouse.throttling === "desktop";
    const runnerResult = await lighthouse(url, {
      port,
      output: ["html", "json"],
      logLevel: "error",
      formFactor: isDesktop ? "desktop" : "mobile",
      // Use real network conditions instead of Lantern simulation.
      // Simulation (the default) fails with NO_LCP on many WordPress sites
      // because the LCP element is loaded via JS that the simulator can't trace.
      throttlingMethod: "provided",
      screenEmulation: isDesktop
        ? { mobile: false, width: desktopWidth, height: desktopHeight, deviceScaleFactor: 1, disabled: false }
        : undefined,
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    });

    if (!runnerResult) {
      logger.warn({ site: site.name, page: page.name }, "lighthouse returned no result");
      return null;
    }

    const reports = Array.isArray(runnerResult.report)
      ? runnerResult.report
      : [runnerResult.report];
    const [htmlReport = "", jsonReport = ""] = reports;

    await writeFile(htmlPath, htmlReport, "utf8");
    await writeFile(jsonPath, jsonReport, "utf8");

    const lhr = runnerResult.lhr;
    const audits = lhr.audits;
    const categories = lhr.categories;

    // Returns -1 when Lighthouse couldn't compute the score (e.g. NO_LCP → no performance score).
    // This lets Grafana distinguish "genuinely bad" (0–49) from "not measurable" (-1).
    const score = (key: string): number => {
      const s = categories[key]?.score;
      return s == null ? -1 : Math.round((s as number) * 100);
    };

    const auditMs = (key: string): number => {
      const value = audits[key]?.numericValue;
      return typeof value === "number" ? value / 1000 : 0;
    };

    const auditRaw = (key: string): number => {
      const value = audits[key]?.numericValue;
      return typeof value === "number" ? value : 0;
    };

    const result = {
      site: site.name,
      page: page.name,
      timestamp,
      scores: {
        performance: score("performance"),
        accessibility: score("accessibility"),
        best_practices: score("best-practices"),
        seo: score("seo"),
      },
      metrics: {
        lcp_seconds: auditMs("largest-contentful-paint"),
        fcp_seconds: auditMs("first-contentful-paint"),
        tbt_seconds: auditMs("total-blocking-time"),
        cls: auditRaw("cumulative-layout-shift"),
        ttfb_seconds: auditMs("server-response-time"),
        speed_index_seconds: auditMs("speed-index"),
      },
      reportUrl: null,
      reportHtmlPath: htmlPath,
      reportJsonPath: jsonPath,
    };

    logger.info(
      {
        site: result.site,
        page: result.page,
        perf: result.scores.performance,
        a11y: result.scores.accessibility,
        seo: result.scores.seo,
        lcp: `${result.metrics.lcp_seconds.toFixed(2)}s`,
      },
      "lighthouse complete",
    );

    return result;
  } catch (err) {
    logger.error({ err, site: site.name, page: page.name }, "lighthouse failed");
    return null;
  } finally {
    await forceClose(browser.close(), forceCloseTimeoutMs);
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
