import { Writable } from "node:stream";
import type postgres from "postgres";

export interface LogEntry {
  id: number;
  ts: Date;
  level: string;
  site?: string;
  page?: string;
  msg: string;
  data: unknown;
}

export interface LogQuery {
  startMs?: number;
  endMs?: number;
  level?: string;
  site?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const LEVEL_NAMES: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

type LogListener = (e: LogEntry) => void;
const listeners = new Set<LogListener>();

export function subscribe(fn: LogListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(entry: LogEntry): void {
  for (const fn of listeners) fn(entry);
}

export async function insertLog(sql: postgres.Sql, rawLine: string): Promise<void> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawLine.trim());
  } catch {
    return;
  }

  const levelNum = typeof parsed.level === "number" ? parsed.level : 30;
  const level = LEVEL_NAMES[levelNum] ?? String(parsed.level);
  const ts = typeof parsed.time === "number" ? new Date(parsed.time) : new Date();
  const site = typeof parsed.site === "string" ? parsed.site : null;
  const page = typeof parsed.page === "string" ? parsed.page : null;
  const msg = typeof parsed.msg === "string" ? parsed.msg : "";

  const inserted = await sql`
    INSERT INTO logs (ts, level, site, page, msg, data)
    VALUES (${ts}, ${level}, ${site}, ${page}, ${msg}, ${JSON.stringify(parsed)}::jsonb)
    RETURNING id
  `;

  const entry: LogEntry = {
    id: (inserted[0] as { id: number } | undefined)?.id ?? 0,
    ts,
    level,
    site: site ?? undefined,
    page: page ?? undefined,
    msg,
    data: parsed,
  };
  notify(entry);
}

export async function queryLogs(sql: postgres.Sql, params: LogQuery = {}): Promise<LogEntry[]> {
  const { startMs, endMs, level, site, search, limit = 200, offset = 0 } = params;

  const conditions: postgres.PendingQuery<postgres.Row[]>[] = [];

  if (startMs !== undefined) conditions.push(sql`ts >= ${new Date(startMs)}`);
  if (endMs !== undefined)   conditions.push(sql`ts <= ${new Date(endMs)}`);
  if (level)                 conditions.push(sql`level = ${level}`);
  if (site)                  conditions.push(sql`site = ${site}`);
  if (search)                conditions.push(sql`to_tsvector('english', msg) @@ plainto_tsquery('english', ${search})`);

  const where = conditions.length > 0
    ? sql`WHERE ${conditions.reduce((a, b) => sql`${a} AND ${b}`)}`
    : sql``;

  return sql<LogEntry[]>`
    SELECT id, ts, level, site, page, msg, data
    FROM logs
    ${where}
    ORDER BY ts DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function makeLogStream(sql: postgres.Sql): Writable {
  let partial = "";
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      partial += chunk.toString();
      const lines = partial.split("\n");
      partial = lines.pop() ?? "";
      const pending = lines.filter((l) => l.trim()).map((l) => insertLog(sql, l));
      Promise.all(pending).then(() => callback()).catch(() => callback());
    },
    final(callback) {
      if (partial.trim()) {
        insertLog(sql, partial).then(() => callback()).catch(() => callback());
      } else {
        callback();
      }
    },
  });
}
