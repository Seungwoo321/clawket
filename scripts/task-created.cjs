#!/usr/bin/env node
// Clawket TaskCreated hook: auto-start task when team agent task is created.
// Matches teammate_name to task assignee.
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

const teammateName = hookInput.teammate_name || '';
if (!teammateName) process.exit(0);

// Find todo task with matching assignee
const todoJson = exec(`${CLAWKET} task list --status todo`);
let todoTasks = [];
try { todoTasks = JSON.parse(todoJson || '[]'); } catch {}

const task = todoTasks.find(s => s.assignee === teammateName);
if (!task) process.exit(0);

// Auto-start: todo → in_progress
exec(`${CLAWKET} task update "${task.id}" --status in_progress --comment "자동 시작: 팀 에이전트 ${teammateName} 태스크 생성"`);

process.exit(0);
