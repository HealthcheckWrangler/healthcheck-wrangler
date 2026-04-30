# HealthcheckWrangler

Playwright-based site monitoring with Lighthouse audits, a built-in status dashboard, and persistent storage via TimescaleDB. Checks that key page elements are visible, measures Core Web Vitals, and stores everything in a queryable database with a real-time web UI.

## How it works

The runner loads site configs from a `sites/` directory. For each site it:

1. **Healthcheck** — opens each page in headless Chromium and verifies that configured CSS selectors are visible. Results are stored in TimescaleDB and surfaced in the dashboard.
2. **Lighthouse audit** — runs a full Lighthouse audit on each page and records performance, accessibility, best practices, SEO scores, and all Core Web Vitals.

A built-in React dashboard (`:3001`) shows real-time status, fleet timelines, per-site availability history, Lighthouse scores, and a structured log viewer. TimescaleDB stores 6 months of check results and 7 days of logs by default.

---

## Default stack

```bash
docker compose up -d
```

Starts three services:
- **TimescaleDB** — persistent storage (internal only, not exposed to host)
- **runner** — Playwright checks + Lighthouse audits + API server on `:8080`
- **dashboard** — React UI on `:3001`, proxies to runner API

Open `http://localhost:3001` to see the dashboard.

## Opt-in: Prometheus metrics

If you want to forward metrics to Grafana Cloud or a self-hosted Prometheus stack, set `metricsSink: prometheus` in `config.yaml` and add the appropriate profile:

```bash
# Self-hosted Prometheus + Grafana
docker compose --profile self-hosted up -d

# Grafana Cloud via Alloy
docker compose --profile grafana-cloud up -d
```

---

## Quick start

```bash
# 1. Clone the repo
git clone https://github.com/healthcheckwrangler/healthcheck-wrangler
cd healthcheck-wrangler

# 2. Copy and edit config
cp config.yaml.example config.yaml
cp .env.example .env
# Set DB_PASSWORD in .env

# 3. Add your first site
npm install
npx hcw add-site

# 4. Validate selectors before enabling monitoring
npx hcw check --site <your-site>

# 5. Start the stack
docker compose up -d
```

---

## Site configuration

Each site is a YAML file in `sites/`. See [`sites/example.yaml`](sites/example.yaml) for a fully annotated example.

```yaml
name: my-site
baseUrl: https://example.com
alerting: true

healthcheck:
  enabled: true
  intervalMinutes: 10

lighthouse:
  enabled: true
  intervalMinutes: 360
  throttling: mobile

pages:
  - path: /
    name: Home
    selectors:
      - "nav"
      - "main"
      - "footer"
```

The runner hot-reloads site configs — no restart needed when you add or edit a YAML file.

---

## CLI reference

Install the CLI locally:

```bash
npm install @healthcheckwrangler/hcw
```

Or run directly in a project directory with `npx hcw <command>`.

### `hcw check`

Dry-run healthchecks and print pass/fail for every selector.

```
hcw check [options]

Options:
  -s, --site <name>   site to check — skips interactive picker
  -p, --page <path>   only check this page path (e.g. /)
  --all               check all sites without prompting
  --headed            open a visible browser window
  --sites-dir <path>  override sites directory
```

### `hcw lighthouse`

Run a Lighthouse audit and open the HTML report.

```
hcw lighthouse [options]

Options:
  -s, --site <name>     site to audit — skips interactive picker
  -p, --page <path>     page path to audit — skips interactive picker
  --no-open             do not open the HTML report after running
  --sites-dir <path>    override sites directory
  --reports-dir <path>  override reports directory
```

### `hcw add-site`

Scaffold a new site YAML under the sites directory.

```
hcw add-site [name] [baseUrl] [options]

Options:
  --force              overwrite an existing file without prompting
  --sites-dir <path>   override sites directory
```

### `hcw scrape-nav`

Scrape all same-origin navigation links from a CSS selector and output as JSON. Useful for discovering pages to monitor.

```
hcw scrape-nav [baseUrl] [navSelector] [options]

Options:
  --timeout <ms>   navigation timeout in milliseconds (default: 30000)
```

---

## Configuration reference

See [`config.yaml.example`](config.yaml.example) for all options with inline documentation.

| Section | What it controls |
|---|---|
| `project.name` | Label used in metrics and dashboards |
| `runner.workers` | Number of sites checked concurrently |
| `runner.metricsSink` | `none` (default), `prometheus` (expose `/metrics`), or `stdout` |
| `runner.apiPort` | Dashboard API port (default `8080`, set to `0` to disable) |
| `runner.logRetentionDays` | How long logs are kept in TimescaleDB (default `7`) |
| `runner.resultsRetentionDays` | How long check results are kept (default `180`) |
| `runner.lighthouseReportRetentionDays` | How long HTML/JSON report files are kept on disk (default `7`) |
| `healthcheck` | Default intervals and timeouts for healthchecks |
| `lighthouse` | Default intervals, throttling, and viewport for Lighthouse |

Database connection is read from the `DATABASE_URL` environment variable. If not set, the runner operates without persistence (in-memory only, no dashboard data).

---

## Alerting

Built-in channel-based alerting fires on state transitions only — once when a site goes down, once when it recovers. No repeated notifications while a site stays down.

Configure channels in `config.yaml`:

```yaml
alerting:
  channels:
    - type: google-chat
      name: Ops
      webhookUrl: "https://chat.googleapis.com/v1/spaces/..."
      on:
        - site-down
        - site-recovery
        - high-memory      # host RAM > 85%
        - memory-recovered
        - high-load        # load avg > 90% of CPU core count
        - load-recovered
```

Multiple channels are supported. Each subscribes to its own `on` event list. Per-site opt-out: set `alerting: false` in the site YAML.

Resource metrics (RAM, CPU load) are sampled every 60 seconds by the runner regardless of dashboard usage.

---

## Instance pattern

For production use, create a separate repository that mounts your `sites/` and `config.yaml` into the published Docker image:

```yaml
# docker-compose.yml in your instance repo
services:
  timescaledb:
    image: timescale/timescaledb:latest-pg17
    environment:
      POSTGRES_DB: hcw
      POSTGRES_USER: hcw
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - timescaledb-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hcw"]
      interval: 10s
      retries: 5

  runner:
    image: ghcr.io/healthcheckwrangler/healthcheck-wrangler:latest
    environment:
      DATABASE_URL: postgresql://hcw:${DB_PASSWORD}@timescaledb:5432/hcw
    volumes:
      - ./sites:/app/sites:ro
      - ./reports:/app/reports
      - ./config.yaml:/app/config.yaml:ro
    depends_on:
      timescaledb:
        condition: service_healthy

  dashboard:
    image: ghcr.io/healthcheckwrangler/healthcheck-wrangler:latest
    command: ["node", "--enable-source-maps", "dist/src/dashboard/server.js"]
    environment:
      RUNNER_API_URL: http://runner:8080
      DASHBOARD_PORT: "3001"
    ports:
      - "3001:3001"
    depends_on:
      - runner

volumes:
  timescaledb-data:
```

This keeps your site configs versioned separately from the engine. Pull engine updates with:

```bash
docker compose pull && docker compose up -d
```
