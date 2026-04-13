import { app } from 'electron';
import { execSync, spawn } from 'child_process';
import { existsSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getUvMirrorEnv } from './uv-env';
import { logger } from './logger';
import { getClawXConfigDir, needsWinShell, quoteForCmd } from './paths';

const MANAGED_PYTHON_VERSION = '3.12';
const MANAGED_PYTHON_READY_MARKER = '.lawclaw-managed-python-ready.json';
const MANAGED_PYTHON_BASE_PACKAGES = ['python-docx', 'openpyxl', 'lxml', 'defusedxml'];
const MANAGED_PYTHON_WINDOWS_PACKAGES = ['pywin32'];
const MANAGED_PYTHON_BASE_IMPORTS = ['docx', 'openpyxl', 'lxml', 'defusedxml'];
const MANAGED_PYTHON_WINDOWS_IMPORTS = ['pythoncom', 'win32com.client'];
const WINDOWS_MINOR_LINK_ERROR_MARKERS = ['python minor version link directory', 'os error 4390', 'not a reparse point'];

function getManagedPythonPackages(platform = process.platform): string[] {
  return platform === 'win32'
    ? [...MANAGED_PYTHON_BASE_PACKAGES, ...MANAGED_PYTHON_WINDOWS_PACKAGES]
    : [...MANAGED_PYTHON_BASE_PACKAGES];
}

function getManagedPythonImports(platform = process.platform): string[] {
  return platform === 'win32'
    ? [...MANAGED_PYTHON_BASE_IMPORTS, ...MANAGED_PYTHON_WINDOWS_IMPORTS]
    : [...MANAGED_PYTHON_BASE_IMPORTS];
}

function getManagedPythonDependencyCheckScript(platform = process.platform): string {
  return `import importlib
modules = ${JSON.stringify(getManagedPythonImports(platform))}
missing = []
for name in modules:
    try:
        importlib.import_module(name)
    except Exception as exc:
        missing.append(f"{name}: {exc}")
if missing:
    print("\\n".join(missing))
    raise SystemExit(1)
`;
}

function getManagedPythonVenvDir(platform = process.platform): string {
  return join(getClawXConfigDir(), 'support', 'managed-python', MANAGED_PYTHON_VERSION, platform);
}

function getManagedPythonVenvExecutable(platform = process.platform): string {
  const venvDir = getManagedPythonVenvDir(platform);
  return platform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python');
}

function getManagedPythonReadyMarkerPath(platform = process.platform): string {
  return join(getManagedPythonVenvDir(platform), MANAGED_PYTHON_READY_MARKER);
}

function clearManagedPythonReadyMarker(platform = process.platform): void {
  try {
    rmSync(getManagedPythonReadyMarkerPath(platform), { force: true });
  } catch (error) {
    logger.debug('Failed to clear managed Python ready marker:', error);
  }
}

function writeManagedPythonReadyMarker(platform = process.platform): void {
  try {
    const payload = JSON.stringify(
      {
        version: MANAGED_PYTHON_VERSION,
        platform,
        packages: getManagedPythonPackages(platform),
      },
      null,
      2
    );
    writeFileSync(getManagedPythonReadyMarkerPath(platform), `${payload}\n`, 'utf-8');
  } catch (error) {
    logger.debug('Failed to write managed Python ready marker:', error);
  }
}

/**
 * Get the path to the bundled uv binary
 */
function getBundledUvPath(): string {
  const platform = process.platform;
  const arch = process.arch;
  const target = `${platform}-${arch}`;
  const binName = platform === 'win32' ? 'uv.exe' : 'uv';

  if (app.isPackaged) {
    return join(process.resourcesPath, 'bin', binName);
  }
  return join(process.cwd(), 'resources', 'bin', target, binName);
}

/**
 * Resolve the best uv binary to use.
 *
 * In packaged mode we always prefer the bundled binary so we never accidentally
 * pick up a system-wide uv that may be a different (possibly broken) version.
 * In dev we fall through to the system PATH for convenience.
 */
function resolveUvBin(): { bin: string; source: 'bundled' | 'path' | 'bundled-fallback' } {
  const bundled = getBundledUvPath();

  if (app.isPackaged) {
    if (existsSync(bundled)) {
      return { bin: bundled, source: 'bundled' };
    }
    logger.warn(`Bundled uv binary not found at ${bundled}, falling back to system PATH`);
  }

  const found = findUvInPathSync();
  if (found) return { bin: 'uv', source: 'path' };

  if (existsSync(bundled)) {
    return { bin: bundled, source: 'bundled-fallback' };
  }

  return { bin: 'uv', source: 'path' };
}

