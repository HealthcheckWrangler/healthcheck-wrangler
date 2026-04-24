import { chromium, type Browser } from "playwright";
import type { Site, Page as PageConfig } from "../config.js";
import type { HealthcheckResult } from "../metrics.js";
import { logger } from "../logger.js";

export interface SelectorResult {
  selector: string;
  visible: boolean;
  error?: string;
}

export interface DetailedHealthcheckResult extends HealthcheckResult {
  selectors: SelectorResult[];
  error?: string;
}

export interface RunHealthcheckOptions {
  headed?: boolean;
  reuseBrowser?: Browser;
  projectName?: string;
  selectorTimeoutMs?: number;
  forceCloseTimeoutMs?: number;
}

function forceClose(p: Promise<void>, ms: number): Promise<void> {
  return Promise.race([
    p,
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error("close timed out")), ms)),
  ]).catch(() => {});
}

export async function runHealthcheck(
  site: Site,
  page: PageConfig,
  opts: RunHealthcheckOptions = {},
): Promise<DetailedHealthcheckResult> {
  const url = new URL(page.path, site.baseUrl).toString();
  const started = performance.now();
  const selectorTimeoutMs = opts.selectorTimeoutMs ?? 5000;
  const forceCloseTimeoutMs = opts.forceCloseTimeoutMs ?? 5000;
  const projectName = opts.projectName ?? "healthcheck-wrangler";

  let ownsBrowser = false;
  let browser = opts.reuseBrowser;
  if (!browser) {
    browser = await chromium.launch({ headless: !opts.headed });
    ownsBrowser = true;
  }

  const context = await browser.newContext({
    userAgent: `Mozilla/5.0 (compatible; ${projectName}/0.1; +https://github.com/healthcheckwrangler/healthcheck-wrangler)`,
  });
  const pw = await context.newPage();

  const result: DetailedHealthcheckResult = {
    site: site.name,
    page: page.name,
    up: false,
    durationSeconds: 0,
    selectorsTotal: page.selectors.length,
    selectorsFailed: 0,
    httpStatus: 0,
    selectors: [],
  };

  try {
    const response = await pw.goto(url, {
      timeout: site.healthcheck.timeoutSeconds * 1000,
      waitUntil: "domcontentloaded",
    });
    result.httpStatus = response?.status() ?? 0;

    for (const selector of page.selectors) {
      try {
        const locator = pw.locator(selector).first();
        const visible = await locator.isVisible({ timeout: selectorTimeoutMs });
        result.selectors.push({ selector, visible });
        if (!visible) result.selectorsFailed += 1;
      } catch (err) {
        result.selectorsFailed += 1;
        result.selectors.push({
          selector,
          visible: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    result.up =
      result.selectorsFailed === 0 &&
      result.httpStatus >= 200 &&
      result.httpStatus < 400;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.up = false;
    logger.warn({ err, site: site.name, page: page.name }, "navigation failed");
  } finally {
    await forceClose(context.close(), forceCloseTimeoutMs);
    if (ownsBrowser) await forceClose(browser.close(), forceCloseTimeoutMs);
    result.durationSeconds = (performance.now() - started) / 1000;
  }

  return result;
}
