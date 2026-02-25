#!/usr/bin/env node
/**
 * Dev setup script - launches vite with FORCE_SETUP=true
 * This ensures the environment variable is passed to electron subprocess
 */
import { spawn } from 'child_process';

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
