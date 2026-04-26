# Releasing

Two release mechanisms live in this repo. Both are automated; manual steps only on rollback.

> Top-level `RELEASING.md` documents the **plugin** release workflow (Conventional Commit driven). This file documents **cross-component release order** when more than one component is moving together.

## Cross-component release order

Each component has its own repo and its own auto-release workflow. When a coordinated change spans more than one component, release in this order so the plugin always pins versions that are already published.

| # | Component | Repo | Distribution |
|---|---|---|---|
| 1 | `clawket/daemon`   | Rust daemon | GitHub Releases (5 platform binaries) |
| 2 | `clawket/cli`      | Rust CLI + embedded `clawket mcp` | GitHub Releases (5 platform binaries) |
| 3 | `clawket/web`      | React dashboard | GitHub Releases tarball |
| 4 | `clawket/clawket`  | Plugin shell | Marketplace install (`marketplace.json` on `main` HEAD) + git tag |
| 5 | `clawket/landing`  | Public landing page | Cloudflare Pages |

`clawket/mcp` (legacy Node MCP server) is no longer part of the release chain — removed from plugin dependencies in v2.3.2 and scheduled for archive in plugin v11 U4.

## How a plugin patch happens automatically

1. `clawket/cli` or `clawket/daemon` cuts a release.
2. An automated workflow opens a "bump cli/daemon to vX.Y.Z" PR against `clawket/clawket`, updating `components.json`.
3. PR merges. `release.yml` (see top-level `RELEASING.md`) detects the `fix:` / `chore:` commits and decides whether to cut a plugin patch.
4. If cut, the workflow:
   - bumps `package.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`
   - appends a row to `docs/COMPATIBILITY.md`
   - tags `vX.Y.Z` on `main` and creates a GitHub Release

## Version pinning surfaces

| Surface | What it pins | Editor |
|---|---|---|
| `package.json` `compat` | SemVer ranges per component | Bumped manually only when a component majors |
| `components.json` | Exact `vX.Y.Z` of each binary consumed at install | Bumped automatically by component-bump PRs |
| `adapters/shared/claude-hooks.cjs` env vars (`CLAWKET_CLI_VERSION`, `CLAWKET_DAEMON_VERSION`) | Local-dev override only | Not edited — env-only |
| `docs/COMPATIBILITY.md` matrix row | Tested combination per plugin release | Appended automatically by `release.yml` |

`CLAWKET_CLI_VERSION` lives only as an env-var fallback inside `claude-hooks.cjs` for local dev; in normal flow `components.json` is the single pinning source.

## Manual override

Use `workflow_dispatch` on `release.yml` with the `bump` input (`patch`/`minor`/`major`) to force a plugin release regardless of commit messages. See top-level `RELEASING.md`.

## Rollback

The plugin no longer runs `npm install` on user machines (since v2.3.2). To roll a user back:

- `gitCommitSha` pin in `~/.claude/installed_plugins.json` to a previous tag, or
- retag the plugin with the previous compat ranges; already-installed users stay on the old plugin until they re-install.

The install gate (`adapters/shared/claude-hooks.cjs::ensureInstalled`) re-checks marker files against `components.json` on each session, so downgrading the plugin tarball automatically re-downloads the matching binaries on the next `SessionStart` or first MCP spawn.
