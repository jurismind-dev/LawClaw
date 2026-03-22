import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectPluginInstallationState,
  finalizeBundledPluginConfigAfterInstall,
  isAlreadyInstalledErrorMessage,
  sanitizePluginPackageManifestForLocalInstall,
} from '../../electron/utils/openclaw-plugin-install';

describe('openclaw plugin install detection', () => {
  it('returns installed from extensions directory when extension exists', () => {
    const detection = detectPluginInstallationState('weather-bot', {
      hasExtensionDir: true,
      config: {},
    });

    expect(detection).toEqual({ installed: true, source: 'extensions' });
  });

  it('returns installed from plugins.installs when extension directory does not exist', () => {
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

  it('returns not installed when no extension or config install records exist', () => {
    const detection = detectPluginInstallationState('weather-bot', {
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
    const detection = detectPluginInstallationState('weather-bot', {
      hasExtensionDir: false,
      config: {
        plugins: {
          load: {
            paths: ['C:/Users/demo/.openclaw/extensions/weather-bot'],
          },
        },
      },
    });

    expect(detection).toEqual({ installed: true, source: 'plugins.load.paths' });
  });
});

describe('openclaw plugin already-installed error matcher', () => {
  it('matches already installed error messages case-insensitively', () => {
    expect(isAlreadyInstalledErrorMessage('Plugin WEATHER-BOT is ALREADY INSTALLED')).toBe(true);
  });

  it('does not match unrelated error messages', () => {
    expect(isAlreadyInstalledErrorMessage('network timeout while downloading package')).toBe(false);
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
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      packageJsonPath,
      JSON.stringify(
        {
          name: '@example/weather-bot',
          version: '1.5.0',
          dependencies: { ws: '^8.18.0', zod: '^4.0.0' },
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

describe('bundled feishu plugin config finalizer', () => {
  it('disables built-in feishu plugin and enables the official bundled plugin', () => {
    const input = {
      plugins: {
        allow: ['feishu', 'other-plugin'],
        entries: {
          feishu: { enabled: true },
          'openclaw-lark': { enabled: false, source: 'bundled' },
        },
      },
    };

    const result = finalizeBundledPluginConfigAfterInstall(input, 'openclaw-lark');

    expect(result.changed).toBe(true);
    expect(result.config).toMatchObject({
      channels: {
        feishu: {
          enabled: false,
          streaming: true,
          threadSession: true,
          requireMention: true,
          footer: {
            elapsed: true,
            status: true,
          },
        },
      },
      plugins: {
        allow: ['other-plugin', 'openclaw-lark'],
        entries: {
          feishu: { enabled: false },
          'openclaw-lark': { enabled: true, source: 'bundled' },
        },
      },
    });
  });

  it('keeps unrelated plugin config unchanged', () => {
    const input = {
      plugins: {
        allow: ['custom-plugin'],
      },
    };

    const result = finalizeBundledPluginConfigAfterInstall(input, 'custom-plugin');

    expect(result.changed).toBe(false);
    expect(result.config).toEqual(input);
  });

  it('keeps existing feishu channel enablement while filling missing defaults', () => {
    const input = {
      channels: {
        feishu: {
          appId: 'cli_xxx',
          appSecret: 'secret',
          enabled: true,
          streaming: false,
          footer: {
            elapsed: false,
          },
        },
      },
      plugins: {
        allow: ['feishu'],
        entries: {
          feishu: { enabled: true },
        },
      },
    };

    const result = finalizeBundledPluginConfigAfterInstall(input, 'openclaw-lark');

    expect(result.changed).toBe(true);
    expect(result.config).toMatchObject({
      channels: {
        feishu: {
          appId: 'cli_xxx',
          appSecret: 'secret',
          enabled: true,
          streaming: false,
          threadSession: true,
          requireMention: true,
          footer: {
            elapsed: false,
            status: true,
          },
        },
      },
      plugins: {
        allow: ['openclaw-lark'],
        entries: {
          feishu: { enabled: false },
          'openclaw-lark': { enabled: true },
        },
      },
    });
  });
});
