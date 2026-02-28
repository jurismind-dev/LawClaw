#!/usr/bin/env zx

import 'zx/globals';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';

const ROOT_DIR = path.resolve(__dirname, '..');

const PLATFORM_TARGETS = {
  mac: ['darwin-x64', 'darwin-arm64'],
  win: ['win32-x64', 'win32-arm64'],
  linux: ['linux-x64', 'linux-arm64'],
};

const PLATFORM_NAMES = Object.keys(PLATFORM_TARGETS);

function getBinaryName(target) {
  return target.startsWith('win32-') ? 'uv.exe' : 'uv';
}

export function resolvePlatformGroup(platform, nodePlatform = os.platform()) {
  if (platform) {
    if (!PLATFORM_NAMES.includes(platform)) {
      throw new Error(`Unsupported platform: ${platform}. Expected one of ${PLATFORM_NAMES.join(', ')}`);
    }
    return platform;
  }

  if (nodePlatform === 'darwin') return 'mac';
  if (nodePlatform === 'win32') return 'win';
  if (nodePlatform === 'linux') return 'linux';
  throw new Error(`Unsupported current platform: ${nodePlatform}`);
}

export function getRequiredUvBinaries(platform, rootDir = ROOT_DIR) {
  const targets = PLATFORM_TARGETS[platform];
  if (!targets) {
    throw new Error(`Unsupported platform: ${platform}. Expected one of ${PLATFORM_NAMES.join(', ')}`);
  }

  return targets.map((target) => ({
    target,
    path: path.join(rootDir, 'resources', 'bin', target, getBinaryName(target)),
  }));
}

export function getMissingUvBinaries(binaries, existsFn = existsSync) {
  return binaries.filter((binary) => !existsFn(binary.path));
}

async function downloadUvForPlatform(platform) {
  await $`pnpm exec zx scripts/download-bundled-uv.mjs --platform=${platform}`;
}

export async function ensureBundledUv({
  platform,
  rootDir = ROOT_DIR,
  existsFn = existsSync,
  downloadFn = downloadUvForPlatform,
  logger = console,
  nodePlatform = os.platform(),
} = {}) {
  const platformGroup = resolvePlatformGroup(platform, nodePlatform);
  const binaries = getRequiredUvBinaries(platformGroup, rootDir);
  const missingBefore = getMissingUvBinaries(binaries, existsFn);

  if (missingBefore.length === 0) {
    logger.info?.(`[uv:ensure] All required binaries already exist for ${platformGroup}.`);
    return { platform: platformGroup, downloaded: false, binaries };
  }

  logger.info?.(
    `[uv:ensure] Missing ${missingBefore.length} binary file(s) for ${platformGroup}, downloading...`
  );
  for (const item of missingBefore) {
    logger.info?.(`[uv:ensure] missing: ${item.path}`);
  }

  await downloadFn(platformGroup);

  const missingAfter = getMissingUvBinaries(binaries, existsFn);
  if (missingAfter.length > 0) {
    const missingList = missingAfter.map((item) => `- ${item.path}`).join('\n');
    throw new Error(
      `[uv:ensure] Bundled uv binaries are still missing after download:\n${missingList}`
    );
  }

  logger.info?.(`[uv:ensure] Bundled uv is ready for ${platformGroup}.`);
  return { platform: platformGroup, downloaded: true, binaries };
}

async function main() {
  await ensureBundledUv({
    platform: argv.platform,
  });
}

function isDirectExecution() {
  return process.argv.some((arg) => {
    if (!arg) return false;
    return path.resolve(arg) === __filename;
  });
}

if (isDirectExecution()) {
  await main();
}
