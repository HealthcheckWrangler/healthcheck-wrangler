import { logger } from "../../logger.js";
import type { AlertChannel, AlertEvent, AlertEventType, FailingPage } from "../types.js";

export interface GoogleChatChannelConfig {
  name?: string;
  webhookUrl: string;
  on: AlertEventType[];
}

function fmtBytes(bytes: number): string {
  return bytes >= 1_073_741_824
    ? `${(bytes / 1_073_741_824).toFixed(1)} GB`
    : `${(bytes / 1_048_576).toFixed(0)} MB`;
}

function pageReason(p: FailingPage): string {
  const parts: string[] = [];
  if (p.navigationError) {
    const msg = p.navigationError.length > 80 ? p.navigationError.slice(0, 77) + "…" : p.navigationError;
    parts.push(msg);
  } else {
    if (p.httpStatus >= 400) parts.push(`HTTP ${p.httpStatus}`);
    if (p.selectorsFailed > 0) parts.push(`${p.selectorsFailed}/${p.selectorsTotal} selectors not found`);
  }
  return parts.join(", ") || "unknown error";
}

function buildText(event: AlertEvent): string {
  switch (event.type) {
    case "site-down": {
      const header = `🔴 *${event.site} is DOWN — ${event.pagesDown}/${event.pagesTotal} pages failing*`;
      const lines = (event.failingPages ?? []).map(
        (p) => `❌ *${p.page}* — ${pageReason(p)} (${p.durationSeconds.toFixed(2)}s)`,
      );
      return [header, ...lines].join("\n");
    }
    case "site-recovery":
      return `🟢 *${event.site} has RECOVERED — all ${event.pagesTotal} pages up*`;

    case "high-memory":
      return [
        `⚠️ *Server RAM critically high — ${event.memPct}% used*`,
        `• Used: ${fmtBytes(event.memUsedBytes ?? 0)} / ${fmtBytes(event.memTotalBytes ?? 0)}`,
      ].join("\n");
    case "memory-recovered":
      return `✅ *Server RAM back to normal — ${event.memPct}% used (${fmtBytes(event.memUsedBytes ?? 0)} / ${fmtBytes(event.memTotalBytes ?? 0)})*`;

    case "high-load":
      return [
        `⚠️ *Server CPU load critically high — ${event.loadAvg?.toFixed(2)} avg (${event.cpuCount} CPU${event.cpuCount !== 1 ? "s" : ""})*`,
        `• Load is ${Math.round(((event.loadAvg ?? 0) / (event.cpuCount ?? 1)) * 100)}% of CPU capacity`,
      ].join("\n");
    case "load-recovered":
      return `✅ *Server CPU load back to normal — ${event.loadAvg?.toFixed(2)} avg (${event.cpuCount} CPU${event.cpuCount !== 1 ? "s" : ""})*`;
  }
}

export class GoogleChatChannel implements AlertChannel {
  private readonly config: GoogleChatChannelConfig;

  constructor(config: GoogleChatChannelConfig) {
    this.config = config;
  }

  handles(eventType: AlertEventType): boolean {
    return this.config.on.includes(eventType);
  }

  async send(event: AlertEvent): Promise<void> {
    const channelName = this.config.name ?? "google-chat";

    try {
      const res = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: buildText(event) }),
      });
      if (!res.ok) {
        logger.warn(
          { channel: channelName, status: res.status, event: event.type },
          "google-chat alert delivery failed",
        );
      } else {
        logger.info({ channel: channelName, event: event.type }, "alert sent");
      }
    } catch (err) {
      logger.error({ err, channel: channelName, event: event.type }, "google-chat alert error");
    }
  }
}
