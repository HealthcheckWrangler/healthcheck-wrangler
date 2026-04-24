#!/usr/bin/env tsx
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { Command } from "commander";
import chalk from "chalk";
import { ConfigStore } from "../config.js";
import { runLighthouse } from "../runner/lighthouse.js";
import { loadRuntimeConfig } from "../runtime-config.js";

interface Options {
  site: string;
  page?: string;
  open?: boolean;
  sitesDir: string;
  reportsDir: string;
}

const program = new Command();
program
  .name("lighthouse")
  .description("Dry-run a Lighthouse audit against one page; writes HTML+JSON and optionally opens the report")
  .requiredOption("-s, --site <name>", "site to audit")
  .option("-p, --page <path>", "specific page path (defaults to all pages)")
  .option("--no-open", "do not open the HTML report after running")
  .option("--sites-dir <path>", "override sites directory", resolve(process.env.SITES_DIR ?? "./sites"))
  .option("--reports-dir <path>", "override reports directory", resolve(process.env.REPORTS_DIR ?? "./reports"))
  .parse(process.argv);

const opts = program.opts<Options>();

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const store = new ConfigStore(opts.sitesDir, config);
  store.loadAll();
  const site = store.get(opts.site);
  if (!site) {
    console.error(chalk.red(`No site named "${opts.site}" found in ${opts.sitesDir}`));
    process.exit(1);
  }

  const pages = opts.page ? site.pages.filter((p) => p.path === opts.page) : site.pages;
  if (pages.length === 0) {
    console.error(chalk.red(`No matching pages on site "${site.name}"`));
    process.exit(1);
  }

  for (const page of pages) {
    console.log();
    console.log(chalk.bold.cyan(`▶ ${site.name}${page.path}`));
    const result = await runLighthouse(site, page, opts.reportsDir);
    if (!result) {
      console.log(chalk.red("  lighthouse failed — see logs"));
      continue;
    }
    console.log(
      `  perf ${color(result.scores.performance)} · a11y ${color(result.scores.accessibility)} · bp ${color(result.scores.best_practices)} · seo ${color(result.scores.seo)}`,
    );
    console.log(
      chalk.gray(
        `  LCP ${result.metrics.lcp_seconds.toFixed(2)}s · FCP ${result.metrics.fcp_seconds.toFixed(2)}s · TBT ${result.metrics.tbt_seconds.toFixed(2)}s · CLS ${result.metrics.cls.toFixed(3)}`,
      ),
    );
    console.log(chalk.gray(`  report: ${result.reportHtmlPath}`));
    if (opts.open !== false) {
      exec(`open "${result.reportHtmlPath}"`, () => {});
    }
  }
}

function color(score: number): string {
  if (score >= 90) return chalk.green(String(score));
  if (score >= 50) return chalk.yellow(String(score));
  return chalk.red(String(score));
}

main().catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.stack : String(err)));
  process.exit(1);
});