function findUvInPathSync(): boolean {
  try {
    const cmd = process.platform === 'win32' ? 'where.exe uv' : 'which uv';
    execSync(cmd, { stdio: 'ignore', timeout: 5000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if uv is available (either bundled or in system PATH)
 */
export async function checkUvInstalled(): Promise<boolean> {
  const { bin, source } = resolveUvBin();
  if (source === 'bundled' || source === 'bundled-fallback') {
    return existsSync(bin);
  }
  return findUvInPathSync();
}

/**
 * "Install" uv - now just verifies that uv is available somewhere.
 * Kept for API compatibility with frontend.
 */
export async function installUv(): Promise<void> {
  const isAvailable = await checkUvInstalled();
  if (!isAvailable) {
    const bin = getBundledUvPath();
    throw new Error(`uv not found in system PATH and bundled binary missing at ${bin}`);
  }
  logger.info('uv is available and ready to use');
}

async function findManagedPythonPath(uvBin: string, env: Record<string, string | undefined>): Promise<string> {
  const useShell = needsWinShell(uvBin);

  return await new Promise<string>((resolve, reject) => {
    let output = '';
    let errorOutput = '';
    const child = spawn(
      useShell ? quoteForCmd(uvBin) : uvBin,
      ['python', 'find', MANAGED_PYTHON_VERSION, '--managed-python'],
      {
        shell: useShell,
        env,
        windowsHide: true,
      }
    );

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });
    child.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Managed Python lookup failed with code ${code}\n` +
              `  uv binary: ${uvBin}\n` +
              `  platform: ${process.platform}/${process.arch}\n` +
              `  output: ${(errorOutput || output || '(no output captured)').trim()}`
          )
        );
        return;
      }

      const candidate = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);

      if (!candidate) {
        reject(new Error(`Managed Python ${MANAGED_PYTHON_VERSION} path was empty`));
        return;
      }

      resolve(candidate);
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Managed Python lookup spawn error: ${err.message}\n` +
            `  uv binary: ${uvBin}\n` +
            `  platform: ${process.platform}/${process.arch}`
        )
      );
    });
  });
}

async function verifyManagedPythonDependencies(pythonExe: string): Promise<void> {
  const checkScript = getManagedPythonDependencyCheckScript();

  await new Promise<void>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(pythonExe, ['-c', checkScript], {
      shell: false,
      env: {
        ...process.env,
        PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
        PYTHONUTF8: process.env.PYTHONUTF8 || '1',
      },
      windowsHide: true,
    });

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Managed Python dependency verification failed with code ${code}\n` +
            `  python: ${pythonExe}\n` +
            `  platform: ${process.platform}/${process.arch}\n` +
            `  output: ${(stderr || stdout || '(no output captured)').trim()}`
        )
      );
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Managed Python verification spawn error: ${err.message}\n` +
            `  python: ${pythonExe}\n` +
            `  platform: ${process.platform}/${process.arch}`
        )
      );
    });
  });
}

