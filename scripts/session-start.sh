#!/bin/sh
# Lattice SessionStart hook: ensure daemon running + inject dashboard context.
LATTICE="${LATTICE_BIN:-lattice}"

# 1. Ensure daemon is running (silent)
if ! "$LATTICE" daemon status >/dev/null 2>&1; then
  "$LATTICE" daemon start >/dev/null 2>&1
  for i in 1 2 3 4 5; do
    "$LATTICE" daemon status >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

# 2. Get dashboard context (single HTTP call to daemon)
CWD="${HOOK_CWD:-$(pwd)}"
CONTEXT=$("$LATTICE" dashboard --cwd "$CWD" 2>/dev/null)

if [ -z "$CONTEXT" ]; then
  echo '{"continue":true,"suppressOutput":true}'
  exit 0
fi

# 3. Output hook response with additionalContext
python3 -c "
import json, sys
ctx = sys.stdin.read()
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'SessionStart',
        'additionalContext': ctx
    }
}))
" <<EOF
$CONTEXT
EOF
