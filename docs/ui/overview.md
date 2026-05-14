# Overview Page

The Overview page (`/`) is the fleet-level view. It shows the health of all monitored sites at a glance.

## What's on the page

### System resources card

A compact card showing current host resource usage: RAM used/total, CPU count, 1-minute load average, and process RSS. Updated every 30 seconds via `GET /api/system`.

### Fleet status timeline

A horizontal timeline showing the up/down status of all sites across the selected time range. Each bucket is one time slice — green indicates all sites up, red indicates at least one site down. Useful for spotting fleet-wide incidents.

### Site cards

One card per site, arranged in a responsive grid. Each card shows:

| Element | Description |
| :--- | :--- |
| Site name + URL | Links to the site's dashboard page |
| Pages down counter | Large colored number: green (0 down), red (>0 down), gray (no data) |
| Pages up / Avg response / Last run | Three quick-stats in a row |
| Lighthouse scores | Performance, Accessibility, Best Practices, SEO — if audit data exists |
| Schedule info | HC and LH intervals, next run countdowns, alerting status |

Cards for disabled sites are shown with reduced opacity.

## Data & polling

| Data | Source | Cadence |
| :--- | :--- | :--- |
| Site list + latest results | `GET /api/sites` | Every 5 seconds |
| Task schedule | `GET /api/schedule` | Every 5 seconds |
| System resources | `GET /api/system` | Every 30 seconds |
| Fleet timeline | `GET /api/fleet-status` | On time range change |
