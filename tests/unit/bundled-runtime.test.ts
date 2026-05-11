import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  app: {
    isPackaged: false,
  },
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  writeFileSync: vi.fn(),
}));

vi.mock('electron', () => ({
  app: electronMocks.app,
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: fsMocks.existsSync,
    writeFileSync: fsMocks.writeFileSync,
    default: {
      ...actual,
      existsSync: fsMocks.existsSync,
      writeFileSync: fsMocks.writeFileSync,
    },
  };
});

const originalPlatform = process.platform;
const originalResourcesPath = process.resourcesPath;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

describe('bundled runtime environment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMocks.app.isPackaged = false;
    fsMocks.existsSync.mockReturnValue(true);
    setPlatform(originalPlatform);
    Object.defineProperty(process, 'resourcesPath', {
      value: originalResourcesPath,
      configurable: true,
    });
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    Object.defineProperty(process, 'resourcesPath', {
      value: originalResourcesPath,
      configurable: true,
    });
    electronMocks.app.isPackaged = false;
  });

  it('injects the Windows child-process hide preload into packaged runtime env', async () => {
    setPlatform('win32');
    electronMocks.app.isPackaged = true;
    Object.defineProperty(process, 'resourcesPath', {
      value: 'C:\\Program Files\\LawClaw\\resources',
      configurable: true,
    });

    const { applyBundledRuntimeToEnv } = await import('@electron/utils/bundled-runtime');
    const env = applyBundledRuntimeToEnv(
      {
        Path: 'C:\\Windows\\System32',
        NODE_OPTIONS: '--max-old-space-size=4096',
      },
      {
        nodeExecutablePath: 'C:\\Program Files\\LawClaw\\LawClaw.exe',
      },
    );

    expect(env.NODE_OPTIONS).toContain('--max-old-space-size=4096');
    expect(env.NODE_OPTIONS).toContain('--require "C:/Program Files/LawClaw/resources/resources/runtime/lawclaw-child-process-windows-hide.cjs"');
    expect(env.LAWCLAW_BUNDLED_NODE_EXE).toBe('C:\\Program Files\\LawClaw\\LawClaw.exe');
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      'C:\\Program Files\\LawClaw\\resources/resources/runtime/lawclaw-child-process-windows-hide.cjs',
      expect.stringContaining('withWindowsHide'),
      'utf-8',
    );
  });

  it('does not duplicate the Windows child-process hide preload', async () => {
    setPlatform('win32');
    electronMocks.app.isPackaged = true;
    Object.defineProperty(process, 'resourcesPath', {
      value: 'C:\\Program Files\\LawClaw\\resources',
      configurable: true,
    });

    const { applyBundledRuntimeToEnv } = await import('@electron/utils/bundled-runtime');
    const env = applyBundledRuntimeToEnv({
      NODE_OPTIONS: '--require "C:/Program Files/LawClaw/resources/resources/runtime/lawclaw-child-process-windows-hide.cjs"',
    });

    expect(env.NODE_OPTIONS?.match(/lawclaw-child-process-windows-hide\.cjs/g)).toHaveLength(1);
  });
});
