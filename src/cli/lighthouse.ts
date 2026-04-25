import { resolve } from "node:path";
import { exec } from "node:child_process";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { ConfigStore, type Site } from "../config.js";
import { runLighthouse } from "../runner/lighthouse.js";
import { loadRuntimeConfig } from "../runtime-config.js";

interface Opts {
  site?: string;
  page?: string;
  open?: boolean;
  sitesDir?: string;
  reportsDir?: string;
}

async function action(opts: Opts): Promise<void> {
  const config = loadRuntimeConfig();
  const sitesDir = resolve(opts.sitesDir ?? config.runner.sitesDir);
  const reportsDir = resolve(opts.reportsDir ?? config.runner.reportsDir);
  const store = new ConfigStore(sitesDir, config);
  const sites = store.loadAll().filter((s) => s.name !== "example-site");

  if (sites.length === 0) {
    console.error(chalk.yellow(`No site configs found in ${sitesDir}`));
    process.exit(1);
  }

  let site: Site | undefined;

  if (opts.site) {
    site = sites.find((s) => s.name === opts.site);
    if (!site) {
      console.error(chalk.red(`No site named "${opts.site}" found in ${sitesDir}`));
      process.exit(1);
    }
  } else {
    const siteName = await select({
      message: "Which site do you want to audit?",
      choices: sites.map((s) => ({ name: s.name, value: s.name })),
    });
    site = sites.find((s) => s.name === siteName)!;
  }

  let pagePath = opts.page;
  if (!pagePath && site.pages.length > 1) {
    pagePath = await select({
      message: "Which page?",
      choices: [
        { name: chalk.dim("— All pages —"), value: "__all__" },
        ...site.pages.map((p) => ({ name: `${p.name} ${chalk.gray(p.path)}`, value: p.path })),
      ],
    });
  }

  const pages = pagePath && pagePath !== "__all__"
    ? site.pages.filter((p) => p.path === pagePath)
    : site.pages;

  if (pages.length === 0) {
    console.error(chalk.red(`No matching pages on site "${site.name}"`));
    process.exit(1);
  }

  for (const page of pages) {
    console.log();
    console.log(chalk.bold.cyan(`▶ ${site.name}${page.path}`));
    const result = await runLighthouse(site, page, reportsDir, {
      desktopWidth: config.lighthouse.desktopWidth,
      desktopHeight: config.lighthouse.desktopHeight,
      forceCloseTimeoutMs: config.lighthouse.forceCloseTimeoutMs,
    });
    if (!result) {
      console.log(chalk.red("  lighthouse failed — see logs"));
      continue;
    }
    console.log(
      `  perf ${color(result.scores.performance)} · a11y ${color(result.scores.accessibility)} · bp ${color(result.scores.best_practices)} · seo ${color(result.scores.seo)}`,
    );
    console.log(chalk.gray(
      `  LCP ${result.metrics.lcp_seconds.toFixed(2)}s · FCP ${result.metrics.fcp_seconds.toFixed(2)}s · TBT ${result.metrics.tbt_seconds.toFixed(2)}s · CLS ${result.metrics.cls.toFixed(3)}`,
    ));
    console.log(chalk.gray(`  report: ${result.reportHtmlPath}`));
    if (opts.open !== false) exec(`open "${result.reportHtmlPath}"`, () => {});
  }
}

function color(score: number): string {
  if (score >= 90) return chalk.green(String(score));
  if (score >= 50) return chalk.yellow(String(score));
  return chalk.red(String(score));
}

export const lighthouseCommand = new Command("lighthouse")
  .description("Run a Lighthouse audit, write HTML+JSON report, and optionally open it")
  .option("-s, --site <name>", "site to audit — skips interactive picker")
  .option("-p, --page <path>", "page path to audit — skips interactive picker")
  .option("--no-open", "do not open the HTML report after running")
  .option("--sites-dir <path>", "override sites directory")
  .option("--reports-dir <path>", "override reports directory")
  .action(action);
