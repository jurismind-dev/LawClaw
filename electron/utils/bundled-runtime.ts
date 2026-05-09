import { app } from 'electron';
import { existsSync } from 'fs';
import { delimiter, join, resolve } from 'node:path';
import { applyWindowsUtf8Env } from './text-encoding';

export interface BundledRuntimeEnvOptions {
  nodeExecutablePath?: string;
}

function getExistingPathValue(env: NodeJS.ProcessEnv): string | undefined {
  for (const key of ['PATH', 'Path', 'path']) {
    const value = env[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function ensureWindowsSystemPathEntries(entries: string[], env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== 'win32') {
    return entries;
  }

  const systemRoot = String(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows').trim();
  if (!systemRoot) {
    return entries;
  }

  const requiredEntries = [
    systemRoot,
    join(systemRoot, 'System32'),
    join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
  ];

  return dedupePathEntries([...entries, ...requiredEntries]);
}

function dedupePathEntries(entries: string[]): string[] {
  const normalizedSeen = new Set<string>();
  const result: string[] = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const normalized = process.platform === 'win32'
      ? trimmed.toLowerCase()
      : trimmed;
    if (normalizedSeen.has(normalized)) continue;

    normalizedSeen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

function getDevRuntimeBridgeDir(): string | null {
  if (process.platform === 'win32') {
    return join(process.cwd(), 'resources', 'runtime-bridge', 'win32');
  }
  if (process.platform === 'darwin' || process.platform === 'linux') {
    return join(process.cwd(), 'resources', 'runtime-bridge', 'posix');
  }
  return null;
}

function getPackagedRuntimeBridgeDir(): string | null {
  if (!app.isPackaged || typeof process.resourcesPath !== 'string' || !process.resourcesPath) {
    return null;
  }
  return join(process.resourcesPath, 'runtime-bridge');
}

function getRuntimeBridgeDir(): string | null {
  return app.isPackaged ? getPackagedRuntimeBridgeDir() : getDevRuntimeBridgeDir();
}

function getBundledBinDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'bin');
  }
  return join(process.cwd(), 'resources', 'bin', `${process.platform}-${process.arch}`);
}

function getBundledUvExecutablePath(): string {
  const binName = process.platform === 'win32' ? 'uv.exe' : 'uv';
  return join(getBundledBinDir(), binName);
}

function getBundledNpmCliPath(): string | null {
  if (!app.isPackaged || typeof process.resourcesPath !== 'string' || !process.resourcesPath) {
    return null;
  }

  if (process.platform === 'win32') {
    return resolve(process.resourcesPath, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  }

  if (process.platform === 'darwin' || process.platform === 'linux') {
    return join(process.resourcesPath, 'npm-runtime', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  }

  return null;
}

function getBundledNpxCliPath(): string | null {
  if (!app.isPackaged || typeof process.resourcesPath !== 'string' || !process.resourcesPath) {
    return null;
  }

  if (process.platform === 'win32') {
    return resolve(process.resourcesPath, '..', 'node_modules', 'npm', 'bin', 'npx-cli.js');
  }

  if (process.platform === 'darwin' || process.platform === 'linux') {
    return join(process.resourcesPath, 'npm-runtime', 'node_modules', 'npm', 'bin', 'npx-cli.js');
  }

  return null;
}

export function prependPathEntries(
  currentPath: string | undefined,
  entries: string[],
): string {
  const baseEntries = String(currentPath ?? '')
    .split(delimiter)
    .filter(Boolean);

  return dedupePathEntries([...entries, ...baseEntries]).join(delimiter);
}

export function getBundledRuntimePathEntries(): string[] {
  const entries: string[] = [];
  const runtimeBridgeDir = getRuntimeBridgeDir();
  if (app.isPackaged && runtimeBridgeDir && existsSync(runtimeBridgeDir)) {
    entries.push(runtimeBridgeDir);
  }

  const bundledBinDir = getBundledBinDir();
  if (existsSync(bundledBinDir)) {
    entries.push(bundledBinDir);
  }

  return dedupePathEntries(entries);
}

export function applyBundledRuntimeToEnv(
  baseEnv: NodeJS.ProcessEnv,
  options: BundledRuntimeEnvOptions = {},
): NodeJS.ProcessEnv {
  const env = applyWindowsUtf8Env(baseEnv);
  const pathEntries = ensureWindowsSystemPathEntries(getBundledRuntimePathEntries(), env);
  if (pathEntries.length > 0) {
    const currentPath = getExistingPathValue(env);
    const nextPath = prependPathEntries(currentPath, pathEntries);
    env.PATH = nextPath;
    if (process.platform === 'win32') {
      env.Path = nextPath;
      if (!env.SystemRoot && !env.SYSTEMROOT) {
        env.SystemRoot = 'C:\\Windows';
      }
    }
  }

  if (!app.isPackaged) {
    return env;
  }

  if (options.nodeExecutablePath?.trim()) {
    env.LAWCLAW_BUNDLED_NODE_EXE = options.nodeExecutablePath;
  }

  const uvExe = getBundledUvExecutablePath();
  if (existsSync(uvExe)) {
    env.LAWCLAW_BUNDLED_UV_EXE = uvExe;
  }

  const npmCli = getBundledNpmCliPath();
  if (npmCli && existsSync(npmCli)) {
    env.LAWCLAW_BUNDLED_NPM_CLI_JS = npmCli;
  }

  const npxCli = getBundledNpxCliPath();
  if (npxCli && existsSync(npxCli)) {
    env.LAWCLAW_BUNDLED_NPX_CLI_JS = npxCli;
  }

  return env;
}
