#!/usr/bin/env tsx
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";

interface Options {
  sitesDir: string;
  force?: boolean;
}

const program = new Command();
program
  .name("add-site")
  .description("Scaffold a new site YAML under sites/")
  .argument("<name>", "site name (kebab-case, e.g. castillo)")
  .argument("<baseUrl>", "base URL (e.g. https://castillo.example.com)")
  .option("--sites-dir <path>", "override sites directory", resolve(process.env.SITES_DIR ?? "./sites"))
  .option("--force", "overwrite an existing file")
  .parse(process.argv);

const opts = program.opts<Options>();
const [name, baseUrl] = program.args as [string, string];

if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
  console.error(chalk.red(`site name must be lowercase kebab/snake-case (got "${name}")`));
  process.exit(1);
}
try {
  new URL(baseUrl);
} catch {
  console.error(chalk.red(`baseUrl is not a valid URL: "${baseUrl}"`));
  process.exit(1);
}

const target = resolve(opts.sitesDir, `${name}.yaml`);
if (existsSync(target) && !opts.force) {
  console.error(chalk.red(`${target} already exists (use --force to overwrite)`));
  process.exit(1);
}

const template = `name: ${name}
baseUrl: ${baseUrl}
alerting: true
healthcheck:
  enabled: true
  intervalMinutes: 10
  timeoutSeconds: 30
lighthouse:
  enabled: true
  intervalMinutes: 360
  throttling: mobile
pages:
  - path: /
    name: Home
    selectors:
      # TODO: replace these with real selectors that only render on a healthy page.
      # See docs/04-writing-selectors.md for guidance.
      - "header"
      - "main"
      - "footer"
`;

writeFileSync(target, template, "utf8");
console.log(chalk.green(`✓ wrote ${target}`));
console.log();
console.log("Next steps:");
console.log(`  1. Edit ${chalk.cyan(`sites/${name}.yaml`)} — add pages and selectors`);
console.log(`  2. Validate:   ${chalk.cyan(`npm run check -- --site ${name} --headed`)}`);
console.log(`  3. Dry-run LH: ${chalk.cyan(`npm run lighthouse -- --site ${name}`)}`);
console.log(`  4. Commit the YAML — the running daemon hot-reloads it automatically.`);
