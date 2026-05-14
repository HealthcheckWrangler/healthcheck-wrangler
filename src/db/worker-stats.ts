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

export interface WorkerStatsSummary {
  peakActive: number;
  queueEvents: number;
  sampleCount: number;
}

export async function getWorkerStatsSummary(
  sql: postgres.Sql,
  startMs: number,
  endMs: number,
): Promise<WorkerStatsSummary> {
  const rows = await sql<{ peak_active: number; queue_events: number; sample_count: number }[]>`
    SELECT
      COALESCE(MAX(active_total), 0)          AS peak_active,
      COUNT(*) FILTER (WHERE queue_depth > 0) AS queue_events,
      COUNT(*)                                AS sample_count
    FROM worker_stats
    WHERE ts BETWEEN ${new Date(startMs)} AND ${new Date(endMs)}
  `;
  const row = rows[0];
  return {
    peakActive:  Number(row?.peak_active  ?? 0),
    queueEvents: Number(row?.queue_events ?? 0),
    sampleCount: Number(row?.sample_count ?? 0),
  };
}

export async function getWorkerStats(
  sql: postgres.Sql,
  startMs: number,
  endMs: number,
): Promise<WorkerStatPoint[]> {
  const rows = await sql<WorkerStatPoint[]>`
    SELECT
      ts,
      utilization_pct  AS util_pct,
      queue_depth,
      active_lh,
      active_hc,
      max_workers
    FROM worker_stats
    WHERE ts BETWEEN ${new Date(startMs)} AND ${new Date(endMs)}
    ORDER BY ts ASC
  `;
  return rows;
}
