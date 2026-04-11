---
name: lattice
description: Manage work dashboard — view/update tasks, plans, phases, steps. Use when you need to check current work status, update step progress, create new tasks, or manage project workflow.
---

# Lattice Work Dashboard

Structured task board for Claude Code sessions. All state persists across sessions via SQLite.

## When to Use

- Starting work: check `lattice dashboard` for current task status
- Updating progress: `lattice step update <ID> --status in_progress`
- Completing work: `lattice step update <ID> --status done`
- Creating tasks: `lattice step new "title" --phase <PHASE-ID>`
- Checking blockers: `lattice step list --status todo --phase-id <PHASE-ID>`
- Phase approval: `lattice phase approve <PHASE-ID>`

## Entity Hierarchy

```
Project → Plan → Phase → Step
                          ├── Artifact (deliverables)
                          ├── Run (execution log)
                          └── depends_on (dependencies)
```

## Quick Reference

### Dashboard (compact overview)
```bash
lattice dashboard --cwd /path/to/project
```

### Step Operations (most frequent)
```bash
lattice step list --phase-id PHASE-xxx
lattice step show STEP-xxx
lattice step update STEP-xxx --status in_progress
lattice step update STEP-xxx --status done
lattice step new "Task title" --phase PHASE-xxx --body "description"
lattice step append-body STEP-xxx --text "additional notes"
lattice step search "keyword"
```

### Phase Operations
```bash
lattice phase list --plan-id PLAN-xxx
lattice phase approve PHASE-xxx
lattice phase wait-approval PHASE-xxx --timeout 600
```

### Plan Operations
```bash
lattice plan list --project-id PROJ-xxx
lattice plan show PLAN-xxx
lattice plan import plan.md --project myproject
```

### Run Operations (execution tracking)
```bash
lattice run start --step STEP-xxx --agent sub-agent-1
lattice run finish RUN-xxx --result success --notes "completed migration"
```

### Question Operations
```bash
lattice question new "Should we use X or Y?" --plan PLAN-xxx --kind decision
lattice question answer Q-xxx --text "Use X because..." --by human
lattice question list --pending true
```

## Output Format

All commands return JSON. Parse with standard tools.

## Daemon Management

```bash
lattice daemon start    # Start background daemon
lattice daemon stop     # Stop daemon
lattice daemon status   # Check if running
lattice daemon restart  # Restart daemon
```
