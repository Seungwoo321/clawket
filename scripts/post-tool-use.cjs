#!/usr/bin/env node
// Lattice PostToolUse hook: record file modifications to active run/step.
// Only triggers on Edit and Write tools to avoid DB bloat.
const { execSync } = require('child_process');
const { resolve, dirname } = require('path');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const LATTICE = process.env.LATTICE_BIN || resolve(pluginRoot, 'bin', 'lattice');
const toolName = process.env.HOOK_TOOL_NAME || '';
const toolInput = process.env.HOOK_TOOL_INPUT || '';
const sessionId = process.env.CLAUDE_SESSION_ID || '';

// Only record file modifications
if (toolName !== 'Edit' && toolName !== 'Write') {
  process.exit(0);
}

// Extract file path from tool input
let filePath = '';
try {
  const data = JSON.parse(toolInput);
  filePath = data.file_path || '';
} catch {}

if (!filePath || !sessionId) {
  process.exit(0);
}

function exec(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

// Find active (unfinished) run for this session
try {
  const runsJson = exec(`${LATTICE} run list --session-id "${sessionId}"`);
  const runs = JSON.parse(runsJson || '[]');
  const activeRun = runs.find(r => !r.ended_at);

  if (activeRun) {
    exec(`${LATTICE} step append-body "${activeRun.step_id}" --text "\n[${toolName}] ${filePath}"`);
  }
} catch {}
