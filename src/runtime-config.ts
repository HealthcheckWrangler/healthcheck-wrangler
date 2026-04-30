import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const ProjectSchema = z
  .object({
    name: z.string().min(1).default("healthcheck-wrangler"),
  })
  .default({});

const RunnerSchema = z
  .object({
    workers: z.number().int().positive().default(3),
    pageDelayMs: z.number().int().min(0).default(0),
    metricsPort: z.number().int().positive().default(9464),
    metricsSink: z.enum(["prometheus", "stdout", "none"]).default("none"),
    sitesDir: z.string().default("./sites"),
    reportsDir: z.string().default("./reports"),
    logLevel: z.string().default("info"),
    schedulerTickMs: z.number().int().positive().default(1000),
    lighthouseStartDelayMs: z.number().int().min(0).default(30_000),
    // Dashboard API — always on by default (set to 0 to disable)
    apiPort: z.number().int().min(0).default(8080),
    logRetentionDays: z.number().int().positive().default(7),
    resultsRetentionDays: z.number().int().positive().default(180),
    lighthouseReportRetentionDays: z.number().int().positive().default(7),
  })
  .default({});

const HealthcheckSchema = z
  .object({
    defaultIntervalMinutes: z.number().int().positive().default(10),
    defaultTimeoutSeconds: z.number().int().positive().default(30),
    selectorTimeoutMs: z.number().int().positive().default(5000),
    forceCloseTimeoutMs: z.number().int().positive().default(5000),
  })
  .default({});

const LighthouseSchema = z
  .object({
    defaultIntervalMinutes: z.number().int().positive().default(360),
    defaultThrottling: z.enum(["mobile", "desktop"]).default("mobile"),
    desktopWidth: z.number().int().positive().default(1350),
    desktopHeight: z.number().int().positive().default(940),
    forceCloseTimeoutMs: z.number().int().positive().default(5000),
  })
  .default({});

const WatcherSchema = z
  .object({
    stabilityThreshold: z.number().int().positive().default(250),
    pollInterval: z.number().int().positive().default(50),
  })
  .default({});

const AlertEventTypeSchema = z.enum([
  "site-down",
  "site-recovery",
  "high-memory",
  "memory-recovered",
  "high-load",
  "load-recovered",
]);

const GoogleChatChannelSchema = z.object({
  type: z.literal("google-chat"),
  name: z.string().optional(),
  webhookUrl: z.string().url(),
  on: z.array(AlertEventTypeSchema).default(["site-down", "site-recovery"]),
});

const ChannelSchema = z.discriminatedUnion("type", [GoogleChatChannelSchema]);

const AlertingSchema = z
  .object({
    channels: z.array(ChannelSchema).default([]),
    // Legacy fields — used only with --profile self-hosted / grafana-cloud (Prometheus alertmanager)
    siteDownMinutes: z.number().int().positive().default(20),
    selectorFailMinutes: z.number().int().positive().default(20),
    poorLcpSeconds: z.number().positive().default(4),
    queryRangeSeconds: z.number().int().positive().default(600),
    groupWaitSeconds: z.number().int().positive().default(30),
    groupIntervalMinutes: z.number().int().positive().default(5),
    repeatIntervalHours: z.number().int().positive().default(4),
  })
  .default({});

const RuntimeConfigSchema = z
  .object({
    project: ProjectSchema,
    runner: RunnerSchema,
    healthcheck: HealthcheckSchema,
    lighthouse: LighthouseSchema,
    watcher: WatcherSchema,
    alerting: AlertingSchema,
  })
  .default({});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export function loadRuntimeConfig(configPath?: string): RuntimeConfig {
  const path = configPath ?? resolve(process.cwd(), "config.yaml");
  const raw = existsSync(path) ? parse(readFileSync(path, "utf8")) : {};
  return RuntimeConfigSchema.parse(raw ?? {});
}