async function ensureManagedPythonVenv(
  uvBin: string,
  basePythonExe: string,
  env: Record<string, string | undefined>,
  label: string
): Promise<string> {
  const platform = process.platform;
  const venvDir = getManagedPythonVenvDir(platform);
  const venvPythonExe = getManagedPythonVenvExecutable(platform);

  if (existsSync(venvPythonExe)) {
    return venvPythonExe;
  }

  const useShell = needsWinShell(uvBin);

  await new Promise<void>((resolve, reject) => {
    const stderrChunks: string[] = [];
    const stdoutChunks: string[] = [];
    const child = spawn(
      useShell ? quoteForCmd(uvBin) : uvBin,
      ['venv', '--no-project', '--clear', '--python', basePythonExe, venvDir],
      {
        shell: useShell,
        env,
        windowsHide: true,
      }
    );

    child.stdout?.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        stdoutChunks.push(line);
        logger.debug(`[python-venv:${label}] stdout: ${line}`);
      }
    });

    child.stderr?.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        stderrChunks.push(line);
        logger.info(`[python-venv:${label}] stderr: ${line}`);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stderr = stderrChunks.join('\n');
      const stdout = stdoutChunks.join('\n');
      const detail = stderr || stdout || '(no output captured)';
      reject(
        new Error(
          `Python venv creation failed with code ${code} [${label}]\n` +
            `  uv binary: ${uvBin}\n` +
            `  python: ${basePythonExe}\n` +
            `  venv: ${venvDir}\n` +
            `  platform: ${process.platform}/${process.arch}\n` +
            `  output: ${detail}`
        )
      );
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Python venv creation spawn error [${label}]: ${err.message}\n` +
            `  uv binary: ${uvBin}\n` +
            `  python: ${basePythonExe}\n` +
            `  venv: ${venvDir}\n` +
            `  platform: ${process.platform}/${process.arch}`
        )
      );
    });
  });

  if (!existsSync(venvPythonExe)) {
    throw new Error(`Managed Python venv executable not found after creation: ${venvPythonExe}`);
  }

  return venvPythonExe;
}

/**
 * Check if a managed Python 3.12 is ready and accessible
 */
export async function isPythonReady(): Promise<boolean> {
  const { bin: uvBin } = resolveUvBin();

  try {
    await findManagedPythonPath(uvBin, { ...process.env });
    const venvPythonExe = getManagedPythonVenvExecutable();
    if (!existsSync(venvPythonExe)) {
      clearManagedPythonReadyMarker();
      return false;
    }
    await verifyManagedPythonDependencies(venvPythonExe);
    writeManagedPythonReadyMarker();
    return true;
  } catch (error) {
    clearManagedPythonReadyMarker();
    logger.info('Managed Python readiness check failed:', error);
    return false;
  }
}

/**
 * Run `uv python install 3.12` once with the given environment.
 * Returns on success, throws with captured stderr on failure.
 */
async function runPythonInstall(
  uvBin: string,
  env: Record<string, string | undefined>,
  label: string
): Promise<void> {
  const useShell = needsWinShell(uvBin);

  return new Promise<void>((resolve, reject) => {
    const stderrChunks: string[] = [];
    const stdoutChunks: string[] = [];

    const child = spawn(
      useShell ? quoteForCmd(uvBin) : uvBin,
      ['python', 'install', MANAGED_PYTHON_VERSION],
      {
        shell: useShell,
        env,
        windowsHide: true,
      }
    );

    child.stdout?.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        stdoutChunks.push(line);
        logger.debug(`[python-setup:${label}] stdout: ${line}`);
      }
    });

    child.stderr?.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        stderrChunks.push(line);
        logger.info(`[python-setup:${label}] stderr: ${line}`);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stderr = stderrChunks.join('\n');
      const stdout = stdoutChunks.join('\n');
      const detail = stderr || stdout || '(no output captured)';
      reject(
        new Error(
          `Python installation failed with code ${code} [${label}]\n` +
            `  uv binary: ${uvBin}\n` +
            `  platform: ${process.platform}/${process.arch}\n` +
            `  output: ${detail}`
        )
      );
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Python installation spawn error [${label}]: ${err.message}\n` +
            `  uv binary: ${uvBin}\n` +
            `  platform: ${process.platform}/${process.arch}`
        )
      );
    });
  });
}

