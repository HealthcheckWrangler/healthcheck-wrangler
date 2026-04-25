import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { input, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { loadRuntimeConfig } from "../runtime-config.js";

interface Opts {
  sitesDir?: string;
  force?: boolean;
}

async function action(nameArg: string | undefined, baseUrlArg: string | undefined, opts: Opts): Promise<void> {
  const config = loadRuntimeConfig();
  const sitesDir = resolve(opts.sitesDir ?? config.runner.sitesDir);

  const name = nameArg ?? await input({
    message: "Site name (kebab-case, e.g. dr-garcia):",
    validate: (v) => /^[a-z0-9][a-z0-9_-]*$/.test(v) || "Must be lowercase kebab/snake-case",
  });

  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
    console.error(chalk.red(`site name must be lowercase kebab/snake-case (got "${name}")`));
    process.exit(1);
  }

  const baseUrl = baseUrlArg ?? await input({
    message: "Base URL (e.g. https://drgarcia.com):",
    validate: (v) => { try { new URL(v); return true; } catch { return "Must be a valid URL"; } },
  });

  try { new URL(baseUrl); } catch {
    console.error(chalk.red(`baseUrl is not a valid URL: "${baseUrl}"`));
    process.exit(1);
  }

  const target = resolve(sitesDir, `${name}.yaml`);

  if (existsSync(target) && !opts.force) {
    const overwrite = await confirm({ message: `${target} already exists. Overwrite?`, default: false });
    if (!overwrite) process.exit(0);
  }

  const template = `name: ${name}
baseUrl: ${baseUrl}
alerting: true
healthcheck:
  enabled: false
  intervalMinutes: 10
  timeoutSeconds: 30
lighthouse:
  enabled: false
  intervalMinutes: 360
  throttling: mobile
pages:
  - path: /
    name: Home
    selectors:
      # TODO: replace with real selectors — see docs for guidance
      - "header"
      - "main"
      - "footer"
`;

  writeFileSync(target, template, "utf8");
  console.log(chalk.green(`✓ wrote ${target}`));
  console.log();
  console.log("Next steps:");
  console.log(`  1. Edit ${chalk.cyan(`sites/${name}.yaml`)} — add pages and selectors`);
  console.log(`  2. Validate:   ${chalk.cyan(`hcw check --site ${name} --headed`)}`);
  console.log(`  3. Dry-run LH: ${chalk.cyan(`hcw lighthouse --site ${name}`)}`);
  console.log(`  4. Commit the YAML — the running daemon hot-reloads it automatically.`);
}

export const addSiteCommand = new Command("add-site")
  .description("Scaffold a new site YAML under the sites directory")
  .argument("[name]", "site name (kebab-case) — prompted if omitted")
  .argument("[baseUrl]", "base URL — prompted if omitted")
  .option("--force", "overwrite an existing file without prompting")
  .option("--sites-dir <path>", "override sites directory")
  .action(action);
