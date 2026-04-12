#!/usr/bin/env node
// Lattice PostToolUse hook: record file modifications.
// Reads hook input from stdin (consistent with other hooks).
// If active Run exists → append to step body.
// If no Run → record to activity_log via API.
const { execSync } = require('child_process');
const { resolve, dirname, join } = require('path');
const { readFileSync } = require('fs');
const http = require('http');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const LATTICE = process.env.LATTICE_BIN || resolve(pluginRoot, 'bin', 'lattice');
const sessionId = process.env.CLAUDE_SESSION_ID || '';

// Read hook input from stdin
let hookInput = {};
try {
  const chunks = [];
  const fd = require('fs').openSync('/dev/stdin', 'r');
  const buf = Buffer.alloc(65536);
  let n;
  while ((n = require('fs').readSync(fd, buf)) > 0) chunks.push(buf.slice(0, n));
  require('fs').closeSync(fd);
  hookInput = JSON.parse(Buffer.concat(chunks).toString());
} catch { /* ignore */ }

const toolName = hookInput.tool_name || process.env.HOOK_TOOL_NAME || '';
const toolInput = hookInput.tool_input || {};

// Only record file modifications
if (toolName !== 'Edit' && toolName !== 'Write') process.exit(0);

const filePath = toolInput.file_path || '';
if (!filePath || !sessionId) process.exit(0);

function exec(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

// Try to find active run for this session
try {
  const runsJson = exec(`${LATTICE} run list --session-id "${sessionId}"`);
  const runs = JSON.parse(runsJson || '[]');
  const activeRun = runs.find(r => !r.ended_at);

  if (activeRun) {
    // Append to step body
    exec(`${LATTICE} step append-body "${activeRun.step_id}" --text "\n[${toolName}] ${filePath}"`);
  } else {
    // No active run — record to activity_log via API
    let port;
    try {
      const portFile = join(require('os').homedir(), '.cache', 'lattice', 'latticed.port');
      port = readFileSync(portFile, 'utf-8').trim();
    } catch { process.exit(0); }

    const payload = JSON.stringify({
      entity_type: 'step',
      entity_id: 'session',
      action: 'updated',
      field: 'file_edit',
      new_value: `[${toolName}] ${filePath}`,
      actor: 'main',
    });
    const req = http.request(`http://127.0.0.1:${port}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  }
} catch { /* ignore */ }
