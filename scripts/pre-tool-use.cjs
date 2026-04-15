#!/usr/bin/env node
// Clawket PreToolUse hook: enforce task registration before any work.
// - Agent/TeamCreate: block if no matching assignee task exists
// - Edit/Write/Bash: block if no active tasks at all
// - Read-only tools: always allow
const { execSync } = require('child_process');
const { resolve, dirname } = require('path');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const CLAWKET = process.env.CLAWKET_BIN || resolve(pluginRoot, 'bin', 'clawket');

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
  'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop',
  'ToolSearch', 'Skill', 'ScheduleWakeup',
  'mcp__playwright__browser_snapshot', 'mcp__playwright__browser_take_screenshot',
  'mcp__playwright__browser_navigate', 'mcp__playwright__browser_click',
  'mcp__playwright__browser_console_messages', 'mcp__playwright__browser_resize',
]);

// Task tools that create/modify — require Clawket task like other mutating tools
const TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate']);

if (READ_ONLY.has(toolName)) allow();

// Agent tools — need assignee-level check
const AGENT_TOOLS = new Set(['Agent', 'TeamCreate', 'SendMessage']);

// Mutating tools
const MUTATING_TOOLS = new Set(['Edit', 'Write', 'Bash', 'NotebookEdit']);

// If tool is neither agent, mutating, nor task-creating, allow
if (!AGENT_TOOLS.has(toolName) && !MUTATING_TOOLS.has(toolName) && !TASK_TOOLS.has(toolName)) allow();

// Bash: allow clawket CLI commands (can't register tasks otherwise!)
// Also allow read-only / verification commands without an active task.
if (toolName === 'Bash') {
  const cmd = (toolInput.command || '').trim();
  if (cmd.startsWith('clawket ') || cmd.includes('clawket ')) allow();

  // Read-only / verification patterns — safe to run without an active task
  const READ_ONLY_BASH = [
    /^(npx\s+)?tsc(\s|$)/,          // type-check
    /^(npx\s+)?eslint(\s|$)/,       // lint
    /^(npx\s+)?prettier(\s|$)/,     // format check
    /^(npm|pnpm|yarn|bun)\s+test/,  // test runners
    /^(npm|pnpm|yarn|bun)\s+run\s+(test|lint|check|typecheck|build)/,
    /^(npx|pnpm\s+exec)\s+vitest/,  // vitest
    /^(npx|pnpm\s+exec)\s+jest/,    // jest
    /^git\s+(status|log|diff|show|branch|stash\s+list|remote|tag)/,  // git read-only
    /^(ls|pwd|wc|du|df|which|where|type|file|stat)\b/,  // filesystem info
    /^(cat|head|tail|less|more)\s/,  // file reading (fallback)
    /^(curl|wget)\s/,               // network fetch
    /^(node|python3?|ruby)\s+-e\s/, // one-liner eval
    /^echo\s/,                      // echo
    /^(docker|podman)\s+(ps|images|logs|inspect)/,  // container read-only
    /^cargo\s+(check|test|clippy)/,  // rust read-only
    /^lsof\s/,                      // process info
  ];
  if (READ_ONLY_BASH.some(re => re.test(cmd))) allow();
}

const cwd = hookInput.cwd || process.env.HOOK_CWD || process.cwd();

// Check if this is a clawket-managed project
const context = exec(`${CLAWKET} dashboard --cwd "${cwd}" --show active`);
if (!context) {
  // No clawket project — allow (not clawket-managed)
  allow();
}

// Directly query in_progress tasks instead of parsing dashboard output
const tasksJson = exec(`${CLAWKET} task list --status in_progress`);
let inProgressTasks = [];
try { inProgressTasks = JSON.parse(tasksJson || '[]'); } catch { inProgressTasks = []; }

// Block all mutating work if no active tasks
if (inProgressTasks.length === 0) {
  deny('Clawket: 활성 태스크가 없습니다. 작업 전 `clawket task new` 또는 `clawket task update <ID> --status in_progress`를 실행하세요.');
}

// For agent tools: auto-start matching task + push to pending queue for SubagentStart
if (AGENT_TOOLS.has(toolName)) {
  const agentName = toolInput.name || '';

  if (agentName) {
    // Check if there's an in_progress task for this agent
    const agentInProgress = inProgressTasks.find(s => s.assignee === agentName);
    let taskForAgent = agentInProgress;

    if (!agentInProgress) {
      // No in_progress task — look for a todo task to auto-start
      const todoJson = exec(`${CLAWKET} task list --status todo`);
      let todoTasks = [];
      try { todoTasks = JSON.parse(todoJson || '[]'); } catch { todoTasks = []; }
      const todoForAgent = todoTasks.find(s => s.assignee === agentName);

      if (todoForAgent) {
        // Auto-start: todo → in_progress
        exec(`${CLAWKET} task update "${todoForAgent.id}" --status in_progress`);
        taskForAgent = todoForAgent;
      } else {
        deny(`Clawket: "${agentName}"에 대한 태스크가 없습니다. \`clawket task new --assignee ${agentName}\`으로 먼저 등록하세요.`);
      }
    }

    // Push to pending queue for SubagentStart to resolve agent_id
    if (taskForAgent) {
      const pendingFile = join(require('os').homedir(), '.cache', 'clawket', 'agent-pending.json');
      let pending = [];
      try { pending = JSON.parse(require('fs').readFileSync(pendingFile, 'utf-8')); } catch {}
      pending.push({
        name: agentName,
        task_id: taskForAgent.id,
        subagent_type: toolInput.subagent_type || 'general-purpose',
        ts: Date.now(),
      });
      require('fs').writeFileSync(pendingFile, JSON.stringify(pending));
    }

    // Inject task context into agent prompt
    const taskContext = taskForAgent
      ? `\n\n---\n[Clawket] 작업 티켓: ${taskForAgent.ticket_number} — ${taskForAgent.title}\nTask ID: ${taskForAgent.id}`
      : '';
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: taskContext,
      },
    }));
    process.exit(0);
  }
}

allow();
