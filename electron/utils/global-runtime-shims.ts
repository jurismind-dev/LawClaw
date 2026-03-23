import { app } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access, chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getClawXConfigDir } from './paths';
import { logger } from './logger';
import { prepareWinSpawn } from './win-shell';

export const LAWCLAW_GLOBAL_TOOLS_START_MARKER = '# >>> LawClaw Global Tools >>>';
export const LAWCLAW_GLOBAL_TOOLS_END_MARKER = '# <<< LawClaw Global Tools <<<';

const MAC_ENV_SOURCE_PATH = '$HOME/.LawClaw/support/global-tools/env.sh';
const MAC_GLOBAL_SHIM_DIR = '$HOME/.LawClaw/bin';
const MAC_SHELL_RC_FILES = ['.zprofile', '.zshrc', '.bash_profile', '.bashrc'];
const MAC_LOGIN_SHELLS = ['/bin/zsh', '/bin/bash'];
const WINDOWS_POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const PROBE_TIMEOUT_MS = 4000;

interface ToolSpec {
  command: 'python' | 'python3' | 'node' | 'npm' | 'npx' | 'uv';
  verifyArgs: string[];
  posixProbe: string;
  windowsTargetRelativePath: string;
  posixTargetRelativePath: string;
  ignoreWindowsAppsAlias?: boolean;
}

const TOOL_SPECS: ToolSpec[] = [
  {
    command: 'python',
    verifyArgs: ['-c', 'import sys; print(sys.executable)'],
    posixProbe: `command -v python >/dev/null 2>&1 && python -c 'import sys; print(sys.executable)' >/dev/null 2>&1`,
    windowsTargetRelativePath: join('runtime-bridge', 'python.cmd'),
    posixTargetRelativePath: join('runtime-bridge', 'python'),
    ignoreWindowsAppsAlias: true,
  },
  {
    command: 'python3',
    verifyArgs: ['-c', 'import sys; print(sys.executable)'],
    posixProbe: `command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; print(sys.executable)' >/dev/null 2>&1`,
    windowsTargetRelativePath: join('runtime-bridge', 'python3.cmd'),
    posixTargetRelativePath: join('runtime-bridge', 'python3'),
    ignoreWindowsAppsAlias: true,
  },
  {
    command: 'node',
    verifyArgs: ['-v'],
    posixProbe: 'command -v node >/dev/null 2>&1 && node -v >/dev/null 2>&1',
    windowsTargetRelativePath: join('runtime-bridge', 'node.cmd'),
    posixTargetRelativePath: join('runtime-bridge', 'node'),
  },
  {
    command: 'npm',
    verifyArgs: ['-v'],
    posixProbe: 'command -v npm >/dev/null 2>&1 && npm -v >/dev/null 2>&1',
    windowsTargetRelativePath: join('runtime-bridge', 'npm.cmd'),
    posixTargetRelativePath: join('runtime-bridge', 'npm'),
  },
  {
    command: 'npx',
    verifyArgs: ['-v'],
    posixProbe: 'command -v npx >/dev/null 2>&1 && npx -v >/dev/null 2>&1',
    windowsTargetRelativePath: join('runtime-bridge', 'npx.cmd'),
    posixTargetRelativePath: join('runtime-bridge', 'npx'),
  },
  {
    command: 'uv',
    verifyArgs: ['--version'],
    posixProbe: 'command -v uv >/dev/null 2>&1 && uv --version >/dev/null 2>&1',
    windowsTargetRelativePath: join('bin', 'uv.exe'),
    posixTargetRelativePath: join('bin', 'uv'),
  },
];

interface RunProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function getGlobalShimDir(): string {
  return join(getClawXConfigDir(), 'bin');
}

function getGlobalSupportDir(): string {
  return join(getClawXConfigDir(), 'support', 'global-tools');
}

function getGlobalEnvScriptPath(): string {
  return join(getGlobalSupportDir(), 'env.sh');
}

