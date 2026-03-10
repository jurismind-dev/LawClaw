#!/usr/bin/env zx

import 'zx/globals';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT_DIR = path.resolve(__dirname, '..');
const UV_VERSION = '0.10.0';
const BASE_URL = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`;
const OUTPUT_BASE = path.join(ROOT_DIR, 'resources', 'bin');
const DOWNLOAD_RETRIES = Math.max(parseInt(process.env.UV_DOWNLOAD_RETRIES || '4', 10) || 4, 1);
const DOWNLOAD_TIMEOUT_MS = Math.max(
  parseInt(process.env.UV_DOWNLOAD_TIMEOUT_MS || '120000', 10) || 120000,
  10000
);
const DOWNLOAD_BACKOFF_MS = Math.max(
  parseInt(process.env.UV_DOWNLOAD_BACKOFF_MS || '1500', 10) || 1500,
  200
);
const BASE_URLS = (
  process.env.UV_DOWNLOAD_BASE_URLS ||
  process.env.UV_DOWNLOAD_BASE_URL ||
  BASE_URL
)
  .split(',')
  .map((item) => item.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const TARGETS = {
  'darwin-arm64': {
    filename: 'uv-aarch64-apple-darwin.tar.gz',
    binName: 'uv',
  },
  'darwin-x64': {
    filename: 'uv-x86_64-apple-darwin.tar.gz',
    binName: 'uv',
  },
  'win32-arm64': {
    filename: 'uv-aarch64-pc-windows-msvc.zip',
    binName: 'uv.exe',
  },
  'win32-x64': {
    filename: 'uv-x86_64-pc-windows-msvc.zip',
    binName: 'uv.exe',
  },
  'linux-arm64': {
    filename: 'uv-aarch64-unknown-linux-gnu.tar.gz',
    binName: 'uv',
  },
  'linux-x64': {
    filename: 'uv-x86_64-unknown-linux-gnu.tar.gz',
    binName: 'uv',
  },
};

const PLATFORM_GROUPS = {
  mac: ['darwin-x64', 'darwin-arm64'],
  win: ['win32-x64', 'win32-arm64'],
  linux: ['linux-x64', 'linux-arm64'],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function defaultShellExec(command, args) {
  if (command === 'unzip') {
    await $`unzip -q -o ${args[0]} -d ${args[1]}`;
    return;
  }

  if (command === 'tar') {
    await $`tar -xzf ${args[0]} -C ${args[1]}`;
    return;
  }

  throw new Error(`Unsupported shell command: ${command}`);
}

const defaultDeps = {
  fetchImpl: fetch,
  fsImpl: fs,
  globImpl: glob,
  hostPlatform: os.platform(),
  execFileSyncImpl: execFileSync,
  shellExec: defaultShellExec,
  logger: console,
};

function resolveDeps(overrides = {}) {
  return {
    ...defaultDeps,
    ...overrides,
  };
}

async function downloadArchiveWithRetries(url, archivePath, deps) {
  const resolvedDeps = resolveDeps(deps);
  const { fetchImpl, fsImpl, logger } = resolvedDeps;
  let lastError = null;

  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt += 1) {
    try {
      logger.info?.(`[uv:download] Downloading (${attempt}/${DOWNLOAD_RETRIES}): ${url}`);
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      await fsImpl.writeFile(archivePath, Buffer.from(buffer));
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      logger.warn?.(`[uv:download] Download attempt failed: ${message}`);
      if (attempt < DOWNLOAD_RETRIES) {
        const delay = DOWNLOAD_BACKOFF_MS * attempt;
        logger.info?.(`[uv:download] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `Failed to download ${url} after ${DOWNLOAD_RETRIES} attempts: ${lastError?.message || lastError}`
  );
}

