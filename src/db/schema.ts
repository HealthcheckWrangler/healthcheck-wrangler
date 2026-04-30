import type postgres from "postgres";

export async function initSchema(
  sql: postgres.Sql,
  retentionDays: { logs: number; results: number },
): Promise<void> {
  // healthchecks history
  await sql`
    CREATE TABLE IF NOT EXISTS healthchecks (
      id         BIGSERIAL,
      ts         TIMESTAMPTZ NOT NULL,
      site       TEXT        NOT NULL,
      page       TEXT        NOT NULL,
      up         BOOLEAN     NOT NULL,
      duration   DOUBLE PRECISION NOT NULL,
      http       INTEGER     NOT NULL,
      sel_total  INTEGER     NOT NULL,
      sel_failed INTEGER     NOT NULL,
      selectors  JSONB
    )
  `;
  await sql`SELECT create_hypertable('healthchecks', by_range('ts'), if_not_exists => TRUE)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hc_site_page_ts ON healthchecks(site, page, ts DESC)`;

  // healthchecks current state
  await sql`
    CREATE TABLE IF NOT EXISTS healthchecks_latest (
      site       TEXT        NOT NULL,
      page       TEXT        NOT NULL,
      ts         TIMESTAMPTZ NOT NULL,
      up         BOOLEAN     NOT NULL,
      duration   DOUBLE PRECISION NOT NULL,
      http       INTEGER     NOT NULL,
      sel_total  INTEGER     NOT NULL,
      sel_failed INTEGER     NOT NULL,
      selectors  JSONB,
      PRIMARY KEY (site, page)
    )
  `;

  // lighthouse history
  await sql`
    CREATE TABLE IF NOT EXISTS lighthouse_results (
      id             BIGSERIAL,
      ts             TIMESTAMPTZ NOT NULL,
      site           TEXT        NOT NULL,
      page           TEXT        NOT NULL,
      perf           INTEGER,
      a11y           INTEGER,
      best_practices INTEGER,
      seo            INTEGER,
      lcp            DOUBLE PRECISION,
      fcp            DOUBLE PRECISION,
      tbt            DOUBLE PRECISION,
      cls            DOUBLE PRECISION,
      ttfb           DOUBLE PRECISION,
      speed_index    DOUBLE PRECISION,
      report_url     TEXT
    )
  `;
  await sql`SELECT create_hypertable('lighthouse_results', by_range('ts'), if_not_exists => TRUE)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lh_site_page_ts ON lighthouse_results(site, page, ts DESC)`;

  // lighthouse current state
  await sql`
    CREATE TABLE IF NOT EXISTS lighthouse_latest (
      site           TEXT        NOT NULL,
      page           TEXT        NOT NULL,
      ts             TIMESTAMPTZ NOT NULL,
      perf           INTEGER,
      a11y           INTEGER,
      best_practices INTEGER,
      seo            INTEGER,
      lcp            DOUBLE PRECISION,
      fcp            DOUBLE PRECISION,
      tbt            DOUBLE PRECISION,
      cls            DOUBLE PRECISION,
      ttfb           DOUBLE PRECISION,
      speed_index    DOUBLE PRECISION,
      report_url     TEXT,
      PRIMARY KEY (site, page)
    )
  `;

  // logs
  await sql`
    CREATE TABLE IF NOT EXISTS logs (
      id    BIGSERIAL,
      ts    TIMESTAMPTZ NOT NULL,
      level TEXT        NOT NULL,
      site  TEXT,
      page  TEXT,
      msg   TEXT        NOT NULL DEFAULT '',
      data  JSONB       NOT NULL DEFAULT '{}'
    )
  `;
  await sql`SELECT create_hypertable('logs', by_range('ts'), if_not_exists => TRUE)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_ts       ON logs(ts DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_site_ts  ON logs(site, ts DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_fts      ON logs USING gin(to_tsvector('english', msg))`;

  // Retention policies — only add if not already present
  await applyRetention(sql, "healthchecks",      retentionDays.results);
  await applyRetention(sql, "lighthouse_results", retentionDays.results);
  await applyRetention(sql, "logs",               retentionDays.logs);
}

async function applyRetention(sql: postgres.Sql, table: string, days: number): Promise<void> {
  const existing = await sql`
    SELECT 1 FROM timescaledb_information.jobs
    WHERE hypertable_name = ${table}
      AND proc_name = 'policy_retention'
    LIMIT 1
  `;
  if (existing.length === 0) {
    await sql`
      SELECT add_retention_policy(${table}, INTERVAL '1 day' * ${days}, if_not_exists => TRUE)
    `;
  }
}
