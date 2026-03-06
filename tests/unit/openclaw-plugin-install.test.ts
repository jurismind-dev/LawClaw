import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearPluginChannelConfigBackup,
  detectPluginInstallationState,
  isAlreadyInstalledErrorMessage,
  readPluginChannelConfigBackup,
  restorePluginChannelConfigAfterInstall,
  savePluginChannelConfigBackup,
  sanitizePluginPackageManifestForLocalInstall,
  stripPluginChannelConfigForStartup,
  stripPluginChannelConfigForInstall,
} from '../../electron/utils/openclaw-plugin-install';

describe('openclaw plugin install detection', () => {
  it('returns installed from extensions directory when extension exists', () => {
    const detection = detectPluginInstallationState('qqbot', {
      hasExtensionDir: true,
      config: {},
    });

    expect(detection).toEqual({ installed: true, source: 'extensions' });
  });

  it('returns installed from plugins.installs when extension directory does not exist', () => {
    const detection = detectPluginInstallationState('qqbot', {
      hasExtensionDir: false,
      config: {
        plugins: {
          installs: {
            qqbot: {
              source: './extensions/qqbot',
            },
          },
        },
      },
    });

    expect(detection).toEqual({ installed: true, source: 'plugins.installs' });
  });

  it('returns not installed when no extension or config install records exist', () => {
    const detection = detectPluginInstallationState('qqbot', {
      hasExtensionDir: false,
      config: {
        plugins: {
          installs: {},
          load: { paths: [] },
        },
      },
    });

    expect(detection).toEqual({ installed: false });
  });

  it('returns installed from plugins.load.paths when install map is missing', () => {
    const detection = detectPluginInstallationState('qqbot', {
      hasExtensionDir: false,
      config: {
        plugins: {
          load: {
            paths: ['C:/Users/demo/.openclaw/extensions/qqbot'],
          },
        },
      },
    });

    expect(detection).toEqual({ installed: true, source: 'plugins.load.paths' });
  });

  it('supports non-qq plugin id for generic local install detection', () => {
    const detection = detectPluginInstallationState('weather-bot', {
      hasExtensionDir: false,
      config: {
        plugins: {
          installs: {
            'weather-bot': {
              source: './extensions/weather-bot',
            },
          },
        },
      },
    });

    expect(detection).toEqual({ installed: true, source: 'plugins.installs' });
  });
});

describe('openclaw plugin already-installed error matcher', () => {
  it('matches already installed error messages case-insensitively', () => {
    expect(isAlreadyInstalledErrorMessage('Plugin QQBOT is ALREADY INSTALLED')).toBe(true);
  });

  it('does not match unrelated error messages', () => {
    expect(isAlreadyInstalledErrorMessage('network timeout while downloading package')).toBe(false);
  });
});

describe('openclaw plugin install config guard', () => {
  it('strips channels.qqbot before qqbot plugin install', () => {
    const input = {
      channels: {
        qqbot: { appId: '123', clientSecret: 'abc', enabled: true },
        feishu: { enabled: true },
      },
      gateway: { mode: 'local' },
    };

    const stripped = stripPluginChannelConfigForInstall(input, 'qqbot');

    expect((stripped.config.channels as Record<string, unknown>).qqbot).toBeUndefined();
    expect(stripped.removedChannelConfig).toMatchObject({
      appId: '123',
      clientSecret: 'abc',
      enabled: true,
    });

    const restored = restorePluginChannelConfigAfterInstall(
      stripped.config,
      'qqbot',
      stripped.removedChannelConfig
    );
    expect((restored.channels as Record<string, unknown>).qqbot).toMatchObject({
      appId: '123',
      clientSecret: 'abc',
      enabled: true,
    });
  });

  it('keeps config unchanged for non-qqbot plugins', () => {
    const input = {
      channels: {
        qqbot: { enabled: true },
      },
    };

    const stripped = stripPluginChannelConfigForInstall(input, 'discord');
    expect((stripped.config.channels as Record<string, unknown>).qqbot).toBeDefined();
    expect(stripped.removedChannelConfig).toBeUndefined();
  });

  it('keeps qqbot channel config when plugin is already installed', () => {
    const input = {
      channels: {
        qqbot: { appId: '123', enabled: true },
      },
    };

    const stripped = stripPluginChannelConfigForStartup(input, 'qqbot', true);

    expect((stripped.config.channels as Record<string, unknown>).qqbot).toMatchObject({
      appId: '123',
      enabled: true,
    });
    expect(stripped.removedChannelConfig).toBeUndefined();
  });
});

describe('openclaw plugin channel backup file', () => {
  let tempConfigDir = '';

  beforeEach(() => {
    tempConfigDir = mkdtempSync(join(tmpdir(), 'clawx-plugin-backup-'));
  });

  afterEach(() => {
    if (tempConfigDir) {
      rmSync(tempConfigDir, { recursive: true, force: true });
    }
  });

  it('saves and reads qqbot channel backup', () => {
    savePluginChannelConfigBackup(tempConfigDir, 'qqbot', {
      appId: '123',
      clientSecret: 'abc',
      enabled: true,
    });

    const backup = readPluginChannelConfigBackup(tempConfigDir, 'qqbot');
    expect(backup).toMatchObject({
      appId: '123',
      clientSecret: 'abc',
      enabled: true,
    });
  });

  it('clears only one plugin backup entry', () => {
    savePluginChannelConfigBackup(tempConfigDir, 'qqbot', {
      appId: '123',
      clientSecret: 'abc',
      enabled: true,
    });
    savePluginChannelConfigBackup(tempConfigDir, 'voice-call', {
      enabled: false,
    });

    clearPluginChannelConfigBackup(tempConfigDir, 'qqbot');

    expect(readPluginChannelConfigBackup(tempConfigDir, 'qqbot')).toBeUndefined();
    expect(readPluginChannelConfigBackup(tempConfigDir, 'voice-call')).toMatchObject({
      enabled: false,
    });
  });
});

describe('openclaw plugin manifest sanitizer', () => {
  let tempConfigDir = '';

  beforeEach(() => {
    tempConfigDir = mkdtempSync(join(tmpdir(), 'clawx-plugin-manifest-'));
  });

  afterEach(() => {
    if (tempConfigDir) {
      rmSync(tempConfigDir, { recursive: true, force: true });
    }
  });

  it('removes dependencies to avoid npm install in local plugin install flow', () => {
    const packageDir = join(tempConfigDir, 'package');
    const packageJsonPath = join(packageDir, 'package.json');
    rmSync(packageDir, { recursive: true, force: true });
    // Create package dir and manifest content
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      packageJsonPath,
      JSON.stringify(
        {
          name: '@sliverp/qqbot',
          version: '1.5.0',
          dependencies: { ws: '^8.18.0', 'silk-wasm': '^3.7.1' },
          devDependencies: { typescript: '^5.9.3' },
        },
        null,
        2
      ),
      'utf-8'
    );

    const result = sanitizePluginPackageManifestForLocalInstall(packageDir);
    const saved = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    expect(result.changed).toBe(true);
    expect(saved.dependencies).toEqual({});
    expect(saved.devDependencies).toMatchObject({ typescript: '^5.9.3' });
  });
});
