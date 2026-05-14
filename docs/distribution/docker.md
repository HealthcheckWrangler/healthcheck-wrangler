# Docker Image

HCW is published as a multi-arch Docker image to the GitHub Container Registry on every release.

```
ghcr.io/healthcheckwrangler/healthcheck-wrangler:latest
ghcr.io/healthcheckwrangler/healthcheck-wrangler:4.0.0
ghcr.io/healthcheckwrangler/healthcheck-wrangler:4.0
```

## Architectures

| Platform | Support |
| :--- | :--- |
| `linux/amd64` | ✅ |
| `linux/arm64` | ✅ (Apple Silicon, AWS Graviton, Raspberry Pi 4/5) |

## What's in the image

The image is based on `mcr.microsoft.com/playwright` which includes Chromium, its dependencies, and all required system libraries. On top of that:

- HCW backend compiled TypeScript (`dist/src/`)
- HCW dashboard pre-built Vite SPA (`src/dashboard/ui/dist/`)
- Runtime dependencies only (dev dependencies pruned)

The image is self-contained — no Chromium or browser downloads happen at runtime.

## Running the runner

```bash
docker run -d \
  --name hcw-runner \
  -e DATABASE_URL=postgresql://hcw:password@db:5432/hcw \
  -v ./sites:/app/sites:ro \
  -v ./reports:/app/reports \
  -v ./config.yaml:/app/config.yaml:ro \
  --shm-size=1gb \
  ghcr.io/healthcheckwrangler/healthcheck-wrangler:latest
```

::: info shm_size
Playwright/Chromium uses `/dev/shm` for shared memory. Set `shm_size` to at least `1gb` to avoid browser crashes under load.
:::

## Running the dashboard

The same image runs the dashboard server via a different entrypoint:

```bash
docker run -d \
  --name hcw-dashboard \
  -e RUNNER_API_URL=http://hcw-runner:8080 \
  -e DASHBOARD_PORT=3001 \
  -p 3001:3001 \
  ghcr.io/healthcheckwrangler/healthcheck-wrangler:latest \
  node --enable-source-maps dist/src/dashboard/server.js
```

## Environment variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | — | PostgreSQL connection string (required for persistence) |
| `RUNNER_API_URL` | `http://localhost:8080` | Dashboard: where to proxy API calls (points to runner) |
| `DASHBOARD_PORT` | `3001` | Dashboard: port to listen on |
| `HCW_CONFIG_PATH` | `./config.yaml` | Path to runtime config file |
| `NODE_ENV` | `production` | Node environment |

## Release cadence

Images are published automatically by GitHub Actions on every `v*` git tag. The `latest` tag always points to the most recent release.
