# Worker Stats

The Workers page gives you a historical view of how the runner's worker pool has been utilized. It requires `runner.workerMonitoring: true` (default) and a database.

## How data is collected

Every **60 seconds**, the runner writes one row to the `worker_stats` table:

| Column | Description |
| :--- | :--- |
| `ts` | Sample timestamp |
| `active_total` | Total workers running a task at this instant |
| `active_hc` | Subset running a healthcheck |
| `active_lh` | Subset running a Lighthouse audit |
| `max_workers` | `runner.workers` at time of sample |
| `queue_depth` | Tasks waiting for a free worker slot |
| `utilization_pct` | `active_total / max_workers × 100` |

`max_workers` is stored **per row** so the charts remain accurate even if you change `runner.workers` over time.

## Retention

Worker stats use a shorter retention window than healthcheck results. The default is **3 days** — matching the maximum time range the Workers page allows:

```yaml
runner:
  workerStatsRetentionDays: 3
```

At 1 row/minute, 3 days = ~4,320 rows — trivial storage.

## Charts

### Worker Utilization

Stacked area chart showing `active_hc` (blue) and `active_lh` (amber) workers over time. The dashed reference line marks `max_workers`. Each point is a raw 1-minute sample — no averaging — so values are always whole numbers.

::: info Why no smoothing?
Workers are discrete integers. A smoothed curve between samples (e.g. 1.4 workers) is meaningless. The chart uses linear interpolation between points for visual clarity, but tooltip values are always rounded integers.
:::

### Worker Saturation

Stacked bar chart bucketed into 24 equal time slots across the selected range. Each bar shows how many minutes in that slot were:

| State | Color | Condition |
| :--- | :--- | :--- |
| **Idle** | Gray | `active_total = 0` |
| **Partial** | Blue | `0 < active_total < max_workers` |
| **At capacity** | Red | `active_total ≥ max_workers` |

The headline number above the chart — "X times at full capacity in the last N" — counts raw 1-minute samples where all workers were busy.

### Queue Depth

Area chart showing tasks waiting for a free worker. Any sustained non-zero queue depth is a signal that the worker pool may be too small. If no queuing is detected in the period, the chart is replaced with a green confirmation message.

## Time range

The Workers page uses its own preset set capped at **3 days**: `1h · 6h · 24h · 3d`. The custom date picker is hidden — worker stats data is short-lived and high-frequency; longer ranges don't add meaningful insight.
