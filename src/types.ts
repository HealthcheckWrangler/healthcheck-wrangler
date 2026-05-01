export interface HealthcheckResult {
  site: string;
  page: string;
  up: boolean;
  durationSeconds: number;
  selectorsTotal: number;
  selectorsFailed: number;
  httpStatus: number;
}

export interface LighthouseResult {
  site: string;
  page: string;
  scores: {
    performance: number;
    accessibility: number;
    best_practices: number;
    seo: number;
  };
  metrics: {
    lcp_seconds: number;
    fcp_seconds: number;
    tbt_seconds: number;
    cls: number;
    ttfb_seconds: number;
    speed_index_seconds: number;
  };
  reportUrl: string | null;
  timestamp: string;
}
