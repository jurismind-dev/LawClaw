import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '0.0.0-test'),
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

import { repairInstalledWeixinPluginIfNeeded } from '@electron/utils/weixin-onboarding';

describe('weixin plugin repair', () => {
  it('reinstalls configured weixin plugin when version mismatches', async () => {
    const runOpenClawCliCommand = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        stdout: '',
        stderr: '',
      })
      .mockResolvedValueOnce({
        success: true,
        stdout: '',
        stderr: '',
      });

    const result = await repairInstalledWeixinPluginIfNeeded({
      readOpenClawConfig: vi.fn(async () => ({
        channels: {
          'openclaw-weixin': {
            enabled: true,
          },
        },
      })),
      hasStoredWeixinCredentials: vi.fn(async () => true),
      isWeixinPluginInstalledDirPresent: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
      getInstalledWeixinPluginVersion: vi
        .fn()
        .mockResolvedValueOnce('1.0.3')
        .mockResolvedValueOnce('2.1.7'),
      detectPluginInstallationState: vi.fn(() => ({
        installed: true,
        source: 'extensions',
      })),
      runOpenClawCliCommand,
      removeInstalledPluginDir: vi.fn(() => true),
      getOpenClawConfigDir: vi.fn(() => '/tmp/.openclaw'),
    });

    expect(result).toMatchObject({
      repaired: true,
      reason: 'repaired',
      installedVersion: '2.1.7',
    });
    expect(runOpenClawCliCommand).toHaveBeenNthCalledWith(1, [
      'plugins',
      'uninstall',
      'openclaw-weixin',
    ]);
    expect(runOpenClawCliCommand).toHaveBeenNthCalledWith(2, [
      'plugins',
      'install',
      '@tencent-weixin/openclaw-weixin@2.1.7',
    ]);
  });

  it('skips repair when weixin is not configured by the user', async () => {
    const runOpenClawCliCommand = vi.fn();

    const result = await repairInstalledWeixinPluginIfNeeded({
      readOpenClawConfig: vi.fn(async () => ({})),
      hasStoredWeixinCredentials: vi.fn(async () => false),
      isWeixinPluginInstalledDirPresent: vi.fn(async () => false),
      getInstalledWeixinPluginVersion: vi.fn(async () => null),
      detectPluginInstallationState: vi.fn(() => ({ installed: false })),
      runOpenClawCliCommand,
      removeInstalledPluginDir: vi.fn(() => false),
      getOpenClawConfigDir: vi.fn(() => '/tmp/.openclaw'),
    });

    expect(result).toMatchObject({
      repaired: false,
      reason: 'not-configured',
      installedVersion: null,
    });
    expect(runOpenClawCliCommand).not.toHaveBeenCalled();
  });
});
