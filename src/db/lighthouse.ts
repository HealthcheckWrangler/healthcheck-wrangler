import type postgres from "postgres";
import type { LighthouseResult } from "../metrics.js";

export interface StoredLighthouse {
  ts: Date;
  site: string;
  page: string;
  perf: number | null;
  a11y: number | null;
  best_practices: number | null;
  seo: number | null;
  lcp: number | null;
  fcp: number | null;
  tbt: number | null;
  cls: number | null;
  ttfb: number | null;
  speed_index: number | null;
  report_url: string | null;
}

export async function insertLighthouse(
  sql: postgres.Sql,
  result: LighthouseResult,
): Promise<void> {
  const ts = new Date();
  const vals = {
    ts,
    site: result.site,
    page: result.page,
    perf: result.scores.performance >= 0 ? result.scores.performance : null,
    a11y: result.scores.accessibility >= 0 ? result.scores.accessibility : null,
    best_practices: result.scores.best_practices >= 0 ? result.scores.best_practices : null,
    seo: result.scores.seo >= 0 ? result.scores.seo : null,
    lcp: result.metrics.lcp_seconds,
    fcp: result.metrics.fcp_seconds,
    tbt: result.metrics.tbt_seconds,
    cls: result.metrics.cls,
    ttfb: result.metrics.ttfb_seconds,
    speed_index: result.metrics.speed_index_seconds,
    report_url: result.reportUrl ?? null,
  };

  await sql`
    INSERT INTO lighthouse_results
      (ts, site, page, perf, a11y, best_practices, seo, lcp, fcp, tbt, cls, ttfb, speed_index, report_url)
    VALUES
      (${vals.ts}, ${vals.site}, ${vals.page}, ${vals.perf}, ${vals.a11y},
       ${vals.best_practices}, ${vals.seo}, ${vals.lcp}, ${vals.fcp},
       ${vals.tbt}, ${vals.cls}, ${vals.ttfb}, ${vals.speed_index}, ${vals.report_url})
  `;

  await sql`
    INSERT INTO lighthouse_latest
      (site, page, ts, perf, a11y, best_practices, seo, lcp, fcp, tbt, cls, ttfb, speed_index, report_url)
    VALUES
      (${vals.site}, ${vals.page}, ${vals.ts}, ${vals.perf}, ${vals.a11y},
       ${vals.best_practices}, ${vals.seo}, ${vals.lcp}, ${vals.fcp},
       ${vals.tbt}, ${vals.cls}, ${vals.ttfb}, ${vals.speed_index}, ${vals.report_url})
    ON CONFLICT (site, page) DO UPDATE SET
      ts             = EXCLUDED.ts,
      perf           = EXCLUDED.perf,
      a11y           = EXCLUDED.a11y,
      best_practices = EXCLUDED.best_practices,
      seo            = EXCLUDED.seo,
      lcp            = EXCLUDED.lcp,
      fcp            = EXCLUDED.fcp,
      tbt            = EXCLUDED.tbt,
      cls            = EXCLUDED.cls,
      ttfb           = EXCLUDED.ttfb,
      speed_index    = EXCLUDED.speed_index,
      report_url     = EXCLUDED.report_url
  `;
}

export async function getLatestLighthouse(
  sql: postgres.Sql,
  site: string,
  page: string,
): Promise<StoredLighthouse | null> {
  const rows = await sql<StoredLighthouse[]>`
    SELECT ts, site, page, perf, a11y, best_practices, seo,
           lcp, fcp, tbt, cls, ttfb, speed_index, report_url
    FROM lighthouse_latest
    WHERE site = ${site} AND page = ${page}
  `;
  return rows[0] ?? null;
}

export async function getLighthouseHistory(
  sql: postgres.Sql,
  site: string,
  limit = 5,
): Promise<StoredLighthouse[]> {
  return sql<StoredLighthouse[]>`
    SELECT ts, site, page, perf, a11y, best_practices, seo,
           lcp, fcp, tbt, cls, ttfb, speed_index, report_url
    FROM lighthouse_results
    WHERE site = ${site}
    ORDER BY ts DESC
    LIMIT ${limit}
  `;
}
