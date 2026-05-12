import type postgres from "postgres";

export interface WorkerStatRow {
  ts: Date;
  active_total: number;
  active_hc: number;
  active_lh: number;
  max_workers: number;
  queue_depth: number;
  utilization_pct: number;
}

export interface WorkerStatPoint {
  ts: Date;
  util_pct: number;
  queue_depth: number;
  active_lh: number;
  active_hc: number;
  max_workers: number;
}

export async function insertWorkerStat(
  sql: postgres.Sql,
  row: Omit<WorkerStatRow, "ts">,
): Promise<void> {
  await sql`
    INSERT INTO worker_stats (active_total, active_hc, active_lh, max_workers, queue_depth, utilization_pct)
    VALUES (${row.active_total}, ${row.active_hc}, ${row.active_lh}, ${row.max_workers}, ${row.queue_depth}, ${row.utilization_pct})
  `;
}

function bucketInterval(startMs: number, endMs: number): string {
  const rangeMs = endMs - startMs;
  if (rangeMs <= 6 * 3_600_000) return "5 minutes";
  if (rangeMs <= 48 * 3_600_000) return "10 minutes";
  if (rangeMs <= 7 * 86_400_000) return "1 hour";
  return "6 hours";
}

export async function getWorkerStats(
  sql: postgres.Sql,
  startMs: number,
  endMs: number,
): Promise<WorkerStatPoint[]> {
  const interval = bucketInterval(startMs, endMs);
  const rows = await sql<WorkerStatPoint[]>`
    SELECT
      time_bucket(${interval}::interval, ts)   AS ts,
      AVG(utilization_pct)::float              AS util_pct,
      AVG(queue_depth)::float                  AS queue_depth,
      AVG(active_lh)::float                    AS active_lh,
      AVG(active_hc)::float                    AS active_hc,
      MAX(max_workers)                         AS max_workers
    FROM worker_stats
    WHERE ts BETWEEN ${new Date(startMs)} AND ${new Date(endMs)}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  return rows;
}
