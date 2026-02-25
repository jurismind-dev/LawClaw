#!/usr/bin/env node
/**
 * Dev script - launches vite with proper environment
 * Unsets ELECTRON_RUN_AS_NODE to ensure Electron runs as GUI app
 */
import { spawn } from 'child_process';

const env = {
  ...process.env,
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
