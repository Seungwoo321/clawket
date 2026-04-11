#!/usr/bin/env node
// Lattice plugin setup: install CLI binary and daemon dependencies.
// Runs once on `claude plugin install`.
const { execSync } = require('child_process');
const { existsSync, mkdirSync, copyFileSync, chmodSync } = require('fs');
const { resolve, dirname } = require('path');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(__filename), '..');
const dataDir = process.env.LATTICE_DATA_DIR || resolve(process.env.HOME, '.local', 'share', 'lattice');
const cacheDir = process.env.LATTICE_CACHE_DIR || resolve(process.env.HOME, '.cache', 'lattice');
const stateDir = process.env.LATTICE_STATE_DIR || resolve(process.env.HOME, '.local', 'state', 'lattice');
const configDir = process.env.LATTICE_CONFIG_DIR || resolve(process.env.HOME, '.config', 'lattice');
const binDir = resolve(pluginRoot, 'bin');

function log(msg) {
  console.error(`[lattice-setup] ${msg}`);
}

function exec(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
}

// 1. Create XDG directories
for (const dir of [dataDir, cacheDir, stateDir, configDir, binDir]) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    log(`Created ${dir}`);
  }
}

// 2. Check for pre-built CLI binary in bin/
const cliBin = resolve(binDir, 'lattice');
if (existsSync(cliBin)) {
  log('CLI binary found in bin/');
} else {
  // Try to build from source if Rust toolchain is available
  try {
    exec('cargo --version');
    const cliSrc = resolve(pluginRoot, '..', 'lattice-dev', 'cli');
    if (existsSync(resolve(cliSrc, 'Cargo.toml'))) {
      log('Building CLI from source...');
      exec('cargo build --release', { cwd: cliSrc, timeout: 300000 });
      const built = resolve(cliSrc, 'target', 'release', 'lattice');
      if (existsSync(built)) {
        copyFileSync(built, cliBin);
        chmodSync(cliBin, 0o755);
        log('CLI binary built and installed');
      }
    } else {
      log('WARNING: No CLI source found. Please place the lattice binary in bin/');
    }
  } catch {
    log('WARNING: Rust toolchain not found. Please place the lattice binary in bin/');
    log(`  Expected path: ${cliBin}`);
  }
}

// 3. Install daemon dependencies
const daemonDir = resolve(pluginRoot, '..', 'lattice-dev', 'daemon');
if (existsSync(resolve(daemonDir, 'package.json'))) {
  try {
    log('Installing daemon dependencies...');
    exec('npm install --production', { cwd: daemonDir, timeout: 60000 });
    log('Daemon dependencies installed');
  } catch (e) {
    log(`WARNING: Failed to install daemon dependencies: ${e.message}`);
  }
}

// 4. Set up LATTICE_BIN environment hint
log('');
log('Setup complete!');
log(`  CLI binary: ${cliBin}`);
log(`  Data dir:   ${dataDir}`);
log(`  Cache dir:  ${cacheDir}`);
log('');
log('If the CLI binary was not auto-built, download it from:');
log('  https://github.com/Seungwoo321/lattice/releases');
log('and place it at: ' + cliBin);
