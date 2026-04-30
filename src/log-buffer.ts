import { Writable } from "node:stream";

export interface LogEntry {
  id: number;
  time: string;
  level: string;
  msg: string;
  site?: string;
  [k: string]: unknown;
}

const LEVEL_NAMES: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

export class LogBuffer {
  private entries: LogEntry[] = [];
  private seq = 0;
  private listeners = new Set<(e: LogEntry) => void>();
  readonly capacity: number;

  constructor(capacity = 500) {
    this.capacity = capacity;
  }

  push(rawLine: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawLine.trim());
    } catch {
      return;
    }

    const levelNum = typeof parsed.level === "number" ? parsed.level : 30;
    const entry: LogEntry = {
      ...parsed,
      id: ++this.seq,
      time: typeof parsed.time === "string" ? parsed.time : new Date().toISOString(),
      level: LEVEL_NAMES[levelNum] ?? String(parsed.level),
      msg: typeof parsed.msg === "string" ? parsed.msg : "",
    };

    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }

    for (const fn of this.listeners) {
      fn(entry);
    }
  }

  snapshot(): LogEntry[] {
    return [...this.entries];
  }

  subscribe(fn: (e: LogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export function makeLogStream(buffer: LogBuffer): Writable {
  let partial = "";
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      partial += chunk.toString();
      const lines = partial.split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) buffer.push(line);
      }
      callback();
    },
    final(callback) {
      if (partial.trim()) buffer.push(partial);
      callback();
    },
  });
}
