#!/bin/sh
# Lattice Stop hook: finalize active runs on session end.
# No LLM calls — structured state recording only.

LATTICE="${LATTICE_BIN:-lattice}"
SESSION_ID="${CLAUDE_SESSION_ID:-}"

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

# Find active (unfinished) runs for this session and finish them
"$LATTICE" run list --session-id "$SESSION_ID" 2>/dev/null | python3 -c "
import json, sys, subprocess, os

lattice = os.environ.get('LATTICE_BIN', 'lattice')

try:
    runs = json.loads(sys.stdin.read())
except:
    sys.exit(0)

for r in runs:
    if not r.get('ended_at'):
        rid = r['id']
        subprocess.run(
            [lattice, 'run', 'finish', rid, '--result', 'session_ended', '--notes', 'Auto-closed by Stop hook'],
            capture_output=True
        )
" 2>/dev/null

exit 0
