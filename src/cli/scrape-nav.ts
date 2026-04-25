import { Command } from "commander";
import { input } from "@inquirer/prompts";
import chalk from "chalk";
import { chromium } from "playwright";
import { loadRuntimeConfig } from "../runtime-config.js";

interface Opts {
  timeout?: string;
}

async function action(baseUrlArg: string | undefined, navSelectorArg: string | undefined, opts: Opts): Promise<void> {
  const config = loadRuntimeConfig();

  const baseUrl = baseUrlArg ?? await input({
    message: "Base URL to scrape (e.g. https://example.com):",
    validate: (v) => { try { new URL(v); return true; } catch { return "Must be a valid URL"; } },
  });

  const navSelector = navSelectorArg ?? await input({
    message: "CSS selector for the nav element (e.g. nav.nav-bar-container):",
    validate: (v) => v.trim().length > 0 || "Selector cannot be empty",
  });

  const timeoutMs = opts.timeout ? parseInt(opts.timeout, 10) : 30_000;
  const origin = new URL(baseUrl).origin;
  const projectName = config.project.name;

  console.error(chalk.gray(`Scraping ${baseUrl} …`));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: `Mozilla/5.0 (compatible; ${projectName}/0.1; +https://github.com/healthcheckwrangler/healthcheck-wrangler)`,
  });
  const page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    const links = await page.locator(`${navSelector} a`).evaluateAll((anchors) =>
      anchors.map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: (a as HTMLAnchorElement).innerText.trim(),
      })),
    );

    const seen = new Set<string>();
    const results: { path: string; text: string }[] = [];

    for (const { href, text } of links) {
      try {
        const url = new URL(href);
        if (url.origin !== origin) continue;
        const path = url.pathname;
        if (seen.has(path) || !text) continue;
        seen.add(path);
        results.push({ path, text });
      } catch {
        // skip unparseable hrefs
      }
    }

    results.sort((a, b) => a.path.localeCompare(b.path));
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

export const scrapeNavCommand = new Command("scrape-nav")
  .description("Scrape all same-origin navigation links from a CSS selector and output as JSON")
  .argument("[baseUrl]", "URL to scrape — prompted if omitted")
  .argument("[navSelector]", "CSS selector for the nav element — prompted if omitted")
  .option("--timeout <ms>", "navigation timeout in milliseconds", "30000")
  .action(action);
