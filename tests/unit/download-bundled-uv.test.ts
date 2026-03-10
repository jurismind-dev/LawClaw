import { describe, expect, it, vi } from 'vitest';
import {
  downloadBundledUv,
  isDirectExecution,
  setupTarget,
} from '../../scripts/download-bundled-uv.mjs';

function createDeps(hostPlatform: NodeJS.Platform = 'win32') {
  const fsImpl = {
    remove: vi.fn(async () => undefined),
    ensureDir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    pathExists: vi.fn(async () => false),
    move: vi.fn(async () => undefined),
    chmod: vi.fn(async () => undefined),
  };
  const deps = {
    fetchImpl: vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })),
    fsImpl,
    globImpl: vi.fn(async (pattern: string) => {
      if (pattern.includes('uv.exe')) {
        return ['C:\\temp\\uv.exe'];
      }
      return ['/tmp/uv'];
    }),
    hostPlatform,
    execFileSyncImpl: vi.fn(),
    shellExec: vi.fn(async () => undefined),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };

  return { deps, fsImpl };
}

describe('download bundled uv', () => {
  it('is import-safe under vitest', () => {
    expect(isDirectExecution()).toBe(false);
  });

  it('treats the script as directly executed only when it is the main entry argv', () => {
    expect(
      isDirectExecution(
        ['node', 'C:\\repo\\scripts\\download-bundled-uv.mjs'],
        'C:\\repo\\scripts\\download-bundled-uv.mjs'
      )
    ).toBe(true);
  });

  it('does not treat later argv entries as direct execution', () => {
    expect(
      isDirectExecution(
        [
          'node',
          'C:\\repo\\scripts\\ensure-bundled-uv.mjs',
          'C:\\repo\\scripts\\download-bundled-uv.mjs',
        ],
        'C:\\repo\\scripts\\download-bundled-uv.mjs'
      )
    ).toBe(false);
  });

  it('downloads both Windows targets for the win platform', async () => {
    const { deps } = createDeps('win32');

    await downloadBundledUv({ platform: 'win', deps });

    expect(deps.fetchImpl).toHaveBeenCalledTimes(2);
    expect(deps.execFileSyncImpl).toHaveBeenCalledTimes(2);
    expect(deps.shellExec).not.toHaveBeenCalledWith(expect.stringContaining('unzip'));
  });

  it('dispatches all supported targets when all=true', async () => {
    const { deps } = createDeps('linux');

    await downloadBundledUv({ all: true, deps });

    expect(deps.fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('uses PowerShell extraction for Windows zip targets on a Windows host', async () => {
    const { deps } = createDeps('win32');

    await setupTarget('win32-x64', deps);

    expect(deps.execFileSyncImpl).toHaveBeenCalledTimes(1);
    expect(deps.execFileSyncImpl).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-Command', expect.stringContaining('ExtractToDirectory')]),
      { stdio: 'inherit' }
    );
    expect(deps.shellExec).not.toHaveBeenCalled();
  });

  it('cleans up temporary files when extraction cannot find the binary', async () => {
    const { deps, fsImpl } = createDeps('linux');
    deps.globImpl = vi.fn(async () => []);

    await expect(setupTarget('linux-x64', deps)).rejects.toThrow(
      'Could not find uv in extracted files.'
    );

    expect(fsImpl.remove).toHaveBeenCalledWith(expect.stringContaining('uv-x86_64-unknown-linux-gnu.tar.gz'));
    expect(fsImpl.remove).toHaveBeenCalledWith(expect.stringContaining('temp_uv_extract'));
  });
});
