#!/usr/bin/env node
// Clawket Stop hook: finalize active runs for this session.
// Unit/Plan/Cycle auto-completion is handled by the daemon (repo.js).
const { execSync } = require('child_process');
const { resolve, dirname } = require('path');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const CLAWKET = process.env.CLAWKET_BIN || resolve(pluginRoot, 'bin', 'clawket');
const sessionId = process.env.CLAUDE_SESSION_ID || '';

if (!sessionId) process.exit(0);

function exec(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

try {
  const runsJson = exec(`${CLAWKET} run list --session-id "${sessionId}"`);
  const runs = JSON.parse(runsJson || '[]');
  for (const run of runs) {
    if (!run.ended_at) {
      exec(`${CLAWKET} run finish "${run.id}" --result session_ended --notes "Auto-closed by Stop hook"`);
    }
  }
} catch {}