function normalizePathEntry(entry: string, platform = process.platform): string {
  const trimmed = entry.trim();
  return platform === 'win32' ? trimmed.toLowerCase() : trimmed;
}

export function appendPathEntry(
  currentPath: string | undefined,
  entry: string,
  platform = process.platform,
): string {
  const target = entry.trim();
  const pathParts = String(currentPath ?? '')
    .split(platform === 'win32' ? ';' : ':')
    .map((part) => part.trim())
    .filter(Boolean);
  const filtered = pathParts.filter((part) => normalizePathEntry(part, platform) !== normalizePathEntry(target, platform));
  filtered.push(target);
  return filtered.join(platform === 'win32' ? ';' : ':');
}

export function removePathEntry(
  currentPath: string | undefined,
  entry: string,
  platform = process.platform,
): string {
  const target = normalizePathEntry(entry, platform);
  return String(currentPath ?? '')
    .split(platform === 'win32' ? ';' : ':')
    .map((part) => part.trim())
    .filter((part) => part && normalizePathEntry(part, platform) !== target)
    .join(platform === 'win32' ? ';' : ':');
}

export function getPosixShellMarkerBlock(): string {
  return [
    LAWCLAW_GLOBAL_TOOLS_START_MARKER,
    `if [ -f "${MAC_ENV_SOURCE_PATH}" ]; then`,
    `  . "${MAC_ENV_SOURCE_PATH}"`,
    'fi',
    LAWCLAW_GLOBAL_TOOLS_END_MARKER,
  ].join('\n');
}

export function upsertMarkerBlock(content: string, block: string): string {
  const existing = removeMarkerBlock(content);
  const trimmed = existing.replace(/\s+$/u, '');
  return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}

