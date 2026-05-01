import type postgres from "postgres";
import type { DetailedHealthcheckResult } from "./runner/healthcheck.js";
import type { LighthouseResult } from "./types.js";
import {
  insertHealthcheck,
  getLatestHealthcheck,
  getAllLatestForSite,
  getAllHealthcheckHistoryForSite,
  type StoredHealthcheck,
} from "./db/healthchecks.js";
import {
  insertLighthouse,
  getLighthouseHistory,
  type StoredLighthouse,
} from "./db/lighthouse.js";

export type { StoredHealthcheck, StoredLighthouse };

export interface PageLatest {
  healthcheck: StoredHealthcheck | null;
}

export class ResultsStore {
  constructor(private readonly sql: postgres.Sql) {}

  async recordHealthcheck(result: DetailedHealthcheckResult): Promise<void> {
    await insertHealthcheck(this.sql, result);
  }

  async recordLighthouse(result: LighthouseResult): Promise<void> {
    await insertLighthouse(this.sql, result);
  }

  async getPageLatest(site: string, pages: string[]): Promise<Record<string, PageLatest>> {
    const hcMap = await getAllLatestForSite(this.sql, site, pages);
    const result: Record<string, PageLatest> = {};
    for (const page of pages) {
      result[page] = { healthcheck: hcMap[page] ?? null };
    }
    return result;
  }

  async getLatestHealthcheck(site: string, page: string): Promise<StoredHealthcheck | null> {
    return getLatestHealthcheck(this.sql, site, page);
  }

  async getHealthcheckHistory(site: string): Promise<StoredHealthcheck[]> {
    return getAllHealthcheckHistoryForSite(this.sql, site);
  }

  async getLighthouseHistory(site: string): Promise<StoredLighthouse[]> {
    return getLighthouseHistory(this.sql, site);
  }
}
