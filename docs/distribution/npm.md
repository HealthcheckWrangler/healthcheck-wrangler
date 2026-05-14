# npm Package

HCW is also published to npm as `@healthcheckwrangler/hcw`. The npm package provides CLI tooling for managing your monitoring instance.

```bash
npm install --save-dev @healthcheckwrangler/hcw
```

## CLI commands

| Command | Description |
| :--- | :--- |
| `hcw check` | Run healthchecks against one or all sites (dry run / CI validation) |
| `hcw add-site` | Interactive wizard to scaffold a new site YAML |
| `hcw scrape-nav` | Crawl a site's navigation to discover pages automatically |
| `hcw lighthouse` | Trigger a one-off Lighthouse audit |
| `hcw-dashboards-push` | Sync Grafana dashboard definitions to a Grafana instance |
| `hcw-alerting-push` | Sync alerting rules to a configured channel |

## Typical package.json setup

```json
{
  "scripts": {
    "check": "hcw check",
    "add-site": "hcw add-site",
    "scrape-nav": "hcw scrape-nav",
    "lighthouse": "hcw lighthouse"
  },
  "devDependencies": {
    "@healthcheckwrangler/hcw": "^4.0.0"
  }
}
```

## When to use npm vs Docker

| Use case | Recommended |
| :--- | :--- |
| Running the full stack (runner + dashboard + DB) | Docker image |
| Onboarding new sites interactively | npm package |
| Validating site configs in CI | npm package |
| Running Lighthouse audits on demand | npm package |
| Syncing Grafana dashboards | npm package |

::: tip
The npm package and Docker image are built from the same source and published together on each release. You can use them side by side — the CLI against the same `sites/` directory that the Docker runner reads.
:::
