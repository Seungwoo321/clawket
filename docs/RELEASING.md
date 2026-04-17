# Releasing

Release order for coordinated cross-component changes:

1. `clawket/daemon`   — tag `vX.Y.Z` → CI publishes to npm
2. `clawket/mcp`      — tag `vX.Y.Z` → CI publishes to npm
3. `clawket/cli`      — tag `vX.Y.Z` → CI builds 5 platform binaries to GitHub Release
4. `clawket/web`      — tag `vX.Y.Z` → CI builds bundle + publishes to npm
5. `clawket/clawket`  — bump `package.json` dep ranges + `CLAWKET_CLI_VERSION`
                        in `adapters/shared/claude-hooks.cjs`; update
                        `docs/COMPATIBILITY.md`; tag plugin release
6. `clawket/landing`  — update messaging if surface changed; deploy

## Plugin release checklist

- [ ] `package.json` deps ranges updated
- [ ] `.claude-plugin/plugin.json` version bumped
- [ ] `CLAWKET_CLI_VERSION` default pinned in `adapters/shared/claude-hooks.cjs`
- [ ] `docs/COMPATIBILITY.md` matrix row appended
- [ ] Integration smoke: fresh clone + `node scripts/setup.cjs` + `clawket --version`
- [ ] Tag `vX.Y.Z` + GitHub Release notes

## Rollback

Plugins pin exact dep versions on install (lockfile regenerated at `pnpm install --prod`).
To roll back, retag the plugin with the previous compat ranges; already-installed users
stay on the old plugin until they re-install.
