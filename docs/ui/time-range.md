# Time Range

The time range picker in the top bar controls the window of historical data shown across all charts and timelines in the dashboard.

## Global presets

Available on the Overview page, Site Dashboard, and Logs history mode:

| Preset | Window |
| :--- | :--- |
| `1h` | Last 1 hour |
| `6h` | Last 6 hours |
| `24h` | Last 24 hours (default) |
| `7d` | Last 7 days |
| `30d` | Last 30 days |

A **Custom** button opens a date/time range picker for arbitrary windows.

## Workers page presets

The Workers page uses a separate, shorter set of presets and does not show the custom picker:

| Preset | Window |
| :--- | :--- |
| `1h` | Last 1 hour |
| `6h` | Last 6 hours |
| `24h` | Last 24 hours |
| `3d` | Last 3 days (maximum) |

Worker stats are sampled at 1 row/minute and retained for 3 days by default — longer ranges offer no additional insight.

## How it affects the UI

Changing the time range triggers a refetch for:

- Fleet status timeline (Overview)
- Site timeline (Site Dashboard)
- KPI trend charts (Site Dashboard)
- Lighthouse history charts (Site Dashboard)
- Worker utilization and saturation charts (Workers)
- Log history queries (Logs, history mode)

The range is **global state** — all pages share the same selected window. Switching pages preserves the current selection.

## Data retention vs range

Selecting a range longer than your configured retention will not cause errors — queries simply return whatever data exists. If you select `30d` but `resultsRetentionDays` is `14`, you'll see 14 days of data.
