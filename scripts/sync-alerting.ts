#!/usr/bin/env tsx
/**
 * Pushes the PagerDuty contact point, alert rules, and notification policy
 * to Grafana Cloud via the HTTP API.
 *
 * Required env vars:
 *   GRAFANA_CLOUD_URL          https://your-stack.grafana.net
 *   GRAFANA_CLOUD_API_TOKEN    Grafana Cloud API token with Editor role
 *   PAGERDUTY_INTEGRATION_KEY  PagerDuty Events API v2 integration key
 */
import chalk from "chalk";
import { loadRuntimeConfig } from "../src/runtime-config.js";

const config = loadRuntimeConfig();
const { alerting, project } = config;

const baseUrl = process.env.GRAFANA_CLOUD_URL?.replace(/\/$/, "");
const token = process.env.GRAFANA_CLOUD_API_TOKEN;
const pdKey = process.env.PAGERDUTY_INTEGRATION_KEY;

if (!baseUrl || !token || !pdKey) {
  console.error(
    chalk.red(
      "GRAFANA_CLOUD_URL, GRAFANA_CLOUD_API_TOKEN, and PAGERDUTY_INTEGRATION_KEY must be set.",
    ),
  );
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "X-Disable-Provenance": "true",
};

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${res.statusText}\n${text}`);
  return text ? JSON.parse(text) : null;
}

// ── 1. Ensure folder exists ───────────────────────────────────────────────────

async function ensureFolder(title: string): Promise<string> {
  const folders = (await api("GET", "/api/folders")) as Array<{ uid: string; title: string }>;
  const existing = folders.find((f) => f.title === title);
  if (existing) return existing.uid;
  const created = (await api("POST", "/api/folders", { title })) as { uid: string };
  return created.uid;
}

// ── 2. Get default Prometheus datasource UID ─────────────────────────────────

async function getPromDatasourceUid(): Promise<string> {
  const sources = (await api("GET", "/api/datasources")) as Array<{
    uid: string;
    type: string;
    isDefault: boolean;
    name: string;
  }>;
  const prom = sources.find((d) => d.type === "prometheus" && d.isDefault)
    ?? sources.find((d) => d.type === "prometheus");
  if (!prom) throw new Error("No Prometheus datasource found in Grafana Cloud.");
  return prom.uid;
}

// ── 3. Upsert contact point ───────────────────────────────────────────────────

async function upsertContactPoint(): Promise<void> {
  const existing = (await api("GET", "/api/v1/provisioning/contact-points")) as Array<{
    uid: string;
    name: string;
  }>;
  const found = existing.find((cp) => cp.name === "PagerDuty");

  const payload = {
    name: "PagerDuty",
    type: "pagerduty",
    settings: {
      integrationKey: pdKey,
      severity: "critical",
      class: "healthcheck",
      component: project.name,
    },
    disableResolveMessage: false,
  };

  if (found) {
    await api("PUT", `/api/v1/provisioning/contact-points/${found.uid}`, {
      ...payload,
      uid: found.uid,
    });
    console.log(chalk.green("✓ contact point updated"), chalk.gray("PagerDuty"));
  } else {
    await api("POST", "/api/v1/provisioning/contact-points", payload);
    console.log(chalk.green("✓ contact point created"), chalk.gray("PagerDuty"));
  }
}

// ── 4. Upsert notification policy ────────────────────────────────────────────

async function upsertPolicy(): Promise<void> {
  await api("PUT", "/api/v1/provisioning/policies", {
    receiver: "PagerDuty",
    group_by: ["alertname", "site"],
    group_wait: `${alerting.groupWaitSeconds}s`,
    group_interval: `${alerting.groupIntervalMinutes}m`,
    repeat_interval: `${alerting.repeatIntervalHours}h`,
  });
  console.log(chalk.green("✓ notification policy set"));
}

// ── 5. Upsert alert rules ─────────────────────────────────────────────────────

function makeRules(folderUid: string, datasourceUid: string) {
  const ruleGroup = `${project.name}-site-health`;
  const queryRange = { from: alerting.queryRangeSeconds, to: 0 };
  const siteDownFor = `${alerting.siteDownMinutes}m`;
  const selectorFailFor = `${alerting.selectorFailMinutes}m`;

  return [
    {
      uid: "site-down",
      title: "Site Down",
      ruleGroup,
      folderUID: folderUid,
      condition: "A",
      data: [
        {
          refId: "A",
          relativeTimeRange: queryRange,
          datasourceUid,
          model: {
            expr: "healthcheck_up == 0",
            intervalMs: 1000,
            maxDataPoints: 43200,
            refId: "A",
          },
        },
      ],
      noDataState: "NoData",
      execErrState: "Error",
      for: siteDownFor,
      isPaused: false,
      annotations: {
        summary: "{{ $labels.site }} is not responding",
        description: `Healthcheck has been failing for at least ${alerting.siteDownMinutes} minutes.`,
      },
      labels: { severity: "critical" },
    },
    {
      uid: "selector-failures",
      title: "Selector Failures",
      ruleGroup,
      folderUID: folderUid,
      condition: "A",
      data: [
        {
          refId: "A",
          relativeTimeRange: queryRange,
          datasourceUid,
          model: {
            expr: "healthcheck_selector_failures > 0",
            intervalMs: 1000,
            maxDataPoints: 43200,
            refId: "A",
          },
        },
      ],
      noDataState: "NoData",
      execErrState: "Error",
      for: selectorFailFor,
      isPaused: false,
      annotations: {
        summary: "{{ $labels.site }}: selector failures on {{ $labels.page }}",
        description: `{{ $value }} selector(s) failing for at least ${alerting.selectorFailMinutes} minutes.`,
      },
      labels: { severity: "warning" },
    },
    {
      uid: "poor-lcp",
      title: "Poor LCP",
      ruleGroup,
      folderUID: folderUid,
      condition: "A",
      data: [
        {
          refId: "A",
          relativeTimeRange: queryRange,
          datasourceUid,
          model: {
            expr: `lighthouse_lcp_seconds > ${alerting.poorLcpSeconds}`,
            intervalMs: 1000,
            maxDataPoints: 43200,
            refId: "A",
          },
        },
      ],
      noDataState: "NoData",
      execErrState: "Error",
      for: "720m",
      isPaused: true,
      annotations: {
        summary: "{{ $labels.site }} LCP is degraded",
        description: `LCP above ${alerting.poorLcpSeconds}s for 2 consecutive Lighthouse runs.`,
      },
      labels: { severity: "warning" },
    },
  ];
}

async function upsertRules(folderUid: string, datasourceUid: string): Promise<void> {
  const rules = makeRules(folderUid, datasourceUid);

  for (const rule of rules) {
    try {
      await api("GET", `/api/v1/provisioning/alert-rules/${rule.uid}`);
      await api("PUT", `/api/v1/provisioning/alert-rules/${rule.uid}`, rule);
      console.log(chalk.green(`✓ rule updated`), chalk.gray(rule.title));
    } catch {
      await api("POST", "/api/v1/provisioning/alert-rules", rule);
      console.log(chalk.green(`✓ rule created`), chalk.gray(rule.title));
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(chalk.bold("Syncing alerting to Grafana Cloud…\n"));

  const [folderUid, datasourceUid] = await Promise.all([
    ensureFolder(project.name),
    getPromDatasourceUid(),
  ]);

  console.log(chalk.gray(`folder uid: ${folderUid}`));
  console.log(chalk.gray(`datasource uid: ${datasourceUid}\n`));

  await upsertContactPoint();
  await upsertPolicy();
  await upsertRules(folderUid, datasourceUid);

  console.log(chalk.bold.green("\nDone."));
}

main().catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.stack : String(err)));
  process.exit(1);
});
