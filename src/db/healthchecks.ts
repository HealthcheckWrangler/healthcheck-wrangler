import type postgres from "postgres";
import type { DetailedHealthcheckResult } from "../runner/healthcheck.js";

export interface StoredHealthcheck {
  ts: Date;
  site: string;
  page: string;
  up: boolean;
  duration: number;
  http: number;
  sel_total: number;
  sel_failed: number;
  selectors: unknown;
}

export async function insertHealthcheck(
  sql: postgres.Sql,
  result: DetailedHealthcheckResult,
): Promise<void> {
  const ts = new Date();
  const sel = JSON.stringify(result.selectors ?? []);

  await sql`
    INSERT INTO healthchecks (ts, site, page, up, duration, http, sel_total, sel_failed, selectors)
    VALUES (${ts}, ${result.site}, ${result.page}, ${result.up},
            ${result.durationSeconds}, ${result.httpStatus},
            ${result.selectorsTotal}, ${result.selectorsFailed}, ${sel})
  `;

  await sql`
    INSERT INTO healthchecks_latest (site, page, ts, up, duration, http, sel_total, sel_failed, selectors)
    VALUES (${result.site}, ${result.page}, ${ts}, ${result.up},
            ${result.durationSeconds}, ${result.httpStatus},
            ${result.selectorsTotal}, ${result.selectorsFailed}, ${sel})
    ON CONFLICT (site, page) DO UPDATE SET
      ts         = EXCLUDED.ts,
      up         = EXCLUDED.up,
      duration   = EXCLUDED.duration,
      http       = EXCLUDED.http,
      sel_total  = EXCLUDED.sel_total,
      sel_failed = EXCLUDED.sel_failed,
      selectors  = EXCLUDED.selectors
  `;
}

export async function getLatestHealthcheck(
  sql: postgres.Sql,
  site: string,
  page: string,
): Promise<StoredHealthcheck | null> {
  const rows = await sql<StoredHealthcheck[]>`
    SELECT ts, site, page, up, duration, http, sel_total, sel_failed, selectors
    FROM healthchecks_latest
    WHERE site = ${site} AND page = ${page}
  `;
  return rows[0] ?? null;
}

export async function getAllLatestForSite(
  sql: postgres.Sql,
  site: string,
  pages: string[],
): Promise<Record<string, StoredHealthcheck | null>> {
  const result: Record<string, StoredHealthcheck | null> = {};
  for (const page of pages) result[page] = null;

  if (pages.length === 0) return result;

  const rows = await sql<StoredHealthcheck[]>`
    SELECT ts, site, page, up, duration, http, sel_total, sel_failed, selectors
    FROM healthchecks_latest
    WHERE site = ${site} AND page = ANY(${sql.array(pages)})
  `;
  for (const row of rows) result[row.page] = row;
  return result;
}

export async function getHealthcheckHistory(
  sql: postgres.Sql,
  site: string,
  page: string,
  limit = 20,
): Promise<StoredHealthcheck[]> {
  return sql<StoredHealthcheck[]>`
    SELECT ts, site, page, up, duration, http, sel_total, sel_failed, selectors
    FROM healthchecks
    WHERE site = ${site} AND page = ${page}
    ORDER BY ts DESC
    LIMIT ${limit}
  `;
}

export async function getAllHealthcheckHistoryForSite(
  sql: postgres.Sql,
  site: string,
  limit = 20,
): Promise<StoredHealthcheck[]> {
  return sql<StoredHealthcheck[]>`
    SELECT ts, site, page, up, duration, http, sel_total, sel_failed, selectors
    FROM healthchecks
    WHERE site = ${site}
    ORDER BY ts DESC
    LIMIT ${limit}
  `;
}

export interface TimelinePoint {
  bucket: Date;
  up: boolean;
  avg_duration: number;
  checks_up: number;
  checks_total: number;
}

export interface TimelineSeries {
  name: string;
  points: TimelinePoint[];
}

