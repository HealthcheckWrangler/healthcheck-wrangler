import { chromium, type Browser, type BrowserContext } from "playwright";
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

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || /timeout/i.test(err.message));
}

async function tryClose(label: string, p: Promise<void>, ms: number): Promise<void> {
  const result = await Promise.race([
    p.then(() => "ok" as const),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms)),
  ]).catch((err: unknown) => err);

  if (result !== "ok") {
    logger.warn({ label, result }, "browser close did not finish cleanly");
  }
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

  let ownsBrowser = false;
  let browser: Browser | undefined = opts.reuseBrowser;
  let context: BrowserContext | null = null;

  try {
    // Browser launch
    if (!browser) {
      try {
        browser = await chromium.launch({ headless: !opts.headed });
        ownsBrowser = true;
      } catch (err) {
        logger.error({ err, site: site.name, page: page.name }, "browser launch failed");
        throw err;
      }
    }

    // Browser context + page
    try {
      context = await browser.newContext({
        userAgent: `Mozilla/5.0 (compatible; ${projectName}/0.1; +https://github.com/healthcheckwrangler/healthcheck-wrangler)`,
      });
    } catch (err) {
      logger.error({ err, site: site.name, page: page.name }, "browser context creation failed");
      throw err;
    }

    let pw;
    try {
      pw = await context.newPage();
    } catch (err) {
      logger.error({ err, site: site.name, page: page.name }, "browser page creation failed");
      throw err;
    }

    // Navigation
    try {
      const response = await pw.goto(url, {
        timeout: site.healthcheck.timeoutSeconds * 1000,
        waitUntil: "domcontentloaded",
      });
      result.httpStatus = response?.status() ?? 0;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      result.up = false;
      if (isTimeoutError(err)) {
        logger.warn(
          { site: site.name, page: page.name, url, timeoutSeconds: site.healthcheck.timeoutSeconds },
          "navigation timed out",
        );
      } else {
        logger.warn(
          { err, site: site.name, page: page.name, url },
          "navigation failed",
        );
      }
      // Can't check selectors after a navigation failure — return early after finally
      return result;
    }

    // HTTP error
    if (result.httpStatus >= 400) {
      logger.warn(
        { site: site.name, page: page.name, url, http: result.httpStatus },
        "healthcheck HTTP error",
      );
    }

    // Selectors
    for (const selector of page.selectors) {
      try {
        const locator = pw.locator(selector).first();
        const visible = await locator.isVisible({ timeout: selectorTimeoutMs });
        result.selectors.push({ selector, visible });
        if (!visible) {
          result.selectorsFailed += 1;
          logger.warn(
            { site: site.name, page: page.name, selector },
            "selector not visible",
          );
        }
      } catch (err) {
        result.selectorsFailed += 1;
        result.selectors.push({
          selector,
          visible: false,
          error: err instanceof Error ? err.message : String(err),
        });
        if (isTimeoutError(err)) {
          logger.warn(
            { site: site.name, page: page.name, selector, timeoutMs: selectorTimeoutMs },
            "selector check timed out",
          );
        } else {
          logger.warn(
            { err, site: site.name, page: page.name, selector },
            "selector check error",
          );
        }
      }
    }

    result.up =
      result.selectorsFailed === 0 &&
      result.httpStatus >= 200 &&
      result.httpStatus < 400;
  } finally {
    result.durationSeconds = (performance.now() - started) / 1000;
    if (context) await tryClose("context", context.close(), forceCloseTimeoutMs);
    if (ownsBrowser && browser) await tryClose("browser", browser.close(), forceCloseTimeoutMs);
  }

  const logCtx = {
    site: site.name,
    page: page.name,
    up: result.up,
    http: result.httpStatus,
    duration: `${result.durationSeconds.toFixed(2)}s`,
    selectors: `${result.selectorsTotal - result.selectorsFailed}/${result.selectorsTotal}`,
  };

  if (result.up) {
    logger.info(logCtx, "healthcheck passed");
  } else {
    logger.warn(logCtx, "healthcheck failed");
  }

  return result;
}
