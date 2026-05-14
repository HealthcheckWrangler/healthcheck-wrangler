# TimescaleDB

TimescaleDB is a PostgreSQL extension that adds time-series capabilities. From the application's perspective it is plain PostgreSQL — same driver, same SQL, same tooling.

## Why not plain PostgreSQL?

The key feature used here is **hypertables** and **retention policies**.

A hypertable transparently partitions a table into time-based **chunks** (e.g. one chunk per day). When a retention policy runs, it drops entire chunks rather than issuing a `DELETE WHERE ts < ...` against the full table. Dropping a chunk is equivalent to `DROP TABLE` — near-instant and causes no table bloat or `VACUUM` overhead.

Without TimescaleDB you would need a scheduled job running a slow, bloat-inducing delete. With it, expiry is automatic and efficient.

## Tables

| Table | Type | Description |
| :--- | :--- | :--- |
| `healthchecks` | Hypertable | Full healthcheck history |
| `healthchecks_latest` | Regular | Current state per site × page (fast reads for dashboard) |
| `lighthouse_results` | Hypertable | Full Lighthouse audit history |
| `lighthouse_latest` | Regular | Latest audit per site × page |
| `logs` | Hypertable | Structured log entries with full-text search index |
| `worker_stats` | Hypertable | Worker utilization samples (1 row/minute) |
| `annotations` | Regular | User-created event markers shown on timeline charts |

## Retention policies

Retention is configured in `config.yaml` and **upserted on every runner startup** — so changing a value and restarting takes effect immediately:

```yaml
runner:
  logRetentionDays: 7               # structured logs
  resultsRetentionDays: 180         # healthcheck + Lighthouse results
  lighthouseReportRetentionDays: 7  # report files on disk
  workerStatsRetentionDays: 3       # worker utilization samples
```

::: info How retention works
TimescaleDB runs a background job on a schedule. When it fires, it drops any data chunks whose time range falls entirely outside the retention window. The runner registers the policy at startup — the actual deletion happens asynchronously.
:::

::: warning Policy updates
The runner removes and re-registers retention policies on every startup. If you change a retention value, restart the runner for the new policy to take effect.
:::
