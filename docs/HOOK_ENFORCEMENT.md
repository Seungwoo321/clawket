# MCP-based Hook Enforcement

## Motivation

Claude Code currently runs enforcement hooks (PreToolUse, PostToolUse, SessionStart,
UserPromptSubmit, Stop, SubagentStart/Stop) via `cjs` scripts in
`adapters/shared/claude-hooks.cjs`. Each invocation spawns Node, loads the daemon port,
and performs an HTTP round-trip.

Two issues:

1. **Slow cold-start.** A PreToolUse firing on every `Bash` call costs ~60–150 ms on
   laptops. Compounds during long agent turns.
2. **Duplicated logic.** The same "is there an active task?" check lives in both the
   hook `cjs` and the daemon API. Rules drift.

## Target

Move enforcement into the MCP server. Claude Code invokes a single MCP tool
(`clawket.enforce`) on each hook event; the MCP process stays warm across the session
and shares the daemon connection.

## Design

### New MCP tool: `clawket.enforce`

```jsonc
{
  "name": "clawket.enforce",
  "description": "Gate tool invocations against active task/cycle/plan state.",
  "inputSchema": {
    "type": "object",
    "required": ["event"],
    "properties": {
      "event": { "enum": ["PreToolUse", "PostToolUse", "SessionStart",
                          "UserPromptSubmit", "Stop", "SubagentStart",
                          "SubagentStop", "PlanSync", "TaskCreated",
                          "TaskCompleted"] },
      "tool":  { "type": "string" },
      "cwd":   { "type": "string" },
      "agentId": { "type": "string" }
    }
  }
}
```

Return shape:

```jsonc
{
  "allow": false,
  "reason": "No active task. Run `clawket task update <ID> --status in_progress`."
}
```

### Plugin hook adapter becomes a thin shim

`adapters/shared/claude-hooks.cjs` reduces to:

```js
// pre-tool-use.cjs
const mcp = require('./mcp-client');
module.exports = async function preToolUse(evt) {
  const r = await mcp.call('clawket.enforce', { event: 'PreToolUse', ...evt });
  if (!r.allow) {
    process.stderr.write(r.reason + '\n');
    process.exit(2);
  }
};
```

The MCP client keeps a unix-socket / stdio bridge open for the session, eliminating
cold-start per event.

### State ownership

| State | Owner | Accessed by |
|---|---|---|
| Active task | daemon SQLite | MCP (read) |
| Cycle status | daemon SQLite | MCP (read) |
| Plan status | daemon SQLite | MCP (read) |
| Project cwd binding | daemon SQLite | MCP (read) |
| Agent binding | MCP process memory | MCP (read/write) |

## Migration path

1. Ship MCP `clawket.enforce` alongside existing `cjs` hooks (double-gate, same outcome).
2. Ship thin `cjs` shims that consult MCP. Roll out with a feature flag
   (`CLAWKET_MCP_ENFORCE=1`).
3. After one release cycle of no regressions, delete the fat `cjs` paths.
4. Phase 6 — MCP rewrites in Rust; `cjs` shim becomes a few lines that exec the Rust
   binary.

## Risks

- **MCP process lifecycle** tied to Claude Code session; if Claude restarts mid-session
  the warm state is lost. Mitigate by making the shim tolerate a cold MCP start.
- **Daemon unavailable** — enforcement must fail-closed (block tool) with a clear
  "daemon not reachable" message so users know to `clawket daemon start`.
- **Schema drift** — the enforce tool's input schema is versioned per plugin release and
  pinned by the `compat` matrix.
