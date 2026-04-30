import postgres from "postgres";

let _sql: postgres.Sql | null = null;

export function getClient(): postgres.Sql {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
  }
  return _sql;
}

export async function closeClient(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
  }
}

export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
