#!/bin/sh
# Lattice PostToolUse hook: record file modifications to active run/step.
# Only triggers on Edit and Write tools to avoid DB bloat.

TOOL_NAME="${HOOK_TOOL_NAME:-}"
TOOL_INPUT="${HOOK_TOOL_INPUT:-}"

# Only record file modifications
case "$TOOL_NAME" in
  Edit|Write) ;;
  *) echo '{"continue":true,"suppressOutput":true}'; exit 0 ;;
esac

LATTICE="${LATTICE_BIN:-lattice}"

# Extract file path from tool input (JSON)
FILE_PATH=$(echo "$TOOL_INPUT" | python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    print(data.get('file_path', ''))
except:
    print('')
" 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  echo '{"continue":true,"suppressOutput":true}'
  exit 0
fi

# Find active in_progress run for current session
SESSION_ID="${CLAUDE_SESSION_ID:-}"
if [ -n "$SESSION_ID" ]; then
  # Append to active run's step body
  ACTIVE_RUN=$("$LATTICE" run list --session-id "$SESSION_ID" 2>/dev/null | python3 -c "
import json, sys
try:
    runs = json.loads(sys.stdin.read())
    active = [r for r in runs if not r.get('ended_at')]
    if active:
        print(active[0]['step_id'])
except:
    pass
" 2>/dev/null)

  if [ -n "$ACTIVE_RUN" ]; then
    "$LATTICE" step append-body "$ACTIVE_RUN" --text "
[${TOOL_NAME}] ${FILE_PATH}" >/dev/null 2>&1
  fi
fi

echo '{"continue":true,"suppressOutput":true}'
