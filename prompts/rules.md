# Lattice

LLM-native work management system. All work history is permanently stored in a local SQLite database.

## Why Lattice

- **Structured over ad-hoc**: Every task is tracked as a Step. No work without registration.
- **Session persistence**: Context survives across sessions. No more "where was I?"
- **Automated transitions**: Phase/Plan/Bolt states update automatically based on step completion.
- **Single source of truth**: Lattice DB is the canonical record, not Plan Mode files or local notes.

## Entities

- **Project** — Working directory registered with Lattice
- **Plan** — High-level intent (roadmap)
- **Phase** — Epic-level grouping within a plan
- **Bolt** — Sprint (time-boxed iteration cycle)
- **Step** — Atomic task unit (the only entity you manage manually)

## Step Statuses

`todo` → `in_progress` → `done` | `cancelled`
`blocked` for external dependencies.

**Terminal (closed):** `done`, `cancelled`
**Auto-transitions:** Phase/Plan/Bolt complete automatically when all steps are terminal.

## Workflow

### Planning (do NOT use Plan Mode files)
1. Propose plan in conversation, get user approval
2. Register via CLI after approval:
   - `lattice plan new`, `phase new`, `bolt new`, `step new`
3. Use `lattice <command> --help` for detailed usage of each command

### Working
1. `lattice step update <ID> --status in_progress` — start work
2. `lattice step update <ID> --status done` — complete work
3. `lattice step update <ID> --status cancelled` — cancel (add comment explaining why)

### Rules (enforced by hooks)
- No work without an active step (PreToolUse blocks Edit/Write/Bash/Agent)
- Steps require a bolt assignment
- Bolts require a project
- Use `lattice` CLI commands only — never call the API directly
