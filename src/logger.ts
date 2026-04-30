import pino from "pino";
import { makeLogStream } from "./db/logs.js";
import type postgres from "postgres";

const level = (process.env.LOG_LEVEL ?? "info") as pino.Level;
const isDev = process.env.NODE_ENV !== "production";

export let logger: pino.Logger = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isDev
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
    : undefined,
});

export function initLogDb(sql: postgres.Sql): void {
  const streams: pino.StreamEntry[] = [
    { stream: makeLogStream(sql), level: "trace" },
  ];

  if (isDev) {
    streams.push({
      stream: pino.transport({
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      }),
      level,
    });
  } else {
    streams.push({ stream: process.stdout, level });
  }

  logger = pino(
    { level, timestamp: pino.stdTimeFunctions.isoTime },
    pino.multistream(streams),
  );
}
