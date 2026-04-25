# HealthcheckWrangler

Playwright-based site monitoring with Lighthouse audits and Prometheus metrics. Checks that key page elements are visible, measures Core Web Vitals, and alerts via PagerDuty when things go wrong.

## How it works

The runner loads site configs from a `sites/` directory. For each site it:

1. **Healthcheck** — opens each page in a headless Chromium browser and verifies that configured CSS selectors are visible. Reports `healthcheck_up`, `healthcheck_duration_seconds`, and `healthcheck_selector_failures` metrics.
2. **Lighthouse audit** — runs a full Lighthouse audit on each page and reports `lighthouse_performance_score`, `lighthouse_lcp_seconds`, `lighthouse_fcp_seconds`, `lighthouse_tbt_seconds`, and `lighthouse_cls` metrics.

Metrics are exposed on `:9464/metrics` in Prometheus format.

---

## Deployment modes

### Grafana Cloud

Metrics are scraped by [Grafana Alloy](https://grafana.com/docs/alloy/) and shipped to Grafana Cloud via remote_write. Alerts are sent to PagerDuty.

```bash
docker compose -f docker-compose.cloud.yml up -d
```

Requires Grafana Cloud credentials in `.env` (see `.env.example`).

### Self-hosted

Prometheus scrapes the runner and Grafana visualizes the data — no external accounts needed.

```bash
docker compose -f docker-compose.self-hosted.yml up -d
```

Grafana is available at `http://localhost:3000` (admin / admin). Dashboards are provisioned automatically from the `dashboards/` directory.

---

## Quick start

```bash
# 1. Clone the repo
git clone https://github.com/healthcheckwrangler/healthcheck-wrangler
cd healthcheck-wrangler

# 2. Copy and edit config
cp config.yaml.example config.yaml
cp .env.example .env

# 3. Add your first site
npm install
npx hcw add-site

# 4. Validate selectors before enabling monitoring
npx hcw check --site <your-site>

# 5. Start the stack
docker compose -f docker-compose.self-hosted.yml up -d   # self-hosted
# or
docker compose -f docker-compose.cloud.yml up -d          # Grafana Cloud
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

### `hcw-dashboards-push`

Upload all JSON files in `./dashboards` to Grafana Cloud. Requires `GRAFANA_CLOUD_URL` and `GRAFANA_CLOUD_API_TOKEN` in `.env`.

### `hcw-alerting-push`

Push PagerDuty contact point, alert rules, and notification policy to Grafana Cloud. Requires `GRAFANA_CLOUD_URL`, `GRAFANA_CLOUD_API_TOKEN`, and `PAGERDUTY_INTEGRATION_KEY` in `.env`.

---

## Configuration reference

See [`config.yaml.example`](config.yaml.example) for all available options with inline documentation.

Key sections:

| Section | What it controls |
|---|---|
| `project.name` | Label used in metrics, alerts, and dashboards |
| `runner.workers` | Number of sites checked concurrently |
| `runner.metricsSink` | `prometheus` (expose `/metrics`) or `stdout` (log JSON) |
| `healthcheck` | Default intervals and timeouts for healthchecks |
| `lighthouse` | Default intervals, throttling, and viewport for Lighthouse |
| `alerting` | Thresholds and timing for Grafana / PagerDuty alerts |

---

## Adding dashboards

Place Grafana dashboard JSON exports in the `dashboards/` directory.

- **Self-hosted**: Grafana hot-reloads dashboards from this directory within 10 seconds. Dashboards are editable in the UI.
- **Grafana Cloud**: run `hcw-dashboards-push` to upload them via the API.

---

## Instance pattern

For production use, create a separate repository that mounts your `sites/` and `config.yaml` into the published Docker image:

```yaml
# docker-compose.yml in your instance repo
services:
  runner:
    image: ghcr.io/healthcheckwrangler/healthcheck-wrangler:latest
    volumes:
      - ./sites:/app/sites:ro
      - ./config.yaml:/app/config.yaml:ro
      - ./reports:/app/reports
    env_file: .env
    ports:
      - "9464:9464"
```

This keeps your site configs versioned separately from the engine, and lets you pull engine updates with `docker compose pull`.
