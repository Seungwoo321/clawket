#!/usr/bin/env node
// Clawket PostToolUse hook: record file modifications and agent activity.
// Reads hook input from stdin (consistent with other hooks).
const { execSync } = require('child_process');
const { resolve, dirname, join } = require('path');
const { readFileSync } = require('fs');
const http = require('http');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const CLAWKET = process.env.CLAWKET_BIN || resolve(pluginRoot, 'bin', 'clawket');
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

const toolName = hookInput.tool_name || '';
const toolInput = hookInput.tool_input || {};
const toolResponse = hookInput.tool_response || {};


function exec(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

function getPort() {
  try {
    return readFileSync(join(require('os').homedir(), '.cache', 'clawket', 'clawketd.port'), 'utf-8').trim();
  } catch { return null; }
}

function apiPost(port, path, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const req = http.request(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

// ========== Edit/Write: record file modifications ==========
if (toolName === 'Edit' || toolName === 'Write') {
  const filePath = toolInput.file_path || '';
  if (!filePath || !sessionId) process.exit(0);

  try {
    const runsJson = exec(`${CLAWKET} run list --session-id "${sessionId}"`);
    const runs = JSON.parse(runsJson || '[]');
    const activeRun = runs.find(r => !r.ended_at);

    if (activeRun) {
      exec(`${CLAWKET} task append-body "${activeRun.task_id}" --text "\n[${toolName}] ${filePath}"`);
    } else {
      const port = getPort();
      if (port) {
        apiPost(port, '/activity', {
          entity_type: 'task',
          entity_id: 'session',
          action: 'updated',
          field: 'file_edit',
          new_value: `[${toolName}] ${filePath}`,
          actor: 'main',
        });
      }
    }
  } catch { /* ignore */ }
  process.exit(0);
}

// Agent/TeamCreate/SendMessage lifecycle is now handled by dedicated hooks:
// - SubagentStart/SubagentStop for Agent tool
// - TaskCreated/TaskCompleted for team agents