async function runPythonPackageInstall(
  uvBin: string,
  pythonExe: string,
  env: Record<string, string | undefined>,
  label: string
): Promise<void> {
  const useShell = needsWinShell(uvBin);
  const packages = getManagedPythonPackages();

  return new Promise<void>((resolve, reject) => {
    const stderrChunks: string[] = [];
    const stdoutChunks: string[] = [];
    const child = spawn(
      useShell ? quoteForCmd(uvBin) : uvBin,
      ['pip', 'install', '--python', pythonExe, '--strict', ...packages],
      {
        shell: useShell,
        env,
        windowsHide: true,
      }
    );

    child.stdout?.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        stdoutChunks.push(line);
        logger.debug(`[python-packages:${label}] stdout: ${line}`);
      }
    });

    child.stderr?.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        stderrChunks.push(line);
        logger.info(`[python-packages:${label}] stderr: ${line}`);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stderr = stderrChunks.join('\n');
      const stdout = stdoutChunks.join('\n');
      const detail = stderr || stdout || '(no output captured)';
      reject(
        new Error(
          `Python package installation failed with code ${code} [${label}]\n` +
            `  uv binary: ${uvBin}\n` +
            `  python: ${pythonExe}\n` +
            `  platform: ${process.platform}/${process.arch}\n` +
            `  packages: ${packages.join(', ')}\n` +
            `  output: ${detail}`
        )
      );
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Python package installation spawn error [${label}]: ${err.message}\n` +
            `  uv binary: ${uvBin}\n` +
            `  python: ${pythonExe}\n` +
            `  platform: ${process.platform}/${process.arch}`
        )
      );
    });
  });
}

async function runWithMirrorRetry<T>(
  baseEnv: Record<string, string | undefined>,
  uvEnv: Record<string, string | undefined>,
  action: (env: Record<string, string | undefined>, label: string) => Promise<T>,
  description: string
): Promise<T> {
  const hasMirror = Object.keys(uvEnv).length > 0;

  try {
    return await action(hasMirror ? { ...baseEnv, ...uvEnv } : baseEnv, hasMirror ? 'mirror' : 'default');
  } catch (firstError) {
    logger.warn(`${description} attempt 1 failed:`, firstError);

    if (!hasMirror) {
      throw firstError;
    }

    logger.info(`Retrying ${description} without mirror...`);
    try {
      return await action(baseEnv, 'no-mirror');
    } catch (secondError) {
      logger.error(`${description} attempt 2 (no-mirror) also failed:`, secondError);
      throw secondError;
    }
  }
}

function isWindowsMinorLinkError(error: unknown): boolean {
  if (process.platform !== 'win32') {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  return WINDOWS_MINOR_LINK_ERROR_MARKERS.every((marker) => lowerMessage.includes(marker));
}

function formatManagedPythonInstallError(error: unknown): Error {
  if (!isWindowsMinorLinkError(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `${message}\n` +
      `  diagnosis: Detected a corrupted uv Windows Python version link/junction.\n` +
      `  note: LawClaw now retries after clearing the stale uv Python link directories reported by uv.`
  );
}

function extractWindowsMinorLinkCleanupPaths(error: unknown): string[] {
  if (!isWindowsMinorLinkError(error)) {
    return [];
  }

  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/minor version link directory at (.+?) from (.+?)(?:\r?\n|$)/i);
  if (!match) {
    return [];
  }

  return Array.from(
    new Set(
      match
        .slice(1)
        .map((value) => value.trim().replace(/^"+|"+$/g, ''))
        .filter((value) => /^[a-z]:\\/i.test(value)),
    ),
  );
}

function clearWindowsMinorLinkPaths(paths: string[]): void {
  for (const target of paths) {
    try {
      rmSync(target, { recursive: true, force: true });
    } catch (error) {
      logger.debug(`Failed to clear stale uv Python path ${target}:`, error);
    }
  }
}

/**
 * Use bundled uv to install a managed Python version (default 3.12).
 *
 * Tries with mirror env first (for CN region), then retries without mirror
 * if the first attempt fails, to rule out mirror-specific issues.
 */
export async function setupManagedPython(): Promise<void> {
  const { bin: uvBin, source } = resolveUvBin();
  const uvEnv = await getUvMirrorEnv();
  const packages = getManagedPythonPackages();
  const platform = process.platform;

  logger.info(
    `Setting up managed Python ${MANAGED_PYTHON_VERSION} ` +
      `(uv=${uvBin}, source=${source}, arch=${process.arch}, packages=${packages.join(', ')})`
  );

  clearManagedPythonReadyMarker(platform);

  try {
    await runWithMirrorRetry(
      { ...process.env },
      uvEnv,
      async (env, label) => {
        await runPythonInstall(uvBin, env, label);
      },
      'Python install'
    );
  } catch (error) {
    if (!isWindowsMinorLinkError(error)) {
      throw error;
    }

    const cleanupPaths = extractWindowsMinorLinkCleanupPaths(error);
    logger.warn(
      `Detected corrupted uv-managed Python link metadata on Windows, clearing stale uv Python paths and retrying once...`,
      error
    );
    if (cleanupPaths.length > 0) {
      clearWindowsMinorLinkPaths(cleanupPaths);
    }

    try {
      await runWithMirrorRetry(
        { ...process.env },
        uvEnv,
        async (env, label) => {
          await runPythonInstall(uvBin, env, `${label}-after-reset`);
        },
        'Python install'
      );
    } catch (retryError) {
      throw formatManagedPythonInstallError(retryError);
    }
  }

  const basePythonExe = await findManagedPythonPath(uvBin, { ...process.env });
  const venvPythonExe = await ensureManagedPythonVenv(uvBin, basePythonExe, { ...process.env }, 'default');

  await runWithMirrorRetry(
    { ...process.env },
    uvEnv,
    async (env, label) => {
      await runPythonPackageInstall(uvBin, venvPythonExe, env, label);
    },
    'Python package install'
  );

  await verifyManagedPythonDependencies(venvPythonExe);
  writeManagedPythonReadyMarker(platform);
  logger.info(
    `Managed Python ${MANAGED_PYTHON_VERSION} runtime ready ` +
      `(base=${basePythonExe}, venv=${venvPythonExe})`
  );
}
