# Configuration

HCW has two layers of configuration: a single runtime `config.yaml` for global settings, and one YAML file per site in `sites/`.

## config.yaml

### `project`

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `name` | string | `"healthcheck-wrangler"` | Project identifier used in the browser user-agent string |

### `runner`

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `workers` | integer | `3` | Maximum concurrent healthcheck workers |
| `lighthouseWorkers` | integer | `1` | Maximum concurrent Lighthouse workers (separate pool) |
| `workerMonitoring` | boolean | `true` | Record worker utilization samples to the database every 60s |
| `pageDelayMs` | integer | `0` | Delay between page checks within a single site run |
| `sitesDir` | string | `"./sites"` | Directory containing site YAML configs |
| `reportsDir` | string | `"./reports"` | Directory for Lighthouse HTML/JSON report files |
| `logLevel` | string | `"info"` | Log verbosity (`trace`, `debug`, `info`, `warn`, `error`) |
| `schedulerTickMs` | integer | `1000` | Main scheduling loop interval in ms |
| `lighthouseStartDelayMs` | integer | `30000` | Delay before the first Lighthouse run after startup |
| `startupJitter` | enum | `"even"` | Startup scheduling strategy — see [Startup Jitter](/architecture/runner#startup-jitter) |
| `startupJitterCapMs` | integer | `120000` | Max jitter delay when `startupJitter` is `"capped"` |
| `apiPort` | integer | `8080` | Runner API port. Set to `0` to disable the API entirely |
| `logRetentionDays` | integer | `7` | How long structured log entries are kept in the database |
| `resultsRetentionDays` | integer | `180` | How long healthcheck and Lighthouse results are kept |
| `lighthouseReportRetentionDays` | integer | `7` | How long HTML/JSON report files are kept on disk |
| `workerStatsRetentionDays` | integer | `3` | How long worker utilization samples are kept |

### `healthcheck`

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `defaultIntervalMinutes` | integer | `10` | Default check interval for all sites |
| `defaultTimeoutSeconds` | integer | `30` | Page load timeout |
| `selectorTimeoutMs` | integer | `5000` | Time to wait for each selector to become visible |
| `forceCloseTimeoutMs` | integer | `5000` | Max time allowed to close the browser context |

### `lighthouse`

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `defaultIntervalMinutes` | integer | `360` | Default Lighthouse audit interval (6 hours) |
| `defaultThrottling` | enum | `"mobile"` | Network/device emulation profile (`"mobile"` or `"desktop"`) |
| `desktopWidth` | integer | `1350` | Viewport width when `throttling` is `"desktop"` |
| `desktopHeight` | integer | `940` | Viewport height when `throttling` is `"desktop"` |
| `forceCloseTimeoutMs` | integer | `5000` | Max time allowed to close the browser |

### `alerting`

See the [Alerting Configuration](/alerting/configuration) page for the full schema.

---

## Site YAML

Each file in `sites/` configures one site. The `name` field (kebab-case) is the primary key used in the database, URLs, and scheduler — renaming it orphans historical data.

```yaml
name: my-site          # kebab-case, primary key — do not rename casually
displayName: My Site   # optional — shown in the dashboard sidebar and cards
baseUrl: https://example.com

healthcheck:
  enabled: true
  intervalMinutes: 10    # overrides runner.healthcheck.defaultIntervalMinutes

lighthouse:
  enabled: true
  intervalMinutes: 360
  throttling: mobile     # "mobile" or "desktop"

alerting: true           # true = use defaults, false = disabled, or { add: [], remove: [] }

pages:
  - name: home
    path: /
    selectors:
      - nav
      - footer
      - h1.hero-title

  - name: about
    path: /about
    selectors:
      - h1
      - .team-section
```

::: warning Renaming sites
The `name` field is the primary key in all database tables. Renaming a site or page in YAML orphans its historical data under the old key. A manual SQL `UPDATE` across `healthchecks`, `healthchecks_latest`, `lighthouse_results`, and `lighthouse_latest` is required to preserve history.
:::

## Selectors

Selectors are standard CSS selectors evaluated with Playwright's `locator(selector).isVisible()`. A page is considered **down** if any selector fails visibility within `selectorTimeoutMs`.

Good selectors to monitor:
- Navigation: `nav`, `nav.site-nav`, `header`
- Footer: `footer`
- Key content: `h1`, `main`, `.hero-section`
- Login walls: `.logout-button` (confirms auth is working)

## Hot reload

The runner watches `sitesDir` for changes using chokidar. When a YAML file is added, changed, or removed:

1. The file is re-parsed and validated against the config schema
2. The scheduler is rebuilt — existing task `nextRun` times are preserved
3. Startup jitter is applied only to newly added tasks

::: tip
You can add, edit, or remove a site at any time without restarting the runner. Changes take effect within a second or two.
:::
