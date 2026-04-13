# Lattice

LLM-native work management system. All work history is permanently stored in a local SQLite database.

## Why Lattice

- **Structured over ad-hoc**: Every task is tracked as a Step. No work without registration.
- **Session persistence**: Context survives across sessions. No more "where was I?"
- **Single source of truth**: Lattice DB is the canonical record, not Plan Mode files or local notes.

## Entity Relationships

```
Project
├── Plan (intent/roadmap — must be approved before work can start)
│   └── Phase (grouping — no status, pure organizational unit)
│       └── Step (atomic task — the only entity you manage directly)
│
└── Bolt (sprint — time-boxed iteration, cross-cutting)
    └── Steps from ANY phase/plan in this project
```

### Two axes of organization

1. **Vertical (what):** Plan → Phase → Step — hierarchical grouping by scope
2. **Horizontal (when):** Bolt → Steps — time-boxed iteration pulling steps from any phase/plan

### Key rules

- A Step belongs to exactly one Phase AND one Bolt.
- A Bolt belongs to a Project, not a Plan. Steps from different plans can coexist.
- Phase has no status — it is a pure grouping entity.
- Plan and Bolt require intentional approval/activation before work can start.

## Step Statuses

`todo` → `in_progress` → `done` | `cancelled`
`blocked` for external dependencies.

**Terminal (closed):** `done`, `cancelled`

## State Management

### Plan: `draft` → `active` → `completed`
- `draft` → `active`: Intentional approval via CLI (`lattice plan approve`) or web UI
- `active` → `completed`: Intentional, when all work is done
- Steps can be created under draft plans as `todo`, but cannot be started (`in_progress`)
- `todo` steps under draft plans can be hard-deleted (the only case where delete is allowed)

### Bolt: `planning` → `active` → `completed`
- `planning` → `active`: Intentional start via CLI (`lattice bolt activate`) or web UI
- `active` → `completed`: Intentional end — Bolt is a sprint, ended deliberately
- **Completed bolts cannot be restarted.** Create a new bolt instead.
- Steps can only be started (`in_progress`) if their bolt is `active`
- Parallel bolts are supported — multiple active bolts per project

### Phase: No status
- Pure grouping. No state management needed.

### Step: Only entity managed directly
- Steps can be created without a bolt (goes to backlog)
- Starting a step (`in_progress`) requires: Plan is `active` AND Bolt is assigned and `active`
- Both LLM (CLI) and human (web UI) can change step status

## Workflow

### Planning (do NOT use Plan Mode files)
1. Propose plan in conversation, get user approval
2. Register via CLI after approval
3. Use `lattice <command> --help` for detailed usage of each command

### Working
1. `lattice step update <ID> --status in_progress`
2. `lattice step update <ID> --status done`
3. `lattice step update <ID> --status cancelled` (add comment with reason)

### Enforced by hooks
- No work without an active step (PreToolUse blocks Edit/Write/Bash/Agent)
- Steps require a bolt assignment
- Bolts require a project
- Use `lattice` CLI only — never call the API directly
