#!/usr/bin/env node
// Lattice PostToolUse hook for ExitPlanMode — auto-import plan file.
// Only imports if a project is already registered for this cwd.
// Does NOT create new projects automatically.
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
  // No project registered — do not auto-import
  process.stderr.write(`[lattice] No project for ${cwd} — skipping plan auto-import\n`);
  process.exit(0);
}

// Extract project name from dashboard (first line: # Lattice: <name> — ...)
const projectMatch = dashboard.match(/^# Lattice: (\S+)/);
const projectName = projectMatch ? projectMatch[1] : null;

if (!projectName) {
  process.exit(0);
}

// Find the most recently modified plan file
const plansDir = resolve(homedir(), '.claude', 'plans');
try {
  const files = readdirSync(plansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ name: f, mtime: statSync(resolve(plansDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length > 0) {
    const latest = resolve(plansDir, files[0].name);

    // Import with explicit project name (not cwd)
    const result = exec(`${LATTICE} plan import "${latest}" --project "${projectName}"`);
    if (result) {
      process.stderr.write(`[lattice] Auto-imported plan: ${files[0].name} → ${projectName}\n`);
    }
  }
} catch {
  // Plans dir not found or import failed — silently skip
}
