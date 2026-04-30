# Changelog

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
