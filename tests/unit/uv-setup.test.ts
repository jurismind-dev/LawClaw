import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const childProcessMocks = vi.hoisted(() => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const electronMocks = vi.hoisted(() => ({
  app: {
    isPackaged: true,
  },
}));

const uvEnvMocks = vi.hoisted(() => ({
  getUvMirrorEnv: vi.fn(async () => ({})),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const pathMocks = vi.hoisted(() => ({
  needsWinShell: vi.fn(() => false),
  quoteForCmd: vi.fn((value: string) => value),
  getClawXConfigDir: vi.fn(() => '/Users/test/.LawClaw'),
}));

vi.mock('child_process', () => ({
  execSync: childProcessMocks.execSync,
  spawn: childProcessMocks.spawn,
  default: {
    execSync: childProcessMocks.execSync,
    spawn: childProcessMocks.spawn,
  },
}));

vi.mock('fs', () => ({
  existsSync: fsMocks.existsSync,
  rmSync: fsMocks.rmSync,
  writeFileSync: fsMocks.writeFileSync,
  default: {
    existsSync: fsMocks.existsSync,
    rmSync: fsMocks.rmSync,
    writeFileSync: fsMocks.writeFileSync,
  },
}));

vi.mock('electron', () => ({
  app: electronMocks.app,
}));

vi.mock('@electron/utils/uv-env', () => ({
  getUvMirrorEnv: uvEnvMocks.getUvMirrorEnv,
}));

vi.mock('@electron/utils/logger', () => ({
  logger: loggerMocks,
}));

vi.mock('@electron/utils/paths', () => ({
  needsWinShell: pathMocks.needsWinShell,
  quoteForCmd: pathMocks.quoteForCmd,
  getClawXConfigDir: pathMocks.getClawXConfigDir,
}));

type FakeChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

function createFakeChildProcess(): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function queueSpawnResult(options: { code?: number; stdout?: string; stderr?: string }) {
  childProcessMocks.spawn.mockImplementationOnce(() => {
    const child = createFakeChildProcess();
    queueMicrotask(() => {
      if (options.stdout) {
        child.stdout.emit('data', options.stdout);
      }
      if (options.stderr) {
        child.stderr.emit('data', options.stderr);
      }
      child.emit('close', options.code ?? 0);
    });
    return child;
  });
}

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

describe('uv managed python setup', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath = '/bundle';
    fsMocks.existsSync.mockImplementation(() => true);
    pathMocks.getClawXConfigDir.mockReturnValue('/Users/test/.LawClaw');
    setPlatform('darwin');
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it('installs baseline managed Python packages on macOS', async () => {
    const managedPython = '/Users/test/.local/share/uv/python/cpython-3.12.11/bin/python3';
    const managedVenvPython = '/Users/test/.LawClaw/support/managed-python/3.12/darwin/bin/python';
    let venvExists = false;
    fsMocks.existsSync.mockImplementation((value) => {
      if (value === managedVenvPython) {
        const current = venvExists;
        venvExists = true;
        return current;
      }
      return true;
    });
    queueSpawnResult({});
    queueSpawnResult({ stdout: `${managedPython}\n` });
    queueSpawnResult({});
    queueSpawnResult({});
    queueSpawnResult({});

    const mod = await import('@electron/utils/uv-setup');
    await mod.setupManagedPython();

    expect(childProcessMocks.spawn).toHaveBeenCalledTimes(5);
    expect(childProcessMocks.spawn.mock.calls[0]?.[1]).toEqual(['python', 'install', '3.12']);
    expect(childProcessMocks.spawn.mock.calls[1]?.[1]).toEqual(['python', 'find', '3.12', '--managed-python']);
    expect(childProcessMocks.spawn.mock.calls[2]?.[1]).toEqual([
      'venv',
      '--no-project',
      '--clear',
      '--python',
      managedPython,
      '/Users/test/.LawClaw/support/managed-python/3.12/darwin',
    ]);
    expect(childProcessMocks.spawn.mock.calls[3]?.[1]).toEqual([
      'pip',
      'install',
      '--python',
      managedVenvPython,
      '--strict',
      'python-docx',
      'openpyxl',
      'lxml',
      'defusedxml',
    ]);
    expect(childProcessMocks.spawn.mock.calls[4]?.[0]).toBe(managedVenvPython);
  });

  it('includes pywin32 when installing the managed Python baseline on Windows', async () => {
    setPlatform('win32');
    pathMocks.getClawXConfigDir.mockReturnValue('C:\\Users\\test\\.LawClaw');
    const managedPython = 'C:\\Users\\test\\AppData\\Roaming\\uv\\python\\cpython-3.12.11-windows-x86_64-none\\python.exe';
    const managedVenvRoot = join('C:\\Users\\test\\.LawClaw', 'support', 'managed-python', '3.12', 'win32');
    const managedVenvPython = join(managedVenvRoot, 'Scripts', 'python.exe');
    let venvExists = false;
    fsMocks.existsSync.mockImplementation((value) => {
      if (value === managedVenvPython) {
        const current = venvExists;
        venvExists = true;
        return current;
      }
      return true;
    });
    queueSpawnResult({});
    queueSpawnResult({ stdout: `${managedPython}\r\n` });
    queueSpawnResult({});
    queueSpawnResult({});
    queueSpawnResult({});

    const mod = await import('@electron/utils/uv-setup');
    await mod.setupManagedPython();

    expect(childProcessMocks.spawn.mock.calls[2]?.[1]).toEqual([
      'venv',
      '--no-project',
      '--clear',
      '--python',
      managedPython,
      managedVenvRoot,
    ]);
    expect(childProcessMocks.spawn.mock.calls[3]?.[1]).toEqual([
      'pip',
      'install',
      '--python',
      managedVenvPython,
      '--strict',
      'python-docx',
      'openpyxl',
      'lxml',
      'defusedxml',
      'pywin32',
    ]);
  });

  it('treats missing managed Python modules as not ready', async () => {
    const managedPython = '/Users/test/.local/share/uv/python/cpython-3.12.11/bin/python3';
    const managedVenvPython = '/Users/test/.LawClaw/support/managed-python/3.12/darwin/bin/python';
    fsMocks.existsSync.mockImplementation((value) => value !== managedVenvPython ? true : false);
    queueSpawnResult({ stdout: `${managedPython}\n` });

    const mod = await import('@electron/utils/uv-setup');

    await expect(mod.isPythonReady()).resolves.toBe(false);
    expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
    expect(childProcessMocks.spawn.mock.calls[0]?.[1]).toEqual(['python', 'find', '3.12', '--managed-python']);
  });
});