export async function setupTarget(id, deps = defaultDeps) {
  const resolvedDeps = resolveDeps(deps);
  const {
    fsImpl,
    globImpl,
    hostPlatform,
    execFileSyncImpl,
    shellExec,
    logger,
  } = resolvedDeps;
  const target = TARGETS[id];

  if (!target) {
    logger.warn?.(`[uv:download] Target ${id} is not supported by this script.`);
    return;
  }

  const targetDir = path.join(OUTPUT_BASE, id);
  const tempDir = path.join(ROOT_DIR, 'temp_uv_extract');
  const archivePath = path.join(ROOT_DIR, target.filename);
  logger.info?.(`[uv:download] Setting up uv for ${id}...`);

  await fsImpl.remove(tempDir);
  await fsImpl.ensureDir(tempDir);

  try {
    let downloaded = false;
    let lastError = null;

    for (const baseUrl of BASE_URLS) {
      const downloadUrl = `${baseUrl}/${target.filename}`;
      try {
        await downloadArchiveWithRetries(downloadUrl, archivePath, resolvedDeps);
        downloaded = true;
        break;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        logger.warn?.(`[uv:download] Source failed: ${downloadUrl}`);
        logger.warn?.(`[uv:download] ${message}`);
      }
    }

    if (!downloaded) {
      throw new Error(
        `All download sources failed for ${target.filename}. Last error: ${lastError?.message || lastError}`
      );
    }

    logger.info?.(`[uv:download] Extracting ${target.filename}...`);
    if (target.filename.endsWith('.zip')) {
      if (hostPlatform === 'win32') {
        const psCommand =
          `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
          `[System.IO.Compression.ZipFile]::ExtractToDirectory(` +
          `'${archivePath.replace(/'/g, "''")}', '${tempDir.replace(/'/g, "''")}')`;
        execFileSyncImpl('powershell.exe', ['-NoProfile', '-Command', psCommand], {
          stdio: 'inherit',
        });
      } else {
        await shellExec('unzip', [archivePath, tempDir]);
      }
    } else {
      await shellExec('tar', [archivePath, tempDir]);
    }

    const folderName = target.filename.replace('.tar.gz', '').replace('.zip', '');
    const sourceBin = path.join(tempDir, folderName, target.binName);
    const destBin = path.join(targetDir, target.binName);

    if (await fsImpl.pathExists(sourceBin)) {
      await fsImpl.ensureDir(targetDir);
      await fsImpl.move(sourceBin, destBin, { overwrite: true });
    } else {
      logger.info?.(`[uv:download] Binary not found in expected subfolder, searching...`);
      const files = await globImpl(`**/${target.binName}`, { cwd: tempDir, absolute: true });
      if (files.length > 0) {
        await fsImpl.ensureDir(targetDir);
        await fsImpl.move(files[0], destBin, { overwrite: true });
      } else {
        throw new Error(`Could not find ${target.binName} in extracted files.`);
      }
    }

    if (hostPlatform !== 'win32') {
      await fsImpl.chmod(destBin, 0o755);
    }

    logger.info?.(`[uv:download] Ready: ${destBin}`);
  } finally {
    await fsImpl.remove(archivePath);
    await fsImpl.remove(tempDir);
  }
}

export async function downloadBundledUv(options = {}) {
  const { platform, all, deps = defaultDeps } = options;
  const resolvedDeps = resolveDeps(deps);
  const { hostPlatform, logger } = resolvedDeps;
  let targets;

  if (all) {
    targets = Object.keys(TARGETS);
    logger.info?.('[uv:download] Downloading uv binaries for all supported targets...');
  } else if (platform) {
    targets = PLATFORM_GROUPS[platform];
    if (!targets) {
      throw new Error(
        `Unknown platform: ${platform}. Available platforms: ${Object.keys(PLATFORM_GROUPS).join(', ')}`
      );
    }
    logger.info?.(`[uv:download] Downloading uv binaries for platform: ${platform}`);
  } else {
    const currentId = `${hostPlatform}-${os.arch()}`;
    targets = TARGETS[currentId] ? [currentId] : null;
    if (!targets) {
      throw new Error(
        `Current system ${currentId} is not in the supported download list. Supported targets: ${Object.keys(TARGETS).join(', ')}`
      );
    }
    logger.info?.(`[uv:download] Detected system: ${currentId}`);
  }

  for (const id of targets) {
    await setupTarget(id, resolvedDeps);
  }

  logger.info?.('[uv:download] Done.');
}

export function isDirectExecution(argvInput = process.argv, currentFile = __filename) {
  const entryArg = Array.isArray(argvInput) ? argvInput[1] : undefined;
  if (!entryArg) {
    return false;
  }

  return path.resolve(entryArg) === currentFile;
}

if (isDirectExecution()) {
  await downloadBundledUv({
    platform: argv.platform,
    all: argv.all,
  });
}
