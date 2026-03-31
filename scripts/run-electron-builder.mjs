#!/usr/bin/env node

import { mkdtemp, mkdir, rename, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { basename, join } from 'node:path';
import {
  applyEnvEntries,
  buildMacSigningEnvEntries,
  resolveMacBuilderMode,
} from './macos-signing-utils.mjs';

const MAC_DMG_LOCALIZED_LICENSE_FILES = [
  join(process.cwd(), 'resources', 'license_en.txt'),
  join(process.cwd(), 'resources', 'license_zh_CN.txt'),
];

async function withTemporarilyHiddenMacDmgLicenses(run) {
  if (process.platform !== 'darwin') {
    return run();
  }

  const stashRoot = join(process.cwd(), '.tmp', 'mac-dmg-license-stash');
  await mkdir(stashRoot, { recursive: true });
  const stashDir = await mkdtemp(join(stashRoot, 'run-'));
  const movedFiles = [];

  try {
    for (const filePath of MAC_DMG_LOCALIZED_LICENSE_FILES) {
      const stashPath = join(stashDir, basename(filePath));

      try {
        await rename(filePath, stashPath);
        movedFiles.push({ filePath, stashPath });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          continue;
        }
        throw error;
      }
    }

    return run();
  } finally {
    for (const { filePath, stashPath } of movedFiles.reverse()) {
      await rename(stashPath, filePath);
    }
    await rm(stashDir, { recursive: true, force: true });
  }
}

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

const result = await withTemporarilyHiddenMacDmgLicenses(() =>
  spawnSync(electronBuilderBin, args, {
    env: childEnv,
    stdio: 'inherit',
  })
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
