#!/usr/bin/env node
// Lattice PreToolUse hook: enforce step registration before any work.
// - Agent/TeamCreate: block if no matching assignee step exists
// - Edit/Write/Bash: block if no active steps at all
// - Read-only tools: always allow
const { execSync } = require('child_process');
const { resolve, dirname } = require('path');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const LATTICE = process.env.LATTICE_BIN || resolve(pluginRoot, 'bin', 'lattice');

function exec(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

function allow() {
  console.log(JSON.stringify({}));
  process.exit(0);
}

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
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

const toolName = hookInput.tool_name || process.env.HOOK_TOOL_NAME || '';
const toolInput = hookInput.tool_input || {};

// Read-only tools — always allow
const READ_ONLY = new Set([
  'Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch',
  'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop',
  'ToolSearch', 'Skill', 'ScheduleWakeup',
  'mcp__playwright__browser_snapshot', 'mcp__playwright__browser_take_screenshot',
  'mcp__playwright__browser_navigate', 'mcp__playwright__browser_click',
  'mcp__playwright__browser_console_messages', 'mcp__playwright__browser_resize',
]);

if (READ_ONLY.has(toolName)) allow();

// Agent tools — need assignee-level check
const AGENT_TOOLS = new Set(['Agent', 'TeamCreate', 'SendMessage']);

// Mutating tools
const MUTATING_TOOLS = new Set(['Edit', 'Write', 'Bash', 'NotebookEdit']);

// If tool is neither agent nor mutating, allow
if (!AGENT_TOOLS.has(toolName) && !MUTATING_TOOLS.has(toolName)) allow();

// Bash: allow lattice CLI commands (can't register steps otherwise!)
if (toolName === 'Bash') {
  const cmd = (toolInput.command || '').trim();
  if (cmd.startsWith('lattice ') || cmd.includes('lattice ')) allow();
}

const cwd = hookInput.cwd || process.env.HOOK_CWD || process.cwd();
const context = exec(`${LATTICE} dashboard --cwd "${cwd}" --show active`);

if (!context) {
  // No lattice project — allow (not lattice-managed)
  allow();
}

const inProgressCount = (context.match(/^\s*\[>\]/gm) || []).length;

// Block all mutating work if no active steps
if (inProgressCount === 0) {
  deny('Lattice: 활성 스텝이 없습니다. 작업 전 `lattice step new` 또는 `lattice step update <ID> --status in_progress`를 실행하세요.');
}

// For agent tools, also check assignee match
if (AGENT_TOOLS.has(toolName)) {
  const agentName = toolInput.name || '';
  if (agentName && !context.includes(`@${agentName}`)) {
    deny(`Lattice: "${agentName}"에 대한 활성 스텝이 없습니다. \`lattice step new --assignee ${agentName}\`으로 먼저 등록하세요.`);
  }
}

allow();
