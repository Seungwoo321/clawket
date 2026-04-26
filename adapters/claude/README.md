# Claude Adapter

Claude integration is implemented as a thin adapter layer over shared Clawket runtime helpers.

- `.claude-plugin/` — Claude plugin manifest + marketplace metadata
- `.mcp.json` — registers `clawket mcp` (stdio); points `command`/`args` at `scripts/mcp-launch.cjs`
- `hooks/hooks.json` — Claude hook routing manifest (10 hook entries across 9 events)
- `scripts/setup.cjs` — manual / CI setup entry; delegates to `adapters/claude/setup.cjs` → `adapters/shared/claude-hooks.cjs::ensureInstalled`
- `scripts/mcp-launch.cjs` — MCP first-spawn launcher; runs the same `ensureInstalled` gate before exec'ing `clawket mcp`
- `adapters/claude/*.cjs` — Claude adapter hook entrypoints (one per hook event)
- `adapters/shared/claude-hooks.cjs` — single source of truth for install gate (`ensureInstalled`), daemon discovery / start, and shared hook glue used by Claude now and future adapters later
