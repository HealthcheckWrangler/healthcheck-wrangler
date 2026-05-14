# Deployment Workflow

## Recommended setup

The recommended pattern is to keep your HCW deployment in a separate repository from any customizations:

```
my-healthchecks/
├── docker-compose.yml   ← container orchestration
├── config.yaml          ← runtime config
├── .env                 ← secrets (DB_PASSWORD, tunnel token, etc.)
└── sites/               ← one YAML per monitored site
    ├── site-a.yaml
    └── site-b.yaml
```

This separation means you can pull a new version of the Docker image without touching your site configs or secrets.

## Upgrading

To pick up a new HCW release:

```bash
# Pull the latest image
docker compose pull

# Restart containers
docker compose up -d
```

::: tip Pause before restarting
If you want to avoid any risk of a healthcheck failing mid-flight during the restart, [pause the runner](/ui/pause-resume) first and wait for all workers to go idle before running `docker compose up -d`.
:::

## Runner restart behavior

The runner does **not** persist state across restarts:

| State | Behavior after restart |
| :--- | :--- |
| Paused/unpaused | Always starts **unpaused** |
| In-flight tasks | Lost — tasks reschedule normally |
| Site configs | Reloaded from YAML files |
| Database | Reconnects automatically |

## Building a local image

If you're running a local build (e.g. for development or custom changes):

```bash
# Build from source
docker build -t healthcheck-wrangler:local .

# Restart with the new image
docker compose up -d
```

The Dockerfile compiles both the backend TypeScript and the Vite UI in a single build step — no separate asset build is required.
