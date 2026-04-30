export type AlertEventType =
  | "site-down"
  | "site-recovery"
  | "high-memory"
  | "memory-recovered"
  | "high-load"
  | "load-recovered";

export interface FailingPage {
  page: string;
  url: string;
  httpStatus: number;
  durationSeconds: number;
  selectorsFailed: number;
  selectorsTotal: number;
  navigationError?: string;
}

export interface AlertEvent {
  type: AlertEventType;
  timestamp: Date;
  // Site events
  site?: string;
  baseUrl?: string;
  pagesTotal?: number;
  pagesDown?: number;
  failingPages?: FailingPage[];
  // Resource events
  memPct?: number;
  memUsedBytes?: number;
  memTotalBytes?: number;
  loadAvg?: number;
  cpuCount?: number;
}

export interface AlertChannel {
  handles(eventType: AlertEventType): boolean;
  send(event: AlertEvent): Promise<void>;
}
