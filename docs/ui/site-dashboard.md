# Site Dashboard

The Site Dashboard (`/sites/:name`) gives a detailed view of a single site. It is split into five tabs.

## Header

The header appears above all tabs and contains:

- Site name, base URL, and current status badge
- Healthcheck and Lighthouse schedule info with next-run countdowns
- **Run now** buttons — trigger an immediate check without waiting for the next scheduled run
- **Annotations panel** — add timestamped notes that render as vertical markers on timeline charts

## Tabs

### Overview

- **KPI trend cards** — Pages up % and average response time, each with a sparkline showing the trend over the selected time range
- **Uptime stats** — 24h, 7d, and 30d uptime percentages with color thresholds (green ≥99%, amber ≥95%, red <95%)
- **Lighthouse scores** — Four score rings (Performance, Accessibility, Best Practices, SEO) showing the average of the latest audit per page, plus six Core Web Vitals

### Timeline

A per-page availability visualization. Each row represents one page; each column is a time bucket. Cells are green (up) or red (down).

Hovering a bucket shows:
- Timestamp range
- Up/down status for every page in the site
- Average response time for that bucket

Annotations appear as vertical dashed lines with diamond markers. Hovering them shows the annotation label.

### Lighthouse

Two charts for the selected time range and page:

| Chart | Y-axis | Series |
| :--- | :--- | :--- |
| Scores | 0–100 | Performance, Accessibility, Best Practices, SEO |
| Core Web Vitals | Seconds (left), CLS score (right) | LCP, FCP, TTFB (left); CLS (right, dashed) |

Reference lines mark good thresholds: Performance 90/50, LCP 2.5s, FCP 1.8s, TTFB 0.6s, CLS 0.1.

A page selector at the top lets you view individual page data or the average across all pages.

### Pages

A card for each page showing:
- Page name, path, and current status
- Each configured selector with its latest visibility state and any error message
- Last check time, duration, and HTTP status
- Latest Lighthouse scores and Core Web Vitals for that page

### Logs

The [Log Viewer](/ui/logs) filtered to this site only.

## Annotations

Annotations are timestamped notes you attach to a site. They appear as vertical markers on the Timeline and Lighthouse charts, making it easy to correlate incidents with deploys, config changes, or other events.

To add an annotation: open the **Notes** panel in the site header, enter a label and timestamp, and save. Annotations support editing and deletion.

## Data & polling

| Data | Source | Cadence |
| :--- | :--- | :--- |
| Site detail + results | `GET /api/sites/:name` | Every 5 seconds |
| Schedule | `GET /api/schedule` | Every 5 seconds |
| Uptime stats | `GET /api/sites/:name/uptime` | Once on mount |
| Timeline | `GET /api/sites/:name/timeline` | On time range change |
| KPI trend | `GET /api/sites/:name/kpi-trend` | On time range change |
| Lighthouse history | `GET /api/sites/:name/lighthouse-history` | On time range change |
| Annotations | `GET /api/annotations?site=:name` | On mount + after mutations |
