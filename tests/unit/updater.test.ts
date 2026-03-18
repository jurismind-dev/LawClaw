import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkForUpdatesMock = vi.fn();
const downloadUpdateMock = vi.fn();
const quitAndInstallMock = vi.fn();
const setFeedUrlMock = vi.fn();
const onMock = vi.fn();
const openExternalMock = vi.fn();
const getVersionMock = vi.fn(() => '0.1.4');
const getAppPathMock = vi.fn();

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: undefined,
    channel: 'latest',
    setFeedURL: setFeedUrlMock,
    on: onMock,
    checkForUpdates: checkForUpdatesMock,
    downloadUpdate: downloadUpdateMock,
    quitAndInstall: quitAndInstallMock,
  },
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  app: {
    getVersion: getVersionMock,
    getAppPath: getAppPathMock,
  },
  ipcMain: {
    handle: vi.fn(),
  },
  shell: {
    openExternal: openExternalMock,
  },
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AppUpdater', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    checkForUpdatesMock.mockResolvedValue({ updateInfo: null });
    downloadUpdateMock.mockResolvedValue(undefined);
    openExternalMock.mockResolvedValue(undefined);
    getVersionMock.mockReturnValue('0.1.4');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('../../electron/utils/build-flags');

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses the external installer flow for unsigned mac builds', async () => {
    vi.doMock('../../electron/utils/build-flags', () => ({
      isUnsignedMacBuild: () => true,
    }));

    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-updater-'));
    tempDirs.push(tempRoot);
    getAppPathMock.mockReturnValue(tempRoot);
    writeFileSync(join(tempRoot, 'package.json'), '{"name":"lawclaw"}\n', 'utf8');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => {
          if (name === 'x-oss-meta-version') return '0.1.5';
          if (name === 'x-oss-meta-release-date') return '2026-03-18T00:00:00.000Z';
          return null;
        },
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { AppUpdater } = await import('@electron/main/updater');
    const updater = new AppUpdater();

    const info = await updater.checkForUpdates();

    expect(checkForUpdatesMock).not.toHaveBeenCalled();
    expect(info?.version).toBe('0.1.5');
    expect(updater.getStatus().status).toBe('available');
    expect(updater.getStatus().manualInstall).toBe(true);

    await updater.downloadUpdate();

    expect(openExternalMock).toHaveBeenCalledTimes(1);
    expect(openExternalMock.mock.calls[0]?.[0]).toMatch(/LawClaw-mac-(arm64|x64)\.dmg$/);
    expect(updater.getStatus().status).toBe('downloaded');
  });

  it('keeps the native updater flow for signed builds', async () => {
    vi.doMock('../../electron/utils/build-flags', () => ({
      isUnsignedMacBuild: () => false,
    }));

    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-updater-'));
    tempDirs.push(tempRoot);
    getAppPathMock.mockReturnValue(tempRoot);
    writeFileSync(join(tempRoot, 'package.json'), '{"name":"lawclaw"}\n', 'utf8');

    const { AppUpdater } = await import('@electron/main/updater');
    const updater = new AppUpdater();

    await updater.checkForUpdates();

    expect(checkForUpdatesMock).toHaveBeenCalled();
    expect(updater.getStatus().manualInstall).toBe(false);
  });
});
