# What is HealthcheckWrangler?

HealthcheckWrangler (HCW) is a self-hosted site monitoring tool that uses a real browser to run periodic healthchecks and Lighthouse audits against your sites — then surfaces everything in a live dashboard.

## Why a real browser?

Most uptime monitors issue a plain HTTP request. HCW launches a full Chromium instance via [Playwright](https://playwright.dev) and evaluates CSS selectors on the rendered page. This catches failures that HTTP probes miss:

- JavaScript-rendered content that never appears in the initial HTML
- Broken navigation components whose DOM nodes are present but invisible
- Selector-level regressions — a CMS update silently moves a key element

::: info
A site can return `200 OK` and still be functionally broken. HCW treats the page as down if any monitored selector fails visibility.
:::

## What it does

| Feature | Description |
| :--- | :--- |
| **Healthchecks** | Navigates each page and evaluates CSS selectors at a configurable interval (default 10 min) |
| **Lighthouse audits** | Runs full Lighthouse reports on a schedule (default every 6 hours) — tracks performance, accessibility, best practices, and SEO |
| **Dashboard** | React SPA with fleet overview, per-site history, timeline, worker utilization, and capacity planning |
| **Alerting** | Fires on state transitions (site down, site recovery, resource thresholds) — not on every check |
| **Hot reload** | Add, edit, or remove site YAML files and the runner picks up changes immediately — no restart |
| **TimescaleDB** | Time-series storage with automatic data retention policies |

## How it's structured

HCW ships as two artifacts:

- **Docker image** — the full stack (runner + dashboard server + Playwright/Chromium) ready to run with Docker Compose
- **npm package** — CLI tools for managing site configs, triggering checks, and syncing Grafana dashboards

See [Distribution](/distribution/docker) for details on both.

## Requirements

- Docker + Docker Compose (for the full stack)
- A TimescaleDB instance — included in the provided `docker-compose.yml`
- `DATABASE_URL` environment variable pointing to TimescaleDB

::: tip
The runner works without a database — checks still run and results are still visible in the dashboard. Without a database there is no history, no Lighthouse data, and no alerting.
:::
