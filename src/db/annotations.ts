import type postgres from "postgres";

export interface StoredAnnotation {
  id: number;
  ts: Date;
  label: string;
  site: string | null;
  color: string;
}

export async function insertAnnotation(
  sql: postgres.Sql,
  data: { label: string; site?: string | null; ts?: Date; color?: string },
): Promise<StoredAnnotation> {
  const ts = data.ts ?? new Date();
  const color = data.color ?? "#6366f1";
  const rows = await sql<StoredAnnotation[]>`
    INSERT INTO annotations (ts, label, site, color)
    VALUES (${ts}, ${data.label}, ${data.site ?? null}, ${color})
    RETURNING id, ts, label, site, color
  `;
  return rows[0]!;
}

export async function updateAnnotation(
  sql: postgres.Sql,
  id: number,
  data: { label?: string; ts?: Date },
): Promise<StoredAnnotation | null> {
  const rows = await sql<StoredAnnotation[]>`
    UPDATE annotations
    SET
      label = COALESCE(${data.label ?? null}, label),
      ts    = COALESCE(${data.ts ?? null}, ts)
    WHERE id = ${id}
    RETURNING id, ts, label, site, color
  `;
  return rows[0] ?? null;
}

export async function deleteAnnotation(
  sql: postgres.Sql,
  id: number,
): Promise<void> {
  await sql`DELETE FROM annotations WHERE id = ${id}`;
}

export async function getAnnotations(
  sql: postgres.Sql,
  site?: string,
  startMs?: number,
  endMs?: number,
): Promise<StoredAnnotation[]> {
  if (site && startMs != null && endMs != null) {
    return sql<StoredAnnotation[]>`
      SELECT id, ts, label, site, color
      FROM annotations
      WHERE ts BETWEEN ${new Date(startMs)} AND ${new Date(endMs)}
        AND (site = ${site} OR site IS NULL)
      ORDER BY ts ASC
    `;
  }
  if (site) {
    return sql<StoredAnnotation[]>`
      SELECT id, ts, label, site, color
      FROM annotations
      WHERE site = ${site} OR site IS NULL
      ORDER BY ts ASC
    `;
  }
  if (startMs != null && endMs != null) {
    return sql<StoredAnnotation[]>`
      SELECT id, ts, label, site, color
      FROM annotations
      WHERE ts BETWEEN ${new Date(startMs)} AND ${new Date(endMs)}
      ORDER BY ts ASC
    `;
  }
  return sql<StoredAnnotation[]>`
    SELECT id, ts, label, site, color
    FROM annotations
    ORDER BY ts ASC
  `;
}
