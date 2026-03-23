#!/usr/bin/env node

import { appendFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import {
  buildMacSigningEnvEntries,
  resolveMacBuilderMode,
  resolveMacSigningState,
} from './macos-signing-utils.mjs';

function formatMultilineEnv(key, value) {
  return `${key}<<__LAWCLAW_ENV__\n${value}\n__LAWCLAW_ENV__\n`;
}

async function appendGithubFile(filePath, entries) {
  if (!filePath || entries.length === 0) {
    return;
  }

  const payload = entries
    .map(([key, value]) => formatMultilineEnv(key, value))
    .join('');

  await appendFile(filePath, payload, 'utf8');
}

async function main() {
  const state = resolveMacSigningState(process.env);

  if (state.warnings.length > 0) {
    for (const warning of state.warnings) {
      console.warn(`[prepare-macos-signing-env] ${warning}`);
    }
  }

  if (state.errors.length > 0) {
    for (const error of state.errors) {
      console.error(`[prepare-macos-signing-env] ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  let useSignedConfig;
  try {
    ({ useSignedConfig } = resolveMacBuilderMode(process.env));
  } catch (error) {
    console.error(`[prepare-macos-signing-env] ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const envEntries = [];
  const outputEntries = [];

  if (!useSignedConfig) {
    if (process.env.LAWCLAW_MAC_SIGN === '0') {
      console.log('[prepare-macos-signing-env] macOS signing disabled via LAWCLAW_MAC_SIGN=0; unsigned build will be used.');
    } else {
      console.log('[prepare-macos-signing-env] macOS signing/notarization credentials not configured; unsigned build will be used.');
    }
    envEntries.push(['MAC_SIGN_ENABLED', 'false']);
    envEntries.push(['MAC_SIGN_MODE', 'none']);
    outputEntries.push(['enabled', 'false']);
    outputEntries.push(['mode', 'none']);
    await appendGithubFile(process.env.GITHUB_ENV, envEntries);
    await appendGithubFile(process.env.GITHUB_OUTPUT, outputEntries);
    return;
  }

  const signingEnvEntries = await buildMacSigningEnvEntries(state, {
    apiKeyDirectory: join(process.env.RUNNER_TEMP || os.tmpdir(), 'lawclaw-apple-api-key'),
  });

  envEntries.push(...signingEnvEntries);
  envEntries.push(['MAC_SIGN_ENABLED', 'true']);
  envEntries.push(['MAC_SIGN_MODE', state.mode]);

  outputEntries.push(['enabled', 'true']);
  outputEntries.push(['mode', state.mode]);

  await appendGithubFile(process.env.GITHUB_ENV, envEntries);
  await appendGithubFile(process.env.GITHUB_OUTPUT, outputEntries);

  console.log(`[prepare-macos-signing-env] macOS signing enabled via ${state.mode}.`);
}

await main();
