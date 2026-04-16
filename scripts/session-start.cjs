#!/usr/bin/env node
// Clawket SessionStart hook: ensure daemon running + inject dashboard context + rules.
const { execSync } = require('child_process');
const { readFileSync } = require('fs');
const { resolve, dirname } = require('path');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const CLAWKET = process.env.CLAWKET_BIN || resolve(pluginRoot, 'bin', 'clawket');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function exec(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

function ensureDeps() {
  const daemonDir = resolve(pluginRoot, 'daemon');
  const nodeModules = resolve(daemonDir, 'node_modules');
  const { existsSync, writeFileSync } = require('fs');
  if (existsSync(resolve(daemonDir, 'package.json')) && !existsSync(nodeModules)) {
    process.stderr.write(`[clawket] Installing daemon dependencies...\n`);
    // Ensure .npmrc exists for flat node_modules (dotfiles may not be copied to plugin cache)
    const npmrc = resolve(daemonDir, '.npmrc');
    if (!existsSync(npmrc)) {
      writeFileSync(npmrc, 'node-linker=hoisted\n');
    }
    try {
      execSync('pnpm --version', { stdio: 'pipe' });
      execSync('pnpm install --prod', { cwd: daemonDir, stdio: ['pipe', 'pipe', process.stderr], timeout: 120000 });
      process.stderr.write(`[clawket] Dependencies installed (pnpm)\n`);
    } catch {
      try {
        execSync('npm install --production', { cwd: daemonDir, stdio: ['pipe', 'pipe', process.stderr], timeout: 120000 });
        process.stderr.write(`[clawket] Dependencies installed (npm)\n`);
      } catch (e) {
        process.stderr.write(`[clawket] ERROR: Failed to install dependencies: ${e.message}\n`);
      }
    }
  }
}

function ensureDaemon() {
  ensureDeps();
  const status = exec(`${CLAWKET} daemon status`);
  if (!status.includes('running')) {
    exec(`${CLAWKET} daemon start`);
    for (let i = 0; i < 5; i++) {
      if (exec(`${CLAWKET} daemon status`).includes('running')) return;
      execSync('sleep 0.5');
    }
  }
}

function buildSummary(context) {
  const done = (context.match(/^\s*\[x\]/gm) || []).length;
  const inProg = (context.match(/^\s*\[>\]/gm) || []).length;
  const todo = (context.match(/^\s*\[ \]/gm) || []).length;
  const blocked = (context.match(/^\s*\[!\]/gm) || []).length;
  const activeUnits = (context.match(/— active/g) || []).length;

  const firstLine = context.split('\n')[0].replace(/^#\s*/, '').trim();
  const name = firstLine.length > 55 ? firstLine.slice(0, 52) + '...' : firstLine;

  const lines = [];
  lines.push(`${C.bold}${C.cyan}Clawket${C.reset} ${C.dim}${name}${C.reset}`);
  lines.push(
    `${C.green}✓ ${done} done${C.reset}  ` +
    `${C.yellow}◐ ${inProg} active${C.reset}  ` +
    `${C.blue}○ ${todo} todo${C.reset}  ` +
    (blocked > 0 ? `${C.red}⊘ ${blocked} blocked${C.reset}  ` : '') +
    `${C.gray}(${activeUnits} active unit)${C.reset}`
  );

  // 1. In-progress tasks (이어서 할 것) — Unit 목록에서만 수집, 특수 섹션 제외
  const contextLines = context.split('\n');
  let currentUnit = '';
  let inSpecialSection = false;
  const inProgressTasks = [];
  const seen = new Set();

  for (const line of contextLines) {
    if (line.startsWith('## Recent') || line.startsWith('## In Progress') || line.startsWith('## Pending Q') || line.startsWith('Commands:')) {
      inSpecialSection = true;
    } else if (line.startsWith('## ')) {
      inSpecialSection = false;
      currentUnit = line.replace(/^## /, '').replace(/\s*\(UNIT-.*$/, '').trim();
    }
    if (inSpecialSection) continue;

    const progMatch = line.match(/^\s*\[>\] (.+?) \(TASK-/);
    if (progMatch && !seen.has(progMatch[1])) {
      seen.add(progMatch[1]);
      inProgressTasks.push({ title: progMatch[1], unit: currentUnit });
    }
  }

  if (inProgressTasks.length > 0) {
    lines.push('');
    lines.push(`  ${C.bold}In Progress${C.reset}`);
    for (const s of inProgressTasks) {
      lines.push(`    ${C.yellow}◐${C.reset} ${C.dim}${s.unit}${C.reset} ${s.title}`);
    }
  }

  // 2. Recent activity (이전 세션에서 다룬 것)
  const recentSection = context.indexOf('## Recent Activity');
  if (recentSection !== -1) {
    const recentLines = context.slice(recentSection).split('\n').slice(1);
    const recentItems = [];
    for (const line of recentLines) {
      if (line.startsWith('##') || line.trim() === '') break;
      const match = line.match(/^\s*@(\S+) → (.+?) \[(.+?)\](.*)/);
      if (match) {
        const [, agent, title, status, notes] = match;
        recentItems.push({ agent, title: title.trim(), status, notes: notes.replace(/^ — /, '').trim() });
      }
    }
    if (recentItems.length > 0) {
      lines.push('');
      lines.push(`  ${C.bold}Recent${C.reset}`);
      for (const r of recentItems) {
        const statusColor = r.status.includes('done') ? C.green : C.yellow;
        const note = r.notes ? ` ${C.dim}${r.notes.slice(0, 50)}${C.reset}` : '';
        lines.push(`    ${statusColor}${r.status}${C.reset} ${r.title} ${C.gray}@${r.agent}${C.reset}${note}`);
      }
    }
  }

  return lines.join('\n');
}

// Load rules (static, injected once at SessionStart)
let rules = '';
try {
  rules = readFileSync(resolve(pluginRoot, 'prompts', 'rules.md'), 'utf-8').trim();
} catch {}

// Resolve web URL once
function getWebUrl() {
  try {
    const portFile = require('path').join(require('os').homedir(), '.cache', 'clawket', 'clawketd.port');
    const port = readFileSync(portFile, 'utf-8').trim();
    return `http://localhost:${port}`;
  } catch { return ''; }
}

// Main
ensureDaemon();
const cwd = process.env.HOOK_CWD || process.cwd();

// Active-only context for Claude (completed plans/units available via `clawket plan list --status completed`)
const context = exec(`${CLAWKET} dashboard --cwd "${cwd}" --show active`);
const webUrl = getWebUrl();

if (!context) {
  const noProjectMsg = `Clawket: No project registered for this directory.\nRun: clawket project new "<name>" --cwd "${cwd}"`;
  const statusLine = webUrl
    ? `  ${C.dim}Web: ${C.reset}${C.cyan}${webUrl}${C.reset}`
    : '';
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: noProjectMsg + (rules ? '\n\n' + rules : '') },
    systemMessage: `${C.cyan}Clawket${C.reset} ${C.dim}active${C.reset} ${C.yellow}— no project for this directory${C.reset}` + (statusLine ? '\n' + statusLine : '')
  }));
  process.exit(0);
}

const summary = buildSummary(context);

const statusLine = webUrl
  ? `${C.dim}Daemon: ${C.reset}${C.green}running${C.reset} ${C.dim}Web: ${C.reset}${C.cyan}${webUrl}${C.reset}`
  : `${C.dim}Daemon: ${C.reset}${C.green}running${C.reset}`;

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: context + (rules ? '\n\n' + rules : '')
  },
  systemMessage: summary + '\n' + statusLine
}));
