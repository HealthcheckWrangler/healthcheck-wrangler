#!/usr/bin/env tsx
import { resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { ConfigStore, type Page, type Site } from "../config.js";
import { runHealthcheck } from "../runner/healthcheck.js";
import { loadRuntimeConfig } from "../runtime-config.js";

interface Options {
  site?: string;
  page?: string;
  headed?: boolean;
  sitesDir: string;
}

const program = new Command();
program
  .name("check")
  .description("Dry-run a healthcheck against one or all sites; prints a table")
  .option("-s, --site <name>", "run only the named site")
  .option("-p, --page <path>", "run only the page with this path (e.g. /)")
  .option("--headed", "open a visible Chromium window")
  .option("--sites-dir <path>", "override sites directory", resolve(process.env.SITES_DIR ?? "./sites"))
  .parse(process.argv);

const opts = program.opts<Options>();

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const store = new ConfigStore(opts.sitesDir, config);
  const sites = store.loadAll();

  const selected = opts.site
    ? sites.filter((s) => s.name === opts.site)
    : sites;

  if (opts.site && selected.length === 0) {
    console.error(chalk.red(`No site named "${opts.site}" found in ${opts.sitesDir}`));
    process.exit(1);
  }

  if (selected.length === 0) {
    console.error(chalk.yellow(`No site configs found in ${opts.sitesDir}`));
    process.exit(1);
  }

  for (const site of selected) {
    await runForSite(site);
  }
}

async function runForSite(site: Site): Promise<void> {
  const pages = opts.page
    ? site.pages.filter((p) => p.path === opts.page)
    : site.pages;

  if (pages.length === 0) {
    console.warn(chalk.yellow(`  no pages matched on site ${site.name}`));
    return;
  }

  console.log();
  console.log(chalk.bold.cyan(`▶ ${site.name}`), chalk.gray(site.baseUrl));

  for (const page of pages) {
    await runForPage(site, page);
  }
}

async function runForPage(site: Site, page: Page): Promise<void> {
  process.stdout.write(`  ${chalk.bold(page.name)} ${chalk.gray(page.path)} ... `);
  const result = await runHealthcheck(site, page, { headed: opts.headed });
  const status = result.up ? chalk.green("PASS") : chalk.red("FAIL");
  console.log(
    status,
    chalk.gray(
      `http ${result.httpStatus} · ${result.durationSeconds.toFixed(2)}s · ${result.selectorsTotal - result.selectorsFailed}/${result.selectorsTotal} selectors`,
    ),
  );
  for (const s of result.selectors) {
    const mark = s.visible ? chalk.green("✓") : chalk.red("✗");
    const note = s.error ? chalk.gray(` (${s.error.split("\n")[0]})`) : "";
    console.log(`    ${mark} ${s.selector}${note}`);
  }
  if (result.error) {
    console.log(chalk.red(`    error: ${result.error}`));
  }
}

main().catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.stack : String(err)));
  process.exit(1);
});
