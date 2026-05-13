# Changelog

## [4.0.0](https://github.com/HealthcheckWrangler/healthcheck-wrangler/compare/v3.0.0...v4.0.0) (2026-05-13)

### ⚠ BREAKING CHANGES

* configurable startup scheduling to prevent thundering herd on fresh start

### Features

* configurable startup scheduling to prevent thundering herd on fresh start ([4adb6bd](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/4adb6bd7f139c697526ca5973053372f24a4760a))

## [3.0.0](https://github.com/HealthcheckWrangler/healthcheck-wrangler/compare/v2.2.0...v3.0.0) (2026-05-12)

### ⚠ BREAKING CHANGES

* named alerting channels with per-site add/remove overrides

### Features

* annotations — timestamped chart markers with create/edit/delete ([7f2ea7f](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/7f2ea7f32ad13635503d948278507712b6573480))
* disabled visual state for sites in overview ([e862424](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/e8624248b6c86d5f0b6d560eb8f700dd85883b80))
* named alerting channels with per-site add/remove overrides ([6a30177](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/6a30177f814251982b61067ce258eea9d1bfa405))
* uptime % KPIs (24h/7d/30d) on site overview ([9822d85](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/9822d85ff358d4111443bad796f802578edf6748))
* worker monitoring dashboard with utilization history and capacity forecast ([170d173](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/170d1734ec7508d7849b2dad9824dbfb5aa0960d))

### Bug Fixes

* show latest lighthouse result per page on Pages tab ([c5c27aa](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/c5c27aa0e3a0662244835314df2de0b692d2a3a7))

## [2.2.0](https://github.com/HealthcheckWrangler/healthcheck-wrangler/compare/v2.1.0...v2.2.0) (2026-05-05)

### Features

* add detailed worker progress tracker ([fbe5488](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/fbe548899b4405140565af767ae430c7442dd368))

## [2.1.0](https://github.com/HealthcheckWrangler/healthcheck-wrangler/compare/v2.0.0...v2.1.0) (2026-05-05)

### Features

* **dashboard:** add dark/light theme support ([ff666ff](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/ff666fff58a80ab6fe196687ff7d7da10457424c))
* **dashboard:** add logo, theme toggle, pause controls, and paused banner ([d9de152](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/d9de15219cbdeff946bdbe2f7b60fe30da31d924))
* **runner:** add manual trigger and pause/resume monitoring ([645c8e2](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/645c8e2c808cc523e8269e55617e6f586578ecbf))

### Bug Fixes

* **dashboard:** fix kpi trend sparkline gradient rendering ([78d79fc](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/78d79fcc69ca13521e09714cab68c0d968434e08)), closes [#kpiGrad-Pages](https://github.com/HealthcheckWrangler/healthcheck-wrangler/issues/kpiGrad-Pages)

## [2.0.0](https://github.com/HealthcheckWrangler/healthcheck-wrangler/compare/v1.0.0...v2.0.0) (2026-05-01)

### Features

* **dashboard:** add lighthouse historic graphs ([206f3d8](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/206f3d8bcf7a20035c0944ba0a3853e9ef17a211))
* remove grafana, prometheus and alloy integrations ([7275a6b](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/7275a6b3a3d70924f3374940e3aae3cf26eb613e))

### Bug Fixes

* lighthouse reports no longer leave empty directories ([71043f1](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/71043f1130328342e2a239187b95dc1f76d532e1))

## [1.0.0](https://github.com/HealthcheckWrangler/healthcheck-wrangler/compare/v0.2.0...v1.0.0) (2026-04-30)

### Features

* **alerting:** add channel-based alerting with Google Chat and resource monitoring ([4015e21](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/4015e217055ae05b1f46fba9473cc4a075f17d59))
* **api:** add REST and SSE API server with timeline, KPI trend and log endpoints ([5cca9d0](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/5cca9d0704ee5ff2cab91afc021ec9185588672e))
* **config:** extend runtime config with API port, retention and alerting channels ([6c3ccd7](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/6c3ccd7454ab1d1f457415343620eea810a82ec2))
* **dashboard:** add React dashboard with site overview, timeline charts, log viewer and site detail ([98fd12c](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/98fd12cc4565d09e3b8a448dd070d7c9f163ea5d))
* **db:** add TimescaleDB persistence layer for healthchecks, lighthouse and logs ([da93077](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/da93077140d4149fa59e0e20063e64b4cad84be1))
* **runner:** extract task scheduler with in-flight tracking ([c721d65](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/c721d651d5d8dd9d7fcdf951f8aba0646f20b118))
* **runner:** wire DB, scheduler, alerting and resource monitoring into main loop ([7e3e16f](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/7e3e16fada024ff8d57012d90c1332311915a9d7))

### Bug Fixes

* **runner:** add comprehensive error logging and improved browser lifecycle handling ([c47240a](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/c47240a8c6a64805d9cb3ff80127cacbd085ca98))

## 0.2.0 (2026-04-25)

### Features

* add self-hosted and split up features ([c610576](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/c610576a0fecddb2008ec62656659cff99867f21))
* initial HealthcheckWrangler engine ([0b5b3ec](https://github.com/HealthcheckWrangler/healthcheck-wrangler/commit/0b5b3ecc8c5c87d8a0d47c9935a7644bf788f9de))
