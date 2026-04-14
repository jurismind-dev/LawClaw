import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupStalePluginInstallStageDirs,
  detectPluginInstallationState,
  finalizeBundledPluginConfigAfterInstall,
  isAlreadyInstalledErrorMessage,
  publishPreparedPluginInstallDir,
  removeInstalledPluginDir,
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

  it('matches plugin already exists errors from the OpenClaw CLI', () => {
    expect(
      isAlreadyInstalledErrorMessage(
        'plugin already exists: C:\\Users\\demo\\.openclaw\\extensions\\openclaw-weixin (delete it first)'
      )
    ).toBe(true);
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

describe('openclaw plugin install directory cleanup', () => {
  let tempConfigDir = '';

  beforeEach(() => {
    tempConfigDir = mkdtempSync(join(tmpdir(), 'clawx-plugin-install-dir-'));
  });

  afterEach(() => {
    if (tempConfigDir) {
      rmSync(tempConfigDir, { recursive: true, force: true });
    }
  });

  it('removes an existing installed plugin directory', () => {
    const pluginDir = join(tempConfigDir, 'openclaw-weixin');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'package.json'), '{"name":"openclaw-weixin"}\n', 'utf-8');

    const removed = removeInstalledPluginDir(tempConfigDir, 'openclaw-weixin');

    expect(removed).toBe(true);
    expect(() => readFileSync(join(pluginDir, 'package.json'), 'utf-8')).toThrow();
  });

  it('returns false when the installed plugin directory does not exist', () => {
    const removed = removeInstalledPluginDir(tempConfigDir, 'openclaw-weixin');

    expect(removed).toBe(false);
  });

  it('removes stale plugin install stage directories from the extensions root', () => {
    const stageDir = join(tempConfigDir, '.openclaw-install-stage-demo');
    const keepDir = join(tempConfigDir, 'openclaw-lark');
    mkdirSync(stageDir, { recursive: true });
    mkdirSync(keepDir, { recursive: true });

    const removed = cleanupStalePluginInstallStageDirs(tempConfigDir);

    expect(removed).toEqual([stageDir]);
    expect(() => readFileSync(join(stageDir, 'package.json'), 'utf-8')).toThrow();
    expect(() => mkdirSync(keepDir, { recursive: true })).not.toThrow();
  });
});

describe('trusted bundled plugin publishing', () => {
  let tempConfigDir = '';

  beforeEach(() => {
    tempConfigDir = mkdtempSync(join(tmpdir(), 'clawx-plugin-publish-dir-'));
  });

  afterEach(() => {
    if (tempConfigDir) {
      rmSync(tempConfigDir, { recursive: true, force: true });
    }
  });

  it('publishes a prepared plugin payload into the extensions directory', () => {
    const packageDir = join(tempConfigDir, 'package');
    const extensionsDir = join(tempConfigDir, 'extensions');

    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, 'package.json'), '{"name":"@example/weather-bot"}\n', 'utf-8');
    writeFileSync(join(packageDir, 'openclaw.plugin.json'), '{"id":"weather-bot"}\n', 'utf-8');
    writeFileSync(join(packageDir, 'index.js'), 'export {};\n', 'utf-8');

    const result = publishPreparedPluginInstallDir(packageDir, extensionsDir, 'weather-bot');

    expect(result.installDir).toBe(join(extensionsDir, 'weather-bot'));
    expect(readFileSync(join(result.installDir, 'openclaw.plugin.json'), 'utf-8')).toContain('"weather-bot"');
  });

  it('rejects a prepared payload whose manifest ID does not match the target plugin ID', () => {
    const packageDir = join(tempConfigDir, 'package');
    const extensionsDir = join(tempConfigDir, 'extensions');

    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, 'package.json'), '{"name":"@example/weather-bot"}\n', 'utf-8');
    writeFileSync(join(packageDir, 'openclaw.plugin.json'), '{"id":"other-plugin"}\n', 'utf-8');

    expect(() => publishPreparedPluginInstallDir(packageDir, extensionsDir, 'weather-bot'))
      .toThrow('Plugin manifest ID mismatch');
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

  it('collapses legacy feishu defaultAccount wrappers into a single stable channel config', () => {
    const input = {
      channels: {
        feishu: {
          defaultAccount: 'default',
          legacyTopLevel: true,
          accounts: {
            default: {
              appId: 'cli_xxx',
              appSecret: 'secret',
              enabled: true,
              threadSession: false,
              extraAccountFlag: true,
            },
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

    expect(result.config).toMatchObject({
      channels: {
        feishu: {
          appId: 'cli_xxx',
          appSecret: 'secret',
          enabled: true,
          threadSession: false,
          requireMention: true,
          footer: {
            elapsed: true,
            status: true,
          },
        },
      },
    });
    expect((result.config as { channels?: { feishu?: Record<string, unknown> } }).channels?.feishu?.accounts).toBeUndefined();
  });
});
