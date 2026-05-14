# Quick Start

Get HCW running with Docker Compose in a few minutes.

## 1. Create a project directory

```bash
mkdir my-healthchecks && cd my-healthchecks
```

## 2. Add a docker-compose.yml

::: code-group

```yaml [docker-compose.yml]
services:
  timescaledb:
    image: timescale/timescaledb:latest-pg17
    restart: unless-stopped
    environment:
      POSTGRES_DB: hcw
      POSTGRES_USER: hcw
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - timescaledb-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hcw"]
      interval: 10s
      timeout: 5s
      retries: 5

  runner:
    image: ghcr.io/healthcheckwrangler/healthcheck-wrangler:latest
    restart: unless-stopped
    env_file: .env
    shm_size: '1gb'
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
    restart: unless-stopped
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

```bash [.env]
DB_PASSWORD=change-me
```

:::

## 3. Create a config.yaml

Download [`config.yaml.example`](https://github.com/HealthcheckWrangler/healthcheck-wrangler/blob/main/config.yaml.example) from the repo and save it as `config.yaml`. The defaults are sensible for most setups.

## 4. Add a site

Create a `sites/` directory and add your first site:

```yaml [sites/my-site.yaml]
name: my-site
baseUrl: https://example.com

healthcheck:
  enabled: true
  intervalMinutes: 10

pages:
  - name: home
    path: /
    selectors:
      - nav
      - footer

  - name: about
    path: /about
    selectors:
      - h1
```

::: tip Hot reload
Drop YAML files into `sites/` at any time — the runner picks them up within seconds. No restart needed.
:::

## 5. Start

```bash
docker compose up -d
```

The dashboard will be available on port 3001 of the host running the containers.

::: info First run
The runner starts immediately but staggers check timing across your sites to avoid a thundering herd. See [Startup Jitter](/architecture/runner#startup-jitter) for how this works.
:::
