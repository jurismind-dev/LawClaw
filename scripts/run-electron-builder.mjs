#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { join } from 'node:path';
import {
  applyEnvEntries,
  buildMacSigningEnvEntries,
  resolveMacBuilderMode,
} from './macos-signing-utils.mjs';

const forwardedArgs = process.argv.slice(2);
const { useSignedConfig, state } =
  process.platform === 'darwin'
    ? resolveMacBuilderMode(process.env)
    : { useSignedConfig: true, state: null };
const shouldUseUnsignedMacConfig =
  process.platform === 'darwin' && !useSignedConfig;

const electronBuilderBin =
  process.platform === 'win32'
    ? join(process.cwd(), 'node_modules', '.bin', 'electron-builder.cmd')
    : join(process.cwd(), 'node_modules', '.bin', 'electron-builder');

const args = shouldUseUnsignedMacConfig
  ? ['--config', 'electron-builder.nosign.yml', ...forwardedArgs]
  : forwardedArgs;

if (process.platform === 'darwin' && state?.warnings.length > 0) {
  for (const warning of state.warnings) {
    console.warn(`[run-electron-builder] ${warning}`);
  }
}

if (process.platform === 'darwin') {
  if (useSignedConfig) {
    console.log(`[run-electron-builder] macOS signing enabled via ${state.mode}.`);
  } else if (process.env.LAWCLAW_MAC_SIGN === '0') {
    console.log('[run-electron-builder] macOS signing disabled via LAWCLAW_MAC_SIGN=0; using unsigned config.');
  } else {
    console.log('[run-electron-builder] macOS signing/notarization credentials not configured; using unsigned config.');
  }
}

const childEnv =
  process.platform === 'darwin' && useSignedConfig
    ? applyEnvEntries(
        process.env,
        await buildMacSigningEnvEntries(state, {
          apiKeyDirectory: join(os.tmpdir(), 'lawclaw-apple-api-key'),
        })
      )
    : { ...process.env };

const result = spawnSync(electronBuilderBin, args, {
  env: childEnv,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
