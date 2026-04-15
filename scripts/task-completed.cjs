#!/usr/bin/env node
// Clawket TaskCompleted hook: auto-complete task when team agent task finishes.
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

// Find in_progress task with matching assignee
const tasksJson = exec(`${CLAWKET} task list --status in_progress`);
let tasks = [];
try { tasks = JSON.parse(tasksJson || '[]'); } catch {}

const task = tasks.find(s => s.assignee === teammateName);
if (!task) process.exit(0);

// Auto-complete: in_progress → done
exec(`${CLAWKET} task update "${task.id}" --status done --comment "자동 완료: 팀 에이전트 ${teammateName} 태스크 완료"`);

process.exit(0);
