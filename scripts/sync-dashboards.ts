#!/usr/bin/env tsx
/**
 * Uploads every JSON file in dashboards/ to Grafana Cloud via the HTTP API.
 *
 * Required env vars:
 *   GRAFANA_CLOUD_URL        https://your-stack.grafana.net
 *   GRAFANA_CLOUD_API_TOKEN  a Grafana Cloud API token with Editor role
 */
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import chalk from "chalk";

const url = process.env.GRAFANA_CLOUD_URL;
const token = process.env.GRAFANA_CLOUD_API_TOKEN;

if (!url || !token) {
  console.error(
    chalk.red(
      "GRAFANA_CLOUD_URL and GRAFANA_CLOUD_API_TOKEN must be set (copy .env.example → .env).",
    ),
  );
  process.exit(1);
}

const dashboardsDir = resolve("dashboards");
const FOLDER_TITLE = "Improntad";

async function ensureFolder(): Promise<string> {
  const res = await fetch(`${url}/api/folders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const folders = (await res.json()) as Array<{ uid: string; title: string }>;
  const existing = folders.find((f) => f.title === FOLDER_TITLE);
  if (existing) return existing.uid;
  const created = await fetch(`${url}/api/folders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: FOLDER_TITLE }),
  });
  const folder = (await created.json()) as { uid: string };
  return folder.uid;
}

async function getPromDatasourceUid(): Promise<string> {
  const res = await fetch(`${url}/api/datasources`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const sources = (await res.json()) as Array<{ uid: string; type: string; isDefault: boolean }>;
  const prom = sources.find((d) => d.type === "prometheus" && d.isDefault)
    ?? sources.find((d) => d.type === "prometheus");
  if (!prom) throw new Error("No Prometheus datasource found in Grafana Cloud.");
  return prom.uid;
}

async function main(): Promise<void> {
  const [folderUid, promUid] = await Promise.all([ensureFolder(), getPromDatasourceUid()]);
  console.log(chalk.gray(`datasource uid: ${promUid}`))

  const entries = await readdir(dashboardsDir);
  const jsons = entries.filter((f) => f.endsWith(".json"));
  if (jsons.length === 0) {
    console.error(chalk.yellow(`No dashboard JSONs found in ${dashboardsDir}`));
    return;
  }

  for (const file of jsons) {
    const raw = await readFile(join(dashboardsDir, file), "utf8");
    const parsed = JSON.parse(
      raw.replaceAll('"uid": "prometheus"', `"uid": "${promUid}"`)
    ) as Record<string, unknown>;
    // Grafana's import endpoint expects { dashboard, overwrite, folderUid? }
    const payload = {
      dashboard: { ...parsed, id: null },
      overwrite: true,
      folderUid,
      message: `Synced from dashboards/${file} via sync-dashboards.ts`,
    };

    const res = await fetch(`${url}/api/dashboards/db`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(chalk.red(`✗ ${file} → ${res.status} ${res.statusText}`));
      console.error(chalk.gray(body));
      process.exitCode = 1;
      continue;
    }

    const result = (await res.json()) as { uid?: string; url?: string };
    console.log(
      chalk.green(`✓ ${file}`),
      chalk.gray(`→ ${url}${result.url ?? ""}`),
    );
  }
}

main().catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.stack : String(err)));
  process.exit(1);
});
