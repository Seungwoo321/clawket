#!/usr/bin/env node
// Dev-only: reset Clawket plugin install state for fresh-install testing.
//
// Flow:
//   1. (Banner) Show optional `/plugin marketplace add` command — for first
//      time setup. Skipped silently if user already has the marketplace.
//   2. Stop the running daemon (clawket daemon stop, then pkill fallback).
//   3. Remove the plugin cache (~/.claude/plugins/cache/clawket/**).
//   4. Remove daemon socket / port / pid lock files (~/.cache/clawket/*).
//   5. Print the /plugin uninstall command for the user to run inside
//      Claude Code.
//   6. Prompt whether to also wipe plugin-external user data:
//        - ~/.local/share/clawket  (SQLite DB)
//        - ~/.config/clawket       (config)
//        - ~/.local/state/clawket  (logs)
//      Yes → delete; No → preserve.
//   7. Show a completion summary of what was removed / preserved.
//   8. Print the /plugin install command to finish the fresh-install test.
//   9. (Banner) Show optional `/plugin marketplace remove` command for
//      cleanup after testing.
//
// What it never touches:
//   - ~/.claude.json or any user-scope MCP settings.

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const HOME = os.homedir();
const PLUGIN_CACHE = path.join(HOME, '.claude', 'plugins', 'cache', 'clawket');
const RUNTIME_CACHE = path.join(HOME, '.cache', 'clawket');
const DATA_DIR = path.join(HOME, '.local', 'share', 'clawket');
const CONFIG_DIR = path.join(HOME, '.config', 'clawket');
const STATE_DIR = path.join(HOME, '.local', 'state', 'clawket');

const MARKETPLACE_ADD = '/plugin marketplace add clawket/clawket';
const PLUGIN_UNINSTALL = '/plugin uninstall clawket@clawket';
const PLUGIN_INSTALL = '/plugin install   clawket@clawket';
const MARKETPLACE_REMOVE = '/plugin marketplace remove clawket';

const summary = { removed: [], preserved: [] };

function log(msg) { process.stdout.write(`[fresh-install] ${msg}\n`); }
function warn(msg) { process.stderr.write(`[fresh-install] ${msg}\n`); }

function banner(title, lines) {
  process.stdout.write([
    '',
    '─────────────────────────────────────────────────────────────',
    ` ${title}`,
    '─────────────────────────────────────────────────────────────',
    '',
    ...lines.map((l) => l ? ` ${l}` : ''),
    '',
  ].join('\n'));
}

function stopDaemon() {
  log('stopping daemon...');
  spawnSync('clawket', ['daemon', 'stop'], { stdio: 'ignore' });
  spawnSync('pkill', ['-f', 'clawketd'], { stdio: 'ignore' });
}

function rmrf(p) {
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { recursive: true, force: true });
  return true;
}

function cleanRuntimeCache() {
  if (!fs.existsSync(RUNTIME_CACHE)) return;
  for (const name of ['clawketd.sock', 'clawketd.port', 'clawketd.pid']) {
    const p = path.join(RUNTIME_CACHE, name);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true });
      log(`removed ${p}`);
      summary.removed.push(p);
    }
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

async function maybeWipeUserData() {
  const targets = [
    { label: 'SQLite DB', path: DATA_DIR },
    { label: 'config',    path: CONFIG_DIR },
    { label: 'state/log', path: STATE_DIR },
  ];
  const present = targets.filter((t) => fs.existsSync(t.path));
  if (present.length === 0) {
    log('no plugin-external user data found — nothing to prompt.');
    return;
  }

  process.stdout.write('\nPlugin-external user data found:\n');
  for (const t of present) process.stdout.write(`  - ${t.label}: ${t.path}\n`);

  const answer = (await ask('\nAlso delete the above (DB + config + state)? [y/N]: ')).trim().toLowerCase();
  if (answer === 'y' || answer === 'yes') {
    for (const t of present) {
      rmrf(t.path);
      log(`removed ${t.path}`);
      summary.removed.push(`${t.label}: ${t.path}`);
    }
  } else {
    for (const t of present) summary.preserved.push(`${t.label}: ${t.path}`);
    log('preserved plugin-external user data.');
  }
}

function printSummary() {
  banner('Cleanup complete', [
    'Removed:',
    ...(summary.removed.length ? summary.removed.map((p) => `  - ${p}`) : ['  (nothing)']),
    '',
    'Preserved:',
    ...(summary.preserved.length ? summary.preserved.map((p) => `  - ${p}`) : ['  (nothing)']),
  ]);
}

(async function main() {
  banner('Step 1 / Optional — add marketplace (skip if already added)', [
    'Inside a Claude Code session, run:',
    '',
    `   ${MARKETPLACE_ADD}`,
  ]);

  stopDaemon();
  if (rmrf(PLUGIN_CACHE)) {
    log(`removed ${PLUGIN_CACHE}`);
    summary.removed.push(PLUGIN_CACHE);
  } else {
    log(`plugin cache not present at ${PLUGIN_CACHE} (skipped)`);
  }
  cleanRuntimeCache();

  banner('Step 2 — uninstall the plugin', [
    'Inside a Claude Code session, run:',
    '',
    `   ${PLUGIN_UNINSTALL}`,
  ]);

  await maybeWipeUserData();
  printSummary();

  banner('Step 3 — reinstall the plugin (fresh install)', [
    'Inside a Claude Code session, run:',
    '',
    `   ${PLUGIN_INSTALL}`,
    '',
    'Then start a new Claude Code session and verify the MCP tools',
    'are exposed (mcp__clawket__*).',
  ]);

  banner('Optional — remove the marketplace after testing', [
    `   ${MARKETPLACE_REMOVE}`,
  ]);
})();
