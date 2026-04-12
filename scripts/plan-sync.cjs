#!/usr/bin/env node
// Lattice PostToolUse hook for ExitPlanMode — auto-import plan file.
// Only imports if a project is already registered for this cwd.
// Only considers plan files modified within the last 60 seconds (safety for multi-project).
const { execSync } = require('child_process');
const { resolve, dirname } = require('path');
const { readdirSync, statSync } = require('fs');
const { homedir } = require('os');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const LATTICE = process.env.LATTICE_BIN || resolve(pluginRoot, 'bin', 'lattice');

function exec(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

const cwd = process.env.HOOK_CWD || process.cwd();

// Check if a project exists for this cwd
const dashboard = exec(`${LATTICE} dashboard --cwd "${cwd}"`);
if (!dashboard) {
  process.stderr.write(`[lattice] No project for ${cwd} — skipping plan auto-import\n`);
  process.exit(0);
}

// Extract project name from dashboard (first line: # Lattice: <name> — ...)
const projectMatch = dashboard.match(/^# Lattice: (\S+)/);
const projectName = projectMatch ? projectMatch[1] : null;

if (!projectName) {
  process.exit(0);
}

// Find plan files modified within the last 60 seconds (not just "most recent")
const plansDir = resolve(homedir(), '.claude', 'plans');
const MAX_AGE_MS = 60_000;
try {
  const now = Date.now();
  const files = readdirSync(plansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ name: f, mtime: statSync(resolve(plansDir, f)).mtimeMs }))
    .filter(f => (now - f.mtime) < MAX_AGE_MS)
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    process.stderr.write(`[lattice] No recently modified plan files (within ${MAX_AGE_MS / 1000}s) — skipping\n`);
    process.exit(0);
  }

  if (files.length > 1) {
    process.stderr.write(`[lattice] Warning: ${files.length} plan files modified recently, using most recent: ${files[0].name}\n`);
  }

  const latest = resolve(plansDir, files[0].name);
  const result = exec(`${LATTICE} plan import "${latest}" --project "${projectName}"`);
  if (result) {
    process.stderr.write(`[lattice] Auto-imported plan: ${files[0].name} → ${projectName}\n`);
  }
} catch {
  // Plans dir not found or import failed — silently skip
}
