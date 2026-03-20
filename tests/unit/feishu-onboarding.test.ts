import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp/lawclaw-test',
    getVersion: () => '0.0.0-test',
  },
}));

import { FEISHU_OFFICIAL_PLUGIN_NPM_SPEC } from '@electron/utils/feishu-official-plugin';
import {
  resolveFeishuOfficialPluginInstallSpec,
  shouldReinstallFeishuOfficialPlugin,
} from '@electron/utils/feishu-onboarding';

describe('feishu onboarding install behavior', () => {
  it('does not treat QR refresh as plugin reinstall', () => {
    expect(shouldReinstallFeishuOfficialPlugin({ forceRefresh: true })).toBe(false);
    expect(shouldReinstallFeishuOfficialPlugin({ resetAuth: true })).toBe(false);
    expect(shouldReinstallFeishuOfficialPlugin({ reinstallPlugin: true })).toBe(true);
  });

  it('prefers bundled plugin directory when it is available', () => {
    const bundledDir = '/app/resources/plugins/openclaw-lark';

    expect(
      resolveFeishuOfficialPluginInstallSpec({
        isPackaged: false,
        resourcesDir: '/app/resources',
        pathExists: (candidate) => candidate === bundledDir,
      })
    ).toBe(bundledDir);
  });

  it('falls back to npm install spec in development when no bundled plugin directory exists', () => {
    expect(
      resolveFeishuOfficialPluginInstallSpec({
        isPackaged: false,
        resourcesDir: '/app/resources',
        resourcesPath: '/app',
        pathExists: () => false,
      })
    ).toBe(FEISHU_OFFICIAL_PLUGIN_NPM_SPEC);
  });

  it('fails fast in packaged mode when the bundled plugin directory is missing', () => {
    expect(() =>
      resolveFeishuOfficialPluginInstallSpec({
        isPackaged: true,
        resourcesDir: '/app/resources',
        resourcesPath: '/app',
        pathExists: () => false,
      })
    ).toThrow(/Bundled plugin directory not found/);
  });
});
