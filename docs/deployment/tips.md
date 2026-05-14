# Tips

## Accessing the database with a GUI

By default the `timescaledb` container only exposes port 5432 on the internal Docker network — it's not reachable from outside. If you want to connect a GUI client (TablePlus, DBeaver, DataGrip, etc.) from the same machine running Docker, add a port mapping:

```yaml
timescaledb:
  ports:
    - "5432:5432"
```

Then recreate just that container:

```bash
docker compose up -d timescaledb
```

Connect your client to `localhost:5432` (or the server's IP if running remotely) with:
- **Database:** `hcw`
- **User:** `hcw`
- **Password:** value of `DB_PASSWORD` in your `.env`

::: tip
TimescaleDB is fully compatible with any PostgreSQL client — no special driver or plugin needed. All standard SQL works, plus TimescaleDB-specific functions for querying hypertables.
:::

## Reducing log noise

The default log level is `info`. To quiet the runner:

```yaml
runner:
  logLevel: warn
```

## Disabling the dashboard API

Set `runner.apiPort: 0` to disable the HTTP API entirely. The runner will still run checks and write to the database, but the dashboard will not work.

## Disabling worker monitoring

Set `runner.workerMonitoring: false` to stop recording worker utilization samples. This is useful if you want to reduce database writes on a low-resource host.

## Running without a database

The runner works without a `DATABASE_URL` — checks still run but:
- No history is stored
- No Lighthouse data
- No alerting
- No dashboard (the API requires a database)
- Logs are written to stdout only
