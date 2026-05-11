import { app } from 'electron';
import { existsSync, writeFileSync } from 'fs';
import { delimiter, join, resolve } from 'node:path';
import { applyWindowsUtf8Env } from './text-encoding';
import {
  appendNodeRequireToNodeOptions,
  normalizeNodeRequirePathForNodeOptions,
} from './win-shell';

export interface BundledRuntimeEnvOptions {
  nodeExecutablePath?: string;
}

const WINDOWS_CHILD_PROCESS_HIDE_PRELOAD_FILENAME = 'lawclaw-child-process-windows-hide.cjs';

const WINDOWS_CHILD_PROCESS_HIDE_PRELOAD_SOURCE = `'use strict';
(function () {
  if (process.platform !== 'win32') return;
  if (process.env.LAWCLAW_DISABLE_WINDOWS_HIDE_PRELOAD === '1') return;
  if (globalThis.__lawclawChildProcessWindowsHidePatched) return;
  globalThis.__lawclawChildProcessWindowsHidePatched = true;

  var childProcess;
  try {
    childProcess = require('node:child_process');
  } catch (_) {
    try {
      childProcess = require('child_process');
    } catch (_) {
      return;
    }
  }

  function withWindowsHide(options) {
    if (options == null) return { windowsHide: true };
    if (typeof options !== 'object' || Array.isArray(options)) return options;
    if (Object.prototype.hasOwnProperty.call(options, 'windowsHide')) return options;
    return Object.assign({}, options, { windowsHide: true });
  }

  function patch(name, wrapper) {
    var original = childProcess[name];
    if (typeof original !== 'function' || original.__lawclawWindowsHidePatched) return;
    var patched = wrapper(original);
    try {
      Object.defineProperty(patched, '__lawclawWindowsHidePatched', { value: true });
      childProcess[name] = patched;
    } catch (_) {}
  }

  function wrapSpawnLike(original) {
    return function lawclawSpawnWithWindowsHide(command, args, options) {
      if (Array.isArray(args)) {
        return original.call(this, command, args, withWindowsHide(options));
      }
      return original.call(this, command, withWindowsHide(args));
    };
  }

  function wrapExec(original) {
    return function lawclawExecWithWindowsHide(command, options, callback) {
      if (typeof options === 'function') {
        return original.call(this, command, withWindowsHide(undefined), options);
      }
      return original.call(this, command, withWindowsHide(options), callback);
    };
  }

  function wrapExecFile(original) {
    return function lawclawExecFileWithWindowsHide(file, args, options, callback) {
      if (typeof args === 'function') {
        return original.call(this, file, withWindowsHide(undefined), args);
      }
      if (Array.isArray(args)) {
        if (typeof options === 'function') {
          return original.call(this, file, args, withWindowsHide(undefined), options);
        }
        return original.call(this, file, args, withWindowsHide(options), callback);
      }
      if (typeof options === 'function') {
        return original.call(this, file, withWindowsHide(args), options);
      }
      return original.call(this, file, withWindowsHide(args), options);
    };
  }

  function wrapExecFileSync(original) {
    return function lawclawExecFileSyncWithWindowsHide(file, args, options) {
      if (Array.isArray(args)) {
        return original.call(this, file, args, withWindowsHide(options));
      }
      return original.call(this, file, withWindowsHide(args));
    };
  }

  function patchNodePtyModule(moduleExports) {
    if (!moduleExports || typeof moduleExports !== 'object') return moduleExports;
    var originalSpawn = moduleExports.spawn;
    if (typeof originalSpawn !== 'function' || originalSpawn.__lawclawWindowsHidePatched) return moduleExports;
    var patchedSpawn = function lawclawPtySpawnWithHide(file, args, options) {
      var nextOptions = options;
      if (nextOptions && typeof nextOptions === 'object' && !Array.isArray(nextOptions) && !Object.prototype.hasOwnProperty.call(nextOptions, 'hide')) {
        nextOptions = Object.assign({}, nextOptions, { hide: true });
      } else if (nextOptions == null) {
        nextOptions = { hide: true };
      }
      return originalSpawn.call(this, file, args, nextOptions);
    };
    try {
      Object.defineProperty(patchedSpawn, '__lawclawWindowsHidePatched', { value: true });
      moduleExports.spawn = patchedSpawn;
    } catch (_) {}
    if (moduleExports.default && moduleExports.default !== moduleExports) patchNodePtyModule(moduleExports.default);
    return moduleExports;
  }

  function patchNodePtyLoader() {
    var Module;
    try {
      Module = require('node:module');
    } catch (_) {
      return;
    }
    if (!Module || !Module._load || Module._load.__lawclawNodePtyHidePatched) return;
    var originalLoad = Module._load;
    Module._load = function lawclawLoadWithPtyHide(request, parent, isMain) {
      var result = originalLoad.apply(this, arguments);
      if (request === '@lydell/node-pty' || /^@lydell\\/node-pty-win32-/.test(String(request))) {
        return patchNodePtyModule(result);
      }
      return result;
    };
    try {
      Object.defineProperty(Module._load, '__lawclawNodePtyHidePatched', { value: true });
    } catch (_) {}
  }

  patch('spawn', wrapSpawnLike);
  patch('spawnSync', wrapSpawnLike);
  patch('fork', wrapSpawnLike);
  patch('exec', wrapExec);
  patch('execSync', function (original) {
    return function lawclawExecSyncWithWindowsHide(command, options) {
      return original.call(this, command, withWindowsHide(options));
    };
  });
  patch('execFile', wrapExecFile);
  patch('execFileSync', wrapExecFileSync);
  patchNodePtyLoader();

  try {
    require('node:module').syncBuiltinESMExports();
  } catch (_) {}
})();
`;

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

function getWindowsChildProcessHidePreloadPath(): string | null {
  if (process.platform !== 'win32') return null;

  if (app.isPackaged && typeof process.resourcesPath === 'string' && process.resourcesPath) {
    return join(process.resourcesPath, 'resources', 'runtime', WINDOWS_CHILD_PROCESS_HIDE_PRELOAD_FILENAME);
  }

  return join(process.cwd(), 'resources', 'runtime', WINDOWS_CHILD_PROCESS_HIDE_PRELOAD_FILENAME);
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

export function ensureWindowsChildProcessHidePreload(): string | null {
  const preloadPath = getWindowsChildProcessHidePreloadPath();
  if (!preloadPath) return null;

  try {
    writeFileSync(preloadPath, WINDOWS_CHILD_PROCESS_HIDE_PRELOAD_SOURCE, 'utf-8');
  } catch {
    // The packaged preload is also shipped in resources; writing is only
    // needed for dev and for repairing older user installations.
  }

  return existsSync(preloadPath) ? preloadPath : null;
}

export function applyWindowsChildProcessHidePreloadToEnv(
  baseEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') {
    return baseEnv;
  }

  const preloadPath = ensureWindowsChildProcessHidePreload();
  if (!preloadPath) {
    return baseEnv;
  }

  const normalizedPreloadPath = normalizeNodeRequirePathForNodeOptions(preloadPath);
  const currentNodeOptions = baseEnv.NODE_OPTIONS ?? '';
  if (currentNodeOptions.includes(`"${normalizedPreloadPath}"`) || currentNodeOptions.includes(normalizedPreloadPath)) {
    return baseEnv;
  }

  baseEnv.NODE_OPTIONS = appendNodeRequireToNodeOptions(currentNodeOptions, preloadPath);
  return baseEnv;
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
    return applyWindowsChildProcessHidePreloadToEnv(env);
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

  return applyWindowsChildProcessHidePreloadToEnv(env);
}
