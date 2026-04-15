#!/usr/bin/env node
// Clawket UserPromptSubmit hook: inject active task context every turn.
const { execSync } = require('child_process');
const { resolve, dirname } = require('path');

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
  const fd = require('fs').openSync('/dev/stdin', 'r');
  const buf = Buffer.alloc(65536);
  let n;
  while ((n = require('fs').readSync(fd, buf)) > 0) chunks.push(buf.slice(0, n));
  require('fs').closeSync(fd);
  hookInput = JSON.parse(Buffer.concat(chunks).toString());
} catch {}

const cwd = hookInput.cwd || process.env.HOOK_CWD || process.cwd();

// Fetch active steps
const context = exec(`${CLAWKET} dashboard --cwd "${cwd}" --show active`);

if (!context) {
  // No clawket project — pass through
  console.log(JSON.stringify({}));
  process.exit(0);
}

// Parse in_progress tasks
const inProgressTasks = [];
for (const line of context.split('\n')) {
  const match = line.match(/^\s*\[>\]\s+(.+?)\s+\(TASK-(\S+)\)\s*(.*)$/);
  if (match) {
    inProgressTasks.push({
      title: match[1].trim(),
      id: `TASK-${match[2]}`,
      meta: match[3].trim(),
    });
  }
}

if (inProgressTasks.length > 0) {
  const taskList = inProgressTasks
    .map(s => `- [${s.id}] ${s.title}${s.meta ? ` (${s.meta})` : ''}`)
    .join('\n');

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: `# Active Clawket Tasks\n${taskList}`,
    },
  }));
} else {
  // No active tasks — warn via context (UserPromptSubmit cannot block)
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: '# Clawket: 활성 태스크 없음 — 작업 전 태스크 등록 필요',
    },
  }));
}
