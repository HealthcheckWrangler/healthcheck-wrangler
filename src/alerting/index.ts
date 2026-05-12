import { logger } from "../logger.js";
import type { DetailedHealthcheckResult } from "../runner/healthcheck.js";
import type { StoredHealthcheck } from "../db/healthchecks.js";
import type { Site, Page } from "../config.js";
import type { AlertChannel, AlertEvent, AlertEventType } from "./types.js";
import { GoogleChatChannel } from "./channels/google-chat.js";
import type { RuntimeConfig } from "../runtime-config.js";

// Thresholds
const MEM_DANGER_PCT  = 85;
const MEM_RECOVER_PCT = 70;
const LOAD_DANGER_RATIO  = 0.9;  // load > 90% of CPU count
const LOAD_RECOVER_RATIO = 0.6;  // load < 60% of CPU count

function buildChannelMap(config: RuntimeConfig): Map<string, AlertChannel> {
  const map = new Map<string, AlertChannel>();
  for (const ch of config.alerting.channels ?? []) {
    if (ch.type === "google-chat") {
      map.set(ch.name, new GoogleChatChannel({
        name: ch.name,
        webhookUrl: ch.webhookUrl,
        on: ch.on as AlertEventType[],
      }));
    } else {
      throw new Error(`unknown alert channel type: ${(ch as { type: string }).type}`);
    }
  }
  return map;
}

export class AlertManager {
  private readonly channelMap: Map<string, AlertChannel>;
  private readonly defaultChannelNames: string[] | undefined;

  // In-memory resource alert state — no DB needed, these are transient
  private memHighState  = false;
  private loadHighState = false;

  constructor(config: RuntimeConfig) {
    this.channelMap = buildChannelMap(config);
    this.defaultChannelNames = config.alerting.defaults?.channels;
    if (this.channelMap.size > 0) {
      logger.info({ channels: this.channelMap.size }, "alert manager initialised");
    }
  }

  get enabled(): boolean {
    return this.channelMap.size > 0;
  }

  // ── Site healthcheck alerts ────────────────────────────────────────────────

  async onSiteHealthcheckResults(
    pageResults: Array<{ page: Page; result: DetailedHealthcheckResult }>,
    prevStates: Map<string, StoredHealthcheck | null>,
    site: Site,
  ): Promise<void> {
    const channels = this.channelsForSite(site);
    if (channels.length === 0) return;
    if (pageResults.length === 0) return;

    const wasAllUp = pageResults.every(({ page }) => prevStates.get(page.name)?.up ?? true);
    const isAllUp  = pageResults.every(({ result }) => result.up);

    let eventType: AlertEventType | null = null;
    if (wasAllUp && !isAllUp)  eventType = "site-down";
    else if (!wasAllUp && isAllUp) eventType = "site-recovery";
    if (!eventType) return;

    const failing = pageResults.filter(({ result }) => !result.up);

    await this.dispatch({
      type: eventType,
      timestamp: new Date(),
      site: site.name,
      baseUrl: site.baseUrl,
      pagesTotal: pageResults.length,
      pagesDown: failing.length,
      failingPages: failing.map(({ page, result }) => ({
        page: result.page,
        url: new URL(page.path, site.baseUrl).toString(),
        httpStatus: result.httpStatus,
        durationSeconds: result.durationSeconds,
        selectorsFailed: result.selectorsFailed,
        selectorsTotal: result.selectorsTotal,
        navigationError: result.error,
      })),
    }, channels, { site: site.name, pagesDown: failing.length, pagesTotal: pageResults.length });
  }

  // ── Resource alerts ────────────────────────────────────────────────────────

  async onResourceStats(stats: {
    memPct: number;
    memUsedBytes: number;
    memTotalBytes: number;
    load1m: number;
    cpuCount: number;
  }): Promise<void> {
    const allChannels = [...this.channelMap.values()];
    if (allChannels.length === 0) return;

    // Memory
    const isHighMem = stats.memPct >= MEM_DANGER_PCT;
    if (!this.memHighState && isHighMem) {
      this.memHighState = true;
      await this.dispatch({
        type: "high-memory",
        timestamp: new Date(),
        memPct: stats.memPct,
        memUsedBytes: stats.memUsedBytes,
        memTotalBytes: stats.memTotalBytes,
      }, allChannels, { memPct: stats.memPct });
    } else if (this.memHighState && stats.memPct < MEM_RECOVER_PCT) {
      this.memHighState = false;
      await this.dispatch({
        type: "memory-recovered",
        timestamp: new Date(),
        memPct: stats.memPct,
        memUsedBytes: stats.memUsedBytes,
        memTotalBytes: stats.memTotalBytes,
      }, allChannels, { memPct: stats.memPct });
    }

    // CPU load
    const loadRatio = stats.load1m / stats.cpuCount;
    const isHighLoad = loadRatio >= LOAD_DANGER_RATIO;
    if (!this.loadHighState && isHighLoad) {
      this.loadHighState = true;
      await this.dispatch({
        type: "high-load",
        timestamp: new Date(),
        loadAvg: stats.load1m,
        cpuCount: stats.cpuCount,
      }, allChannels, { load1m: stats.load1m, cpuCount: stats.cpuCount });
    } else if (this.loadHighState && loadRatio < LOAD_RECOVER_RATIO) {
      this.loadHighState = false;
      await this.dispatch({
        type: "load-recovered",
        timestamp: new Date(),
        loadAvg: stats.load1m,
        cpuCount: stats.cpuCount,
      }, allChannels, { load1m: stats.load1m, cpuCount: stats.cpuCount });
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private channelsForSite(site: Site): AlertChannel[] {
    if (site.alerting === false) return [];

    // Base set: explicitly configured defaults, or all channels if defaults not set
    const baseNames = this.defaultChannelNames ?? [...this.channelMap.keys()];

    let effectiveNames: string[];
    if (site.alerting === true) {
      effectiveNames = baseNames;
    } else {
      const { add = [], remove = [] } = site.alerting;
      effectiveNames = [...new Set([...baseNames, ...add])].filter((n) => !remove.includes(n));
    }

    return effectiveNames.flatMap((n) => {
      const ch = this.channelMap.get(n);
      if (!ch) {
        logger.warn({ channel: n, site: site.name }, "site references unknown alert channel");
        return [];
      }
      return [ch];
    });
  }

  private async dispatch(
    event: AlertEvent,
    channels: AlertChannel[],
    logCtx: Record<string, unknown>,
  ): Promise<void> {
    const targets = channels.filter((c) => c.handles(event.type));
    if (targets.length === 0) return;
    logger.info({ event: event.type, channels: targets.length, ...logCtx }, "dispatching alert");
    await Promise.allSettled(targets.map((c) => c.send(event)));
  }
}
