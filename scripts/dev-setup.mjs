#!/usr/bin/env node
/**
 * Dev setup script - launches vite with FORCE_SETUP=true
 * This ensures the environment variable is passed to electron subprocess
 */
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { patchOpenClawWebSearchRuntime } = require('./openclaw-bundle-compat.cjs');

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const openclawDir = path.join(projectRoot, 'node_modules', 'openclaw');
const patchedRuntimeFiles = patchOpenClawWebSearchRuntime(openclawDir);

if (patchedRuntimeFiles.length > 0) {
  console.log(`[dev-setup] Patched OpenClaw doubao web_search runtime: ${patchedRuntimeFiles.join(', ')}`);
}

const env = {
  ...process.env,
  FORCE_SETUP: 'true',
  // Unset ELECTRON_RUN_AS_NODE to ensure Electron runs as GUI app, not Node.js
  ELECTRON_RUN_AS_NODE: undefined,
};

const child = spawn('pnpm', ['exec', 'vite'], {
  stdio: 'inherit',
  env,
  shell: true,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
