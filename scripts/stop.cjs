#!/usr/bin/env node
// Lattice Stop hook: finalize active runs on session end.
// No LLM calls — structured state recording only.
const { execSync } = require('child_process');
const { resolve, dirname } = require('path');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const LATTICE = process.env.LATTICE_BIN || resolve(pluginRoot, 'bin', 'lattice');
const sessionId = process.env.CLAUDE_SESSION_ID || '';

if (!sessionId) process.exit(0);

function exec(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

// Find active (unfinished) runs for this session and finish them
try {
  const runsJson = exec(`${LATTICE} run list --session-id "${sessionId}"`);
  const runs = JSON.parse(runsJson || '[]');

  for (const run of runs) {
    if (!run.ended_at) {
      exec(`${LATTICE} run finish "${run.id}" --result session_ended --notes "Auto-closed by Stop hook"`);
    }
  }
} catch {}