export function removeMarkerBlock(content: string): string {
  const escapedStart = escapeForRegExp(LAWCLAW_GLOBAL_TOOLS_START_MARKER);
  const escapedEnd = escapeForRegExp(LAWCLAW_GLOBAL_TOOLS_END_MARKER);
  return content
    .replace(new RegExp(`\\n?${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, 'g'), '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/u, '')
    .replace(/\s+$/u, (match) => (match.includes('\n') ? '\n' : ''));
}

export function buildPosixEnvScript(): string {
  return `if [ "\${LAWCLAW_SKIP_GLOBAL_SHIMS:-0}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi

LAWCLAW_GLOBAL_TOOLS_DIR="${MAC_GLOBAL_SHIM_DIR}"
case ":\${PATH}:" in
  *:"\${LAWCLAW_GLOBAL_TOOLS_DIR}":*)
    ;;
  *)
    export PATH="\${PATH}:\${LAWCLAW_GLOBAL_TOOLS_DIR}"
    ;;
esac
`;
}

export function buildWindowsShimContent(targetPath: string): string {
  const normalizedTarget = targetPath.replace(/\//g, '\\');
  const invocation = /\.(?:cmd|bat)$/i.test(normalizedTarget)
    ? `call "${normalizedTarget}" %*`
    : `"${normalizedTarget}" %*`;
  return `@echo off
setlocal
chcp 65001 >nul
${invocation}
exit /b %errorlevel%
`;
}

export function buildPosixShimContent(targetPath: string): string {
  return `#!/bin/sh
set -eu
exec ${shellSingleQuote(targetPath)} "$@"
`;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function runProcess(
  command: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    shell?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<RunProcessResult> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      env: options.env,
      shell: options.shell,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs ?? PROBE_TIMEOUT_MS);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        code: 1,
        stdout,
        stderr: error.message || stderr,
        timedOut,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

async function isWindowsCandidateUsable(
  candidatePath: string,
  verifyArgs: string[],
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const requiresShell = /\.(?:cmd|bat)$/i.test(candidatePath);
  const prepared = prepareWinSpawn(candidatePath, verifyArgs, requiresShell);
  const result = await runProcess(prepared.command, prepared.args, {
    env,
    shell: prepared.shell,
  });
  return !result.timedOut && result.code === 0;
}

async function isToolAvailableOnWindows(spec: ToolSpec, shimDir: string): Promise<boolean> {
  const probeEnv = {
    ...process.env,
    PATH: removePathEntry(process.env.PATH, shimDir, 'win32'),
  };
  const whereResult = await runProcess('where.exe', [spec.command], {
    env: probeEnv,
    shell: false,
  });

  if (whereResult.code !== 0) {
    return false;
  }

  const candidates = whereResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((candidate) => !candidate.toLowerCase().startsWith(`${shimDir.toLowerCase()}\\`))
    .filter((candidate) => {
      if (!spec.ignoreWindowsAppsAlias) {
        return true;
      }
      return !candidate.toLowerCase().includes('\\windowsapps\\');
    });

  for (const candidate of candidates) {
    if (await isWindowsCandidateUsable(candidate, spec.verifyArgs, probeEnv)) {
      return true;
    }
  }

  return false;
}

async function runMacShellProbe(shellPath: string, command: string, shimDir: string): Promise<boolean> {
  const env = {
    ...process.env,
    LAWCLAW_SKIP_GLOBAL_SHIMS: '1',
    PATH: removePathEntry(process.env.PATH, shimDir, 'darwin'),
  };
  const result = await runProcess(shellPath, ['-ilc', command], {
    env,
    shell: false,
  });
  return !result.timedOut && result.code === 0;
}

async function isToolAvailableOnMac(spec: ToolSpec, shimDir: string): Promise<boolean> {
  const supportedShells = MAC_LOGIN_SHELLS.filter((shellPath) => existsSync(shellPath));
  if (supportedShells.length === 0) {
    return false;
  }

  for (const shellPath of supportedShells) {
    const isAvailable = await runMacShellProbe(shellPath, spec.posixProbe, shimDir);
    if (!isAvailable) {
      return false;
    }
  }

  return true;
}

async function isToolMissing(spec: ToolSpec, shimDir: string): Promise<boolean> {
  if (process.platform === 'win32') {
    return !(await isToolAvailableOnWindows(spec, shimDir));
  }
  if (process.platform === 'darwin') {
    return !(await isToolAvailableOnMac(spec, shimDir));
  }
  return false;
}

function getBundledToolTarget(spec: ToolSpec): string | null {
  if (!app.isPackaged || !process.resourcesPath) {
    return null;
  }

  if (process.platform === 'win32') {
    return join(process.resourcesPath, spec.windowsTargetRelativePath);
  }

  if (process.platform === 'darwin') {
    return join(process.resourcesPath, spec.posixTargetRelativePath);
  }

  return null;
}

async function writeToolShim(spec: ToolSpec, shimDir: string): Promise<void> {
  const targetPath = getBundledToolTarget(spec);
  if (!targetPath || !existsSync(targetPath)) {
    logger.warn(`[GlobalTools] Bundled target missing for ${spec.command}: ${targetPath ?? 'null'}`);
    return;
  }

  await mkdir(shimDir, { recursive: true });

  if (process.platform === 'win32') {
    const shimPath = join(shimDir, `${spec.command}.cmd`);
    await writeFile(shimPath, buildWindowsShimContent(targetPath), 'utf-8');
    return;
  }

  if (process.platform === 'darwin') {
    const shimPath = join(shimDir, spec.command);
    await writeFile(shimPath, buildPosixShimContent(targetPath), 'utf-8');
    await chmod(shimPath, 0o755);
  }
}

async function removeUnusedShims(shimDir: string, activeCommands: Set<string>): Promise<void> {
  if (!existsSync(shimDir)) {
    return;
  }

  const entries = await readdir(shimDir);
  for (const entry of entries) {
    const commandName =
      process.platform === 'win32' && entry.toLowerCase().endsWith('.cmd')
        ? entry.slice(0, -4)
        : entry;

    if (activeCommands.has(commandName)) {
      continue;
    }

    if (TOOL_SPECS.some((spec) => spec.command === commandName)) {
      await rm(join(shimDir, entry), { force: true });
    }
  }
}

async function syncShimFiles(missingTools: ToolSpec[], shimDir: string): Promise<void> {
  const activeCommands = new Set(missingTools.map((tool) => tool.command));
  for (const tool of missingTools) {
    await writeToolShim(tool, shimDir);
  }
  await removeUnusedShims(shimDir, activeCommands);
}

async function ensureWindowsUserPath(shimDir: string): Promise<void> {
  const psShimDir = shimDir.replace(/'/g, "''");
  const script = [
    `$shimDir = '${psShimDir}'`,
    '$current = [Environment]::GetEnvironmentVariable(\'Path\', \'User\')',
    '$parts = @()',
    'if ($current) {',
    '  $parts = $current -split \';\' | Where-Object { $_ }',
    '}',
    '$parts = $parts | Where-Object { [string]::Compare($_, $shimDir, $true) -ne 0 }',
    '$parts += $shimDir',
    '[Environment]::SetEnvironmentVariable(\'Path\', ($parts -join \';\'), \'User\')',
  ].join('; ');

  const result = await runProcess(WINDOWS_POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    shell: false,
    timeoutMs: 8000,
  });

  if (result.code !== 0) {
    logger.warn(`[GlobalTools] Failed to update Windows user PATH: ${result.stderr || result.stdout}`);
    return;
  }

  process.env.PATH = appendPathEntry(process.env.PATH, shimDir, 'win32');
}

async function updateShellRcFile(filePath: string): Promise<void> {
  const markerBlock = getPosixShellMarkerBlock();
  const existing = existsSync(filePath) ? await readFile(filePath, 'utf-8') : '';
  const next = upsertMarkerBlock(existing, markerBlock);

  if (next === existing) {
    return;
  }

  await writeFile(filePath, next.endsWith('\n') ? next : `${next}\n`, 'utf-8');
}

async function ensureMacShellIntegration(): Promise<void> {
  const envScriptPath = getGlobalEnvScriptPath();
  const supportDir = getGlobalSupportDir();

  await mkdir(supportDir, { recursive: true });
  await writeFile(envScriptPath, buildPosixEnvScript(), 'utf-8');

  for (const rcFile of MAC_SHELL_RC_FILES) {
    await updateShellRcFile(join(homedir(), rcFile));
  }
}

async function ensureMacShellAccess(): Promise<void> {
  for (const rcFile of MAC_SHELL_RC_FILES) {
    const rcPath = join(homedir(), rcFile);
    try {
      await access(rcPath);
    } catch {
      // File may not exist yet; this is fine.
    }
  }
}

export async function ensureGlobalRuntimeShims(): Promise<void> {
  if (!app.isPackaged) {
    return;
  }
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return;
  }

  const shimDir = getGlobalShimDir();
  const missingTools: ToolSpec[] = [];

  if (process.platform === 'darwin') {
    await ensureMacShellAccess();
  }

  for (const spec of TOOL_SPECS) {
    try {
      if (await isToolMissing(spec, shimDir)) {
        missingTools.push(spec);
      }
    } catch (error) {
      logger.warn(`[GlobalTools] Failed to probe ${spec.command}, treating as missing`, error);
      missingTools.push(spec);
    }
  }

  await syncShimFiles(missingTools, shimDir);

  if (missingTools.length > 0) {
    if (process.platform === 'win32') {
      await ensureWindowsUserPath(shimDir);
    } else if (process.platform === 'darwin') {
      await ensureMacShellIntegration();
    }
  }

  logger.info(
    `[GlobalTools] Missing tools: ${
      missingTools.length > 0 ? missingTools.map((tool) => tool.command).join(', ') : 'none'
    }`
  );
}
