import { resolve } from "node:path";
import { Command } from "commander";
import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { ConfigStore, type Page, type Site } from "../config.js";
import { runHealthcheck } from "../runner/healthcheck.js";
import { loadRuntimeConfig } from "../runtime-config.js";

interface Opts {
  site?: string;
  page?: string;
  all?: boolean;
  headed?: boolean;
  sitesDir?: string;
}

async function action(opts: Opts): Promise<void> {
  const config = loadRuntimeConfig();
  const sitesDir = resolve(opts.sitesDir ?? config.runner.sitesDir);
  const store = new ConfigStore(sitesDir, config);
  const sites = store.loadAll().filter((s) => s.name !== "example-site");

  if (sites.length === 0) {
    console.error(chalk.yellow(`No site configs found in ${sitesDir}`));
    process.exit(1);
  }

  let selected: Site[];

  if (opts.all) {
    selected = sites;
  } else if (opts.site) {
    selected = sites.filter((s) => s.name === opts.site);
    if (selected.length === 0) {
      console.error(chalk.red(`No site named "${opts.site}" found in ${sitesDir}`));
      process.exit(1);
    }
  } else {
    const answer = await select({
      message: "Which site do you want to check?",
      choices: [
        { name: chalk.dim("— All sites —"), value: "__all__" },
        ...sites.map((s) => ({ name: s.name, value: s.name })),
      ],
    });
    selected = answer === "__all__" ? sites : sites.filter((s) => s.name === answer);
  }

  for (const site of selected) {
    await runSite(site, opts, config.project.name);
  }
}

async function runSite(site: Site, opts: Opts, projectName: string): Promise<void> {
  const pages = opts.page ? site.pages.filter((p) => p.path === opts.page) : site.pages;
  if (pages.length === 0) {
    console.warn(chalk.yellow(`  no pages matched on site ${site.name}`));
    return;
  }
  console.log();
  console.log(chalk.bold.cyan(`▶ ${site.name}`), chalk.gray(site.baseUrl));
  for (const page of pages) {
    await runPage(site, page, opts.headed, projectName);
  }
}

async function runPage(site: Site, page: Page, headed: boolean | undefined, projectName: string): Promise<void> {
  process.stdout.write(`  ${chalk.bold(page.name)} ${chalk.gray(page.path)} ... `);
  const result = await runHealthcheck(site, page, { headed, projectName });
  const status = result.up ? chalk.green("PASS") : chalk.red("FAIL");
  console.log(
    status,
    chalk.gray(`http ${result.httpStatus} · ${result.durationSeconds.toFixed(2)}s · ${result.selectorsTotal - result.selectorsFailed}/${result.selectorsTotal} selectors`),
  );
  for (const s of result.selectors) {
    const mark = s.visible ? chalk.green("✓") : chalk.red("✗");
    const note = s.error ? chalk.gray(` (${s.error.split("\n")[0]})`) : "";
    console.log(`    ${mark} ${s.selector}${note}`);
  }
  if (result.error) console.log(chalk.red(`    error: ${result.error}`));
}

export const checkCommand = new Command("check")
  .description("Dry-run healthchecks and print pass/fail for every selector")
  .option("-s, --site <name>", "site to check — skips interactive picker")
  .option("-p, --page <path>", "only check this page path (e.g. /)")
  .option("--all", "check all sites without prompting")
  .option("--headed", "open a visible browser window")
  .option("--sites-dir <path>", "override sites directory")
  .action(action);