export interface KpiTrendPoint {
  bucket: Date;
  checks_up: number;
  checks_total: number;
  avg_duration: number;
}

function bucketInterval(startMs: number, endMs: number): string {
  const rangeMs = endMs - startMs;
  if (rangeMs <= 6 * 3_600_000) return "5 minutes";
  if (rangeMs <= 48 * 3_600_000) return "10 minutes";
  if (rangeMs <= 7 * 86_400_000) return "1 hour";
  return "6 hours";
}

export async function getFleetStatusTimeline(
  sql: postgres.Sql,
  startMs: number,
  endMs: number,
): Promise<TimelineSeries[]> {
  const interval = bucketInterval(startMs, endMs);
  const rows = await sql<(TimelinePoint & { site: string })[]>`
    SELECT
      site,
      time_bucket(${interval}::interval, ts)    AS bucket,
      BOOL_AND(up)                               AS up,
      AVG(duration)::float                       AS avg_duration,
      COUNT(*) FILTER (WHERE up)                 AS checks_up,
      COUNT(*)                                   AS checks_total
    FROM healthchecks
    WHERE ts BETWEEN ${new Date(startMs)} AND ${new Date(endMs)}
    GROUP BY site, bucket
    ORDER BY site, bucket
  `;

  const map = new Map<string, TimelinePoint[]>();
  for (const row of rows) {
    const arr = map.get(row.site) ?? [];
    arr.push({ bucket: row.bucket, up: row.up, avg_duration: Number(row.avg_duration), checks_up: Number(row.checks_up), checks_total: Number(row.checks_total) });
    map.set(row.site, arr);
  }
  return [...map.entries()].map(([name, points]) => ({ name, points }));
}

export async function getSitePageTimeline(
  sql: postgres.Sql,
  site: string,
  startMs: number,
  endMs: number,
): Promise<TimelineSeries[]> {
  const interval = bucketInterval(startMs, endMs);
  const rows = await sql<(TimelinePoint & { page: string })[]>`
    SELECT
      page,
      time_bucket(${interval}::interval, ts)    AS bucket,
      BOOL_AND(up)                               AS up,
      AVG(duration)::float                       AS avg_duration,
      COUNT(*) FILTER (WHERE up)                 AS checks_up,
      COUNT(*)                                   AS checks_total
    FROM healthchecks
    WHERE site = ${site}
      AND ts BETWEEN ${new Date(startMs)} AND ${new Date(endMs)}
    GROUP BY page, bucket
    ORDER BY page, bucket
  `;

  const map = new Map<string, TimelinePoint[]>();
  for (const row of rows) {
    const arr = map.get(row.page) ?? [];
    arr.push({ bucket: row.bucket, up: row.up, avg_duration: Number(row.avg_duration), checks_up: Number(row.checks_up), checks_total: Number(row.checks_total) });
    map.set(row.page, arr);
  }
  return [...map.entries()].map(([name, points]) => ({ name, points }));
}

export async function getSiteKpiTrend(
  sql: postgres.Sql,
  site: string,
  startMs: number,
  endMs: number,
): Promise<KpiTrendPoint[]> {
  const interval = bucketInterval(startMs, endMs);
  const rows = await sql<KpiTrendPoint[]>`
    SELECT
      time_bucket(${interval}::interval, ts) AS bucket,
      COUNT(*) FILTER (WHERE up)             AS checks_up,
      COUNT(*)                               AS checks_total,
      AVG(duration)::float                   AS avg_duration
    FROM healthchecks
    WHERE site = ${site}
      AND ts BETWEEN ${new Date(startMs)} AND ${new Date(endMs)}
    GROUP BY bucket
    ORDER BY bucket
  `;
  return rows.map((r) => ({
    bucket: r.bucket,
    checks_up: Number(r.checks_up),
    checks_total: Number(r.checks_total),
    avg_duration: Number(r.avg_duration),
  }));
}
