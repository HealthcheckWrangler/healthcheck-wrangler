import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename, extname } from "node:path";
import { EventEmitter } from "node:events";
import chokidar from "chokidar";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { logger } from "./logger.js";
import type { RuntimeConfig } from "./runtime-config.js";

const PageSchema = z.object({
  path: z.string().startsWith("/"),
  name: z.string().min(1),
  selectors: z.array(z.string().min(1)).min(1),
});

// API check schema — reserved for future implementation, validated but not executed by runner.
const ApiAssertionSchema = z.union([
  z.object({ type: z.literal("json"), path: z.string(), equals: z.unknown().optional(), exists: z.boolean().optional(), contains: z.string().optional(), minLength: z.number().int().optional() }),
  z.object({ type: z.literal("header"), name: z.string(), equals: z.string().optional(), contains: z.string().optional(), exists: z.boolean().optional() }),
  z.object({ type: z.literal("body"), equals: z.string().optional(), contains: z.string().optional() }),
  z.object({ type: z.literal("status"), equals: z.number().int().optional(), in: z.array(z.number().int()).optional() }),
]);

const ApiCheckSchema = z.object({
  path: z.string().startsWith("/"),
  name: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  headers: z.record(z.string()).optional(),
  query: z.record(z.string()).optional(),
  body: z.union([
    z.object({ inline: z.string() }),
    z.object({ file: z.string() }),
  ]).optional(),
  expectedStatus: z.number().int().optional(),
  latencyThresholdMs: z.number().int().positive().optional(),
  assertions: z.array(ApiAssertionSchema).optional(),
  expectedResponse: z.union([
    z.object({ inline: z.string() }),
    z.object({ file: z.string() }),
  ]).optional(),
});

const ApiSchema = z
  .object({
    enabled: z.boolean().default(false),
    intervalMinutes: z.number().int().positive().default(5),
    checks: z.array(ApiCheckSchema).default([]),
  })
  .optional();

function createSiteSchema(config: RuntimeConfig) {
  const HealthcheckSchema = z
    .object({
      enabled: z.boolean().default(true),
      intervalMinutes: z.number().int().positive().default(config.healthcheck.defaultIntervalMinutes),
      timeoutSeconds: z.number().int().positive().default(config.healthcheck.defaultTimeoutSeconds),
    })
    .default({});

  const LighthouseSchema = z
    .object({
      enabled: z.boolean().default(true),
      intervalMinutes: z.number().int().positive().default(config.lighthouse.defaultIntervalMinutes),
      throttling: z.enum(["mobile", "desktop"]).default(config.lighthouse.defaultThrottling),
    })
    .default({});

  return z.object({
    name: z
      .string()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, "name must be kebab/snake-case lowercase"),
    baseUrl: z.string().url(),
    alerting: z.boolean().default(true),
    healthcheck: HealthcheckSchema,
    lighthouse: LighthouseSchema,
    pages: z.array(PageSchema).min(1),
    api: ApiSchema,
  });
}

export type Site = z.infer<ReturnType<typeof createSiteSchema>>;
export type Page = z.infer<typeof PageSchema>;

export interface ConfigStoreEvents {
  change: (sites: Site[]) => void;
}

export class ConfigStore extends EventEmitter {
  private readonly dir: string;
  private readonly siteSchema: ReturnType<typeof createSiteSchema>;
  private sites = new Map<string, Site>();
  private watcher: chokidar.FSWatcher | null = null;
  private readonly watcherOpts: { stabilityThreshold: number; pollInterval: number };

  constructor(sitesDir: string, config: RuntimeConfig) {
    super();
    this.dir = resolve(sitesDir);
    this.siteSchema = createSiteSchema(config);
    this.watcherOpts = {
      stabilityThreshold: config.watcher.stabilityThreshold,
      pollInterval: config.watcher.pollInterval,
    };
  }

  loadAll(): Site[] {
    this.sites.clear();
    const entries = readdirSync(this.dir);
    for (const entry of entries) {
      const full = join(this.dir, entry);
      if (!statSync(full).isFile()) continue;
      if (![".yaml", ".yml"].includes(extname(entry))) continue;
      this.loadFile(full);
    }
    return this.list();
  }

  list(): Site[] {
    return [...this.sites.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): Site | undefined {
    return this.sites.get(name);
  }

  watch(): void {
    if (this.watcher) return;
    this.watcher = chokidar.watch(`${this.dir}/*.{yaml,yml}`, {
      ignoreInitial: true,
      awaitWriteFinish: this.watcherOpts,
    });
    this.watcher
      .on("add", (path) => this.handleFileChange(path, "add"))
      .on("change", (path) => this.handleFileChange(path, "change"))
      .on("unlink", (path) => this.handleFileRemoved(path));
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
  }

  private handleFileChange(path: string, kind: "add" | "change"): void {
    try {
      const site = this.loadFile(path);
      if (site) {
        logger.info({ site: site.name, kind }, "site config loaded");
        this.emit("change", this.list());
      }
    } catch (err) {
      logger.error({ err, path }, "failed to load site config");
    }
  }

  private handleFileRemoved(path: string): void {
    const name = basename(path, extname(path));
    if (this.sites.delete(name)) {
      logger.info({ site: name }, "site config removed");
      this.emit("change", this.list());
    }
  }

  private loadFile(path: string): Site | null {
    const raw = readFileSync(path, "utf8");
    const parsed = parseYaml(raw);
    const result = this.siteSchema.safeParse(parsed);
    if (!result.success) {
      logger.error(
        { path, errors: result.error.flatten() },
        "invalid site YAML",
      );
      return null;
    }
    const site = result.data;
    const fileStem = basename(path, extname(path));
    if (fileStem !== site.name) {
      logger.warn(
        { path, fileStem, declaredName: site.name },
        "file name does not match site.name — using declared name",
      );
    }
    this.sites.set(site.name, site);
    return site;
  }
}
