import { describe, expect, it, vi } from 'vitest';
import {
  ensureBundledUv,
  getMissingUvBinaries,
  getRequiredUvBinaries,
  resolvePlatformGroup,
} from '../../scripts/ensure-bundled-uv.mjs';

describe('ensure bundled uv', () => {
  it('resolves platform group from node platform when no explicit platform is provided', () => {
    expect(resolvePlatformGroup(undefined, 'win32')).toBe('win');
    expect(resolvePlatformGroup(undefined, 'darwin')).toBe('mac');
    expect(resolvePlatformGroup(undefined, 'linux')).toBe('linux');
  });

  it('throws for unsupported platform input', () => {
    expect(() => resolvePlatformGroup('android', 'linux')).toThrow('Unsupported platform');
  });

  it('returns required windows binaries for both architectures', () => {
    const bins = getRequiredUvBinaries('win', 'C:\\repo');
    expect(bins).toEqual([
      {
        target: 'win32-x64',
        path: 'C:\\repo\\resources\\bin\\win32-x64\\uv.exe',
      },
      {
        target: 'win32-arm64',
        path: 'C:\\repo\\resources\\bin\\win32-arm64\\uv.exe',
      },
    ]);
  });

  it('detects missing binaries using custom exists function', () => {
    const bins = getRequiredUvBinaries('win', 'C:\\repo');
    const existing = new Set(['C:\\repo\\resources\\bin\\win32-x64\\uv.exe']);
    const missing = getMissingUvBinaries(bins, (filePath) => existing.has(filePath));

    expect(missing).toEqual([
      {
        target: 'win32-arm64',
        path: 'C:\\repo\\resources\\bin\\win32-arm64\\uv.exe',
      },
    ]);
  });

  it('downloads once when required binaries are missing', async () => {
    const existing = new Set<string>();
    const downloadFn = vi.fn(async () => {
      existing.add('C:\\repo\\resources\\bin\\win32-x64\\uv.exe');
      existing.add('C:\\repo\\resources\\bin\\win32-arm64\\uv.exe');
    });

    const result = await ensureBundledUv({
      platform: 'win',
      rootDir: 'C:\\repo',
      existsFn: (filePath) => existing.has(filePath),
      downloadFn,
      logger: { info: vi.fn() },
    });

    expect(downloadFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      platform: 'win',
      downloaded: true,
      binaries: [
        {
          target: 'win32-x64',
          path: 'C:\\repo\\resources\\bin\\win32-x64\\uv.exe',
        },
        {
          target: 'win32-arm64',
          path: 'C:\\repo\\resources\\bin\\win32-arm64\\uv.exe',
        },
      ],
    });
  });
});
