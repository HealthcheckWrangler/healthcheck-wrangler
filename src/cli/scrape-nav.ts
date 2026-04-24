#!/usr/bin/env tsx
/**
 * Scrapes all same-origin navigation links from a given CSS selector.
 *
 * Usage: tsx src/cli/scrape-nav.ts <baseUrl> <navSelector>
 * Output: JSON array of { path, text } sorted by path
 */
import { chromium } from "playwright";

const [, , baseUrl, navSelector] = process.argv;

if (!baseUrl || !navSelector) {
  console.error("Usage: scrape-nav <baseUrl> <navSelector>");
  process.exit(1);
}

const origin = new URL(baseUrl).origin;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (compatible; improntad-healthchecks/0.1; +https://improntad.com)",
});
const page = await context.newPage();

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const links = await page.locator(`${navSelector} a`).evaluateAll((anchors) =>
    anchors.map((a) => ({
      href: (a as HTMLAnchorElement).href,
      text: (a as HTMLAnchorElement).innerText.trim(),
    }))
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
