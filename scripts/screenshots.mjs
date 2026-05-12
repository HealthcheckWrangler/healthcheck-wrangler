/**
 * Capture dashboard screenshots for the README.
 * Usage: node scripts/screenshots.mjs [base-url]
 * Default base-url: http://localhost:3001
 */

import { chromium } from "playwright";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE = process.argv[2] ?? "http://localhost:3001";
const OUT  = join(dirname(fileURLToPath(import.meta.url)), "../docs/screenshots");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE  = { width: 390, height: 844, deviceScaleFactor: 2 };

async function shot(page, name) {
  await page.waitForTimeout(800); // let charts render
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  console.log(`  ✓ ${name}.png`);
}

async function main() {
  const browser = await chromium.launch();

  // ── Desktop screenshots ──────────────────────────────────────────────────
  console.log("\nDesktop:");
  const desk = await browser.newContext({ viewport: DESKTOP });
  const dp = await desk.newPage();

  await dp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await shot(dp, "overview");

  // Click the first site card
  const firstCard = dp.locator("a[href^='/sites/']").first();
  await firstCard.click();
  await dp.waitForURL(/\/sites\//);
  await dp.waitForTimeout(600);
  await shot(dp, "site-overview");

  // Timeline tab
  await dp.locator("button", { hasText: "timeline" }).click();
  await dp.waitForTimeout(400);
  await shot(dp, "site-timeline");

  // Lighthouse tab
  await dp.locator("button", { hasText: "lighthouse" }).click();
  await dp.waitForTimeout(600);
  await shot(dp, "site-lighthouse");

  // Pages tab — exact "pages" text, first match (the tab, not the LH page selector)
  await dp.getByRole("button", { name: /^pages$/i }).first().click();
  await dp.waitForTimeout(400);
  await shot(dp, "site-pages");

  // Logs page — SSE keeps connection open so networkidle never fires
  await dp.goto(`${BASE}/logs`, { waitUntil: "load" });
  await dp.waitForTimeout(600);
  await shot(dp, "logs");

  // Worker panel — expand footer
  await dp.goto(`${BASE}/`, { waitUntil: "load" });
  await dp.locator("aside button", { hasText: "workers" }).click();
  await dp.waitForTimeout(300);
  await shot(dp, "workers");

  await desk.close();

  // ── Light mode ───────────────────────────────────────────────────────────
  console.log("\nLight mode:");
  const light = await browser.newContext({
    viewport: DESKTOP,
    storageState: { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: "hcw-theme", value: "light" }] }] },
  });
  const lp = await light.newPage();
  await lp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await shot(lp, "overview-light");
  await light.close();

  // ── Mobile screenshots ───────────────────────────────────────────────────
  console.log("\nMobile:");
  const mob = await browser.newContext({ viewport: MOBILE });
  const mp = await mob.newPage();
  await mp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await shot(mp, "mobile-overview");

  // Open sidebar
  await mp.locator("button[aria-label='Toggle navigation']").click();
  await mp.waitForTimeout(300);
  await shot(mp, "mobile-sidebar");

  await mob.close();
  await browser.close();

  console.log(`\nSaved to docs/screenshots/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
