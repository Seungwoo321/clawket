#!/usr/bin/env node
// Clawket SubagentStop hook: auto-complete task when subagent finishes.
// Finds task by agent_id (bound at SubagentStart) and marks it done.
const { execSync } = require('child_process');
const { resolve, dirname } = require('path');
const fs = require('fs');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const CLAWKET = process.env.CLAWKET_BIN || resolve(pluginRoot, 'bin', 'clawket');

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
if (!agentId) process.exit(0);

// Find in_progress task with this agent_id
const tasksJson = exec(`${CLAWKET} task list --status in_progress --agent-id "${agentId}"`);
let tasks = [];
try { tasks = JSON.parse(tasksJson || '[]'); } catch {}

if (!tasks.length) process.exit(0);

const task = tasks[0];
const lastMsg = hookInput.last_assistant_message || '';
const summary = lastMsg.length > 500 ? lastMsg.slice(0, 500) + '...' : lastMsg;

// Append result summary to task body
if (summary) {
  exec(`${CLAWKET} task append-body "${task.id}" --text "\n[SubagentStop] ${summary.replace(/"/g, '\\"')}"`);
}

// Auto-complete: in_progress → done
exec(`${CLAWKET} task update "${task.id}" --status done --comment "자동 완료: 에이전트 종료 (agent_id: ${agentId})"`);

process.exit(0);
