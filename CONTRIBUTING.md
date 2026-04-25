# Contributing to HealthcheckWrangler

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must follow the format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `chore` | Maintenance (deps, build, CI) |
| `ci` | CI/CD changes |

**Examples:**
```
feat(cli): add --all flag to check command
fix(runner): serialize lighthouse runs to prevent mark collision
docs: add self-hosted quickstart to README
chore(deps): bump playwright to 1.60.0
```

A `!` after the type denotes a breaking change:
```
feat!: rename config field metricsPort to metrics.port
```

### Interactive commit prompt

Instead of writing commit messages manually, use the guided prompt:

```bash
npm run commit
```

This runs commitizen and walks you through type, scope, and description interactively. The commit-msg hook will reject any commit that doesn't follow the format.

---

## Making a release

Releases are fully automated once you decide to cut one.

### 1. Make sure your commits are in order

All changes since the last release should be conventional commits. Run `git log` to review.

### 2. Run release-it

```bash
npm run release
```

This will:
- Determine the version bump automatically from your commits (`fix:` → patch, `feat:` → minor, breaking change → major)
- Prompt you to confirm the new version
- Update `version` in `package.json`
- Prepend a new section to `CHANGELOG.md`
- Commit with message `chore: release vX.X.X`
- Create a git tag `vX.X.X`

### 3. Push

```bash
git push --follow-tags
```

This pushes the release commit and the tag together. The tag triggers the GitHub Actions workflow which publishes:
- Docker image to `ghcr.io/healthcheckwrangler/healthcheck-wrangler` (`:latest` + `:X.X.X` + `:X.X`)
- npm package `@healthcheckwrangler/hcw` to npmjs.com

### Version bump rules

release-it reads conventional commits since the last tag and bumps accordingly:

| Commits contain | Version bump |
|---|---|
| Only `fix:`, `docs:`, `chore:` etc. | Patch (`0.0.x`) |
| At least one `feat:` | Minor (`0.x.0`) |
| Any breaking change (`!` or `BREAKING CHANGE:` footer) | Major (`x.0.0`) |

### Changelog

`CHANGELOG.md` is generated automatically — do not edit it by hand. Each release prepends a new section grouped by commit type. Only `feat` and `fix` entries appear in the changelog by default; `chore`, `docs`, and `ci` are intentionally omitted to keep it focused on user-facing changes.

---

## Day-to-day workflow summary

```bash
# Work normally
npm run commit          # guided commit prompt
git push                # no release triggered

# When ready to release
npm run release         # bumps version, writes changelog, commits, tags
git push --follow-tags  # publishes Docker image + npm package
```
