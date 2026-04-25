#!/usr/bin/env node
import { Command } from "commander";
import { checkCommand } from "./check.js";
import { lighthouseCommand } from "./lighthouse.js";
import { addSiteCommand } from "./add-site.js";
import { scrapeNavCommand } from "./scrape-nav.js";

const program = new Command()
  .name("hcw")
  .description("HealthcheckWrangler — Playwright + Lighthouse site monitoring")
  .version("0.1.0");

program.addCommand(checkCommand);
program.addCommand(lighthouseCommand);
program.addCommand(addSiteCommand);
program.addCommand(scrapeNavCommand);

program.parse();
