#!/usr/bin/env node
/**
 * Dev script - launches vite with proper environment
 * Unsets ELECTRON_RUN_AS_NODE to ensure Electron runs as GUI app
 */
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  patchOpenClawPluginSdkCompat,
  patchOpenClawWebSearchRuntime,
  patchOpenClawKillTreeRuntime,
  patchOpenClawExecRuntime,
  patchOpenClawModelCatalogRuntime,
  patchOpenClawWindowsSpawnRuntime,
  patchOpenClawBonjourServiceNameRuntime,
} = require('./openclaw-bundle-compat.cjs');

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const openclawDir = path.join(projectRoot, 'node_modules', 'openclaw');
const patchedRuntimeFiles = patchOpenClawWebSearchRuntime(openclawDir);
const patchedBonjourServiceNameFiles = patchOpenClawBonjourServiceNameRuntime(openclawDir);
const patchedWindowsSpawnFiles = patchOpenClawWindowsSpawnRuntime(openclawDir);
const patchedExecRuntimeFiles = patchOpenClawExecRuntime(openclawDir);
const patchedKillTreeFiles = patchOpenClawKillTreeRuntime(openclawDir);
const patchedModelCatalogFiles = patchOpenClawModelCatalogRuntime(openclawDir);
const patchedPluginSdkCompatFiles = patchOpenClawPluginSdkCompat(openclawDir);

if (patchedRuntimeFiles.length > 0) {
  console.log(`[dev] Patched OpenClaw doubao web_search runtime: ${patchedRuntimeFiles.join(', ')}`);
}
if (patchedBonjourServiceNameFiles.length > 0) {
  console.log(`[dev] Patched OpenClaw Bonjour service-name runtime: ${patchedBonjourServiceNameFiles.join(', ')}`);
}
if (patchedWindowsSpawnFiles.length > 0) {
  console.log(`[dev] Patched OpenClaw Windows spawn runtime: ${patchedWindowsSpawnFiles.join(', ')}`);
}
if (patchedExecRuntimeFiles.length > 0) {
  console.log(`[dev] Patched OpenClaw Windows exec runtime: ${patchedExecRuntimeFiles.join(', ')}`);
}
if (patchedKillTreeFiles.length > 0) {
  console.log(`[dev] Patched OpenClaw Windows kill-tree runtime: ${patchedKillTreeFiles.join(', ')}`);
}
if (patchedModelCatalogFiles.length > 0) {
  console.log(`[dev] Patched OpenClaw model discovery/catalog runtime: ${patchedModelCatalogFiles.join(', ')}`);
}
if (patchedPluginSdkCompatFiles.length > 0) {
  console.log(`[dev] Patched OpenClaw plugin-sdk compat/runtime guards: ${patchedPluginSdkCompatFiles.join(', ')}`);
}

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
