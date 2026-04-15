#!/usr/bin/env node
// Clawket SubagentStart hook: resolve agent_id → task_id mapping.
// Reads pending queue (written by PreToolUse) and binds agent_id to task.
const { execSync } = require('child_process');
const { resolve, dirname, join } = require('path');
const fs = require('fs');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const CLAWKET = process.env.CLAWKET_BIN || resolve(pluginRoot, 'bin', 'clawket');
const PENDING_FILE = join(require('os').homedir(), '.cache', 'clawket', 'agent-pending.json');

function exec(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

// Read hook input from stdin
let hookInput = {};
try {
  const chunks = [];
  const fd = fs.openSync('/dev/stdin', 'r');
  const buf = Buffer.alloc(65536);
  let n;
  while ((n = fs.readSync(fd, buf)) > 0) chunks.push(Buffer.from(buf.slice(0, n)));
  fs.closeSync(fd);
  hookInput = JSON.parse(Buffer.concat(chunks).toString());
} catch {}

const agentId = hookInput.agent_id || '';
const agentType = hookInput.agent_type || 'general-purpose';

if (!agentId) process.exit(0);

// Read pending queue
let pending = [];
try { pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8')); } catch { process.exit(0); }
if (!pending.length) process.exit(0);

// FIFO match by subagent_type
const normalizedType = agentType || 'general-purpose';
const idx = pending.findIndex(p => (p.subagent_type || 'general-purpose') === normalizedType);
if (idx === -1) process.exit(0);

const matched = pending.splice(idx, 1)[0];

// Write back remaining pending entries (or remove file if empty)
if (pending.length) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending));
} else {
  try { fs.unlinkSync(PENDING_FILE); } catch {}
}

// Bind agent_id to task in Clawket DB
exec(`${CLAWKET} task update "${matched.task_id}" --agent-id "${agentId}"`);

process.exit(0);
