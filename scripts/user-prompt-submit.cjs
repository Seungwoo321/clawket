#!/usr/bin/env node
// Lattice UserPromptSubmit hook: inject active step context every turn.
const { execSync } = require('child_process');
const { resolve, dirname } = require('path');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const LATTICE = process.env.LATTICE_BIN || resolve(pluginRoot, 'bin', 'lattice');

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
const context = exec(`${LATTICE} dashboard --cwd "${cwd}" --show active`);

if (!context) {
  // No lattice project — pass through
  console.log(JSON.stringify({}));
  process.exit(0);
}

// Parse in_progress steps
const inProgressSteps = [];
for (const line of context.split('\n')) {
  const match = line.match(/^\s*\[>\]\s+(.+?)\s+\(STEP-(\S+)\)\s*(.*)$/);
  if (match) {
    inProgressSteps.push({
      title: match[1].trim(),
      id: `STEP-${match[2]}`,
      meta: match[3].trim(),
    });
  }
}

if (inProgressSteps.length > 0) {
  const stepList = inProgressSteps
    .map(s => `- [${s.id}] ${s.title}${s.meta ? ` (${s.meta})` : ''}`)
    .join('\n');

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: `# Active Lattice Steps\n${stepList}`,
    },
  }));
} else {
  // No active steps — warn via context (UserPromptSubmit cannot block)
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: '# Lattice: 활성 스텝 없음 — 작업 전 스텝 등록 필요',
    },
  }));
}
