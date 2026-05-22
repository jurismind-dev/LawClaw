import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEISHU_OFFICIAL_PLUGIN_VERSION } from '../../electron/utils/feishu-official-plugin';
import {
  prepareFeishuOfficialPluginInstallDir,
  repairInstalledFeishuOfficialPluginIfNeeded,
} from '../../electron/utils/feishu-official-plugin-installer';

describe('feishu official plugin installer', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-feishu-plugin-installer-'));
  });

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('clears incomplete node_modules before reinstalling bundled plugin dependencies', async () => {
    const resourcesDir = join(tempRoot, 'resources');
    const bundledPluginDir = join(resourcesDir, 'plugins', 'openclaw-lark');
    const typeboxDir = join(bundledPluginDir, 'node_modules', '@sinclair', 'typebox');

    mkdirSync(join(typeboxDir, 'build', 'cjs'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', 'zod'), { recursive: true });

    writeFileSync(
      join(bundledPluginDir, 'package.json'),
      `${JSON.stringify({
        name: '@larksuite/openclaw-lark',
        version: '2026.4.7',
        dependencies: {},
      }, null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'openclaw.plugin.json'), '{}\n', 'utf-8');
    writeFileSync(join(bundledPluginDir, 'index.js'), 'export {};\n', 'utf-8');
    writeFileSync(join(bundledPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(join(bundledPluginDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(join(typeboxDir, 'package.json'), JSON.stringify({ version: '0.34.48' }), 'utf-8');
    writeFileSync(
      join(bundledPluginDir, 'package-lock.json'),
      `${JSON.stringify({
        name: '@larksuite/openclaw-lark',
        lockfileVersion: 3,
        packages: {
          '': {
            name: '@larksuite/openclaw-lark',
            version: '2026.4.7',
            dependencies: {},
          },
          'node_modules/@sinclair/typebox': {
            version: '0.34.48',
          },
        },
      }, null, 2)}\n`,
      'utf-8'
    );

    const runCommand = vi.fn(async (_command: string, args: string[], cwd: string) => {
      if (args[0] !== 'install') {
        return { success: false, stdout: '', stderr: '', error: 'unexpected command' };
      }

      expect(existsSync(join(cwd, 'node_modules'))).toBe(false);

      mkdirSync(join(cwd, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
      mkdirSync(join(cwd, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs'), { recursive: true });
      mkdirSync(join(cwd, 'node_modules', 'zod'), { recursive: true });
      writeFileSync(join(cwd, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
      writeFileSync(
        join(cwd, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'),
        'module.exports = {};\n',
        'utf-8'
      );
      writeFileSync(
        join(cwd, 'node_modules', '@sinclair', 'typebox', 'package.json'),
        JSON.stringify({ version: '0.34.48' }),
        'utf-8'
      );
      writeFileSync(join(cwd, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');

      return { success: true, stdout: '', stderr: '' };
    });

    const result = await prepareFeishuOfficialPluginInstallDir({
      isPackaged: false,
      resourcesDir,
      runCommand,
    });

    expect(result.success).toBe(true);
    expect(result.installPath).toBeTruthy();
    expect(runCommand).toHaveBeenCalledTimes(1);

    const installPath = result.installPath as string;
    expect(
      existsSync(join(installPath, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'))
    ).toBe(true);

    const savedManifest = JSON.parse(readFileSync(join(installPath, 'package.json'), 'utf-8'));
    expect(savedManifest.dependencies).toEqual({});

    if (result.tempDir) {
      rmSync(result.tempDir, { recursive: true, force: true });
    }
  });

  it('reinstalls an outdated installed feishu plugin to the bundled version', async () => {
    const resourcesDir = join(tempRoot, 'resources');
    const bundledPluginDir = join(resourcesDir, 'plugins', 'openclaw-lark');
    const openclawConfigDir = join(tempRoot, '.openclaw');
    const installedPluginDir = join(openclawConfigDir, 'extensions', 'openclaw-lark');

    mkdirSync(join(bundledPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', 'zod'), { recursive: true });
    writeFileSync(
      join(bundledPluginDir, 'package.json'),
      `${JSON.stringify({
        name: '@larksuite/openclaw-lark',
        version: FEISHU_OFFICIAL_PLUGIN_VERSION,
      }, null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'openclaw.plugin.json'), '{"id":"openclaw-lark"}\n', 'utf-8');
    writeFileSync(join(bundledPluginDir, 'index.js'), 'export {};\n', 'utf-8');
    writeFileSync(join(bundledPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(
      join(bundledPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'),
      'module.exports = {};\n',
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');

    mkdirSync(installedPluginDir, { recursive: true });
    writeFileSync(
      join(installedPluginDir, 'package.json'),
      JSON.stringify({ name: '@larksuite/openclaw-lark', version: '2026.3.17' }, null, 2),
      'utf-8'
    );
    writeFileSync(join(installedPluginDir, 'openclaw.plugin.json'), '{"id":"openclaw-lark"}\n', 'utf-8');
    writeFileSync(join(installedPluginDir, 'index.js'), 'export {};\n', 'utf-8');
    writeFileSync(join(installedPluginDir, 'stale.txt'), 'old-version\n', 'utf-8');

    const result = await repairInstalledFeishuOfficialPluginIfNeeded({
      openClawConfigDir: openclawConfigDir,
      isPackaged: false,
      resourcesDir,
      runCommand: vi.fn(async () => ({ success: true, stdout: '', stderr: '' })),
    });

    expect(result.repaired).toBe(true);
    expect(result.reason).toBe('repaired');

    const installedManifest = JSON.parse(readFileSync(join(installedPluginDir, 'package.json'), 'utf-8')) as {
      version?: string;
    };
    expect(installedManifest.version).toBe(FEISHU_OFFICIAL_PLUGIN_VERSION);
    expect(existsSync(join(installedPluginDir, 'stale.txt'))).toBe(false);
  });

  it('quarantines duplicate feishu plugin directories before gateway startup', async () => {
    const resourcesDir = join(tempRoot, 'resources');
    const openclawConfigDir = join(tempRoot, '.openclaw');
    const installedPluginDir = join(openclawConfigDir, 'extensions', 'openclaw-lark');
    const duplicatePluginDir = join(openclawConfigDir, 'extensions', 'feishu-openclaw-plugin');

    for (const pluginDir of [installedPluginDir, duplicatePluginDir]) {
      mkdirSync(join(pluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
      mkdirSync(join(pluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs'), { recursive: true });
      mkdirSync(join(pluginDir, 'node_modules', 'zod'), { recursive: true });
      writeFileSync(
        join(pluginDir, 'package.json'),
        `${JSON.stringify({
          name: '@larksuite/openclaw-lark',
          version: FEISHU_OFFICIAL_PLUGIN_VERSION,
        }, null, 2)}\n`,
        'utf-8'
      );
      writeFileSync(join(pluginDir, 'openclaw.plugin.json'), '{"id":"openclaw-lark"}\n', 'utf-8');
      writeFileSync(join(pluginDir, 'index.js'), 'export {};\n', 'utf-8');
      writeFileSync(join(pluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
      writeFileSync(
        join(pluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'),
        'module.exports = {};\n',
        'utf-8'
      );
      writeFileSync(join(pluginDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');
    }

    const runCommand = vi.fn(async () => ({ success: true, stdout: '', stderr: '' }));
    const result = await repairInstalledFeishuOfficialPluginIfNeeded({
      openClawConfigDir: openclawConfigDir,
      isPackaged: false,
      resourcesDir,
      runCommand,
    });

    expect(result.repaired).toBe(true);
    expect(result.reason).toBe('repaired');
    expect(result.quarantinedDuplicateDirs).toHaveLength(1);
    expect(existsSync(installedPluginDir)).toBe(true);
    expect(existsSync(duplicatePluginDir)).toBe(false);
    expect(
      readdirSync(join(openclawConfigDir, 'extensions')).some((name) =>
        name.startsWith('feishu-openclaw-plugin.disabled-duplicate-')
      )
    ).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('repairs an installed feishu plugin when ESM runtime imports are extensionless', async () => {
    const resourcesDir = join(tempRoot, 'resources');
    const bundledPluginDir = join(resourcesDir, 'plugins', 'openclaw-lark');
    const openclawConfigDir = join(tempRoot, '.openclaw');
    const installedPluginDir = join(openclawConfigDir, 'extensions', 'openclaw-lark');

    mkdirSync(join(bundledPluginDir, 'src', 'channel'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'src', 'core'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', 'zod'), { recursive: true });

    writeFileSync(
      join(bundledPluginDir, 'package.json'),
      `${JSON.stringify({
        name: '@larksuite/openclaw-lark',
        version: FEISHU_OFFICIAL_PLUGIN_VERSION,
        type: 'module',
      }, null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'openclaw.plugin.json'), '{"id":"openclaw-lark"}\n', 'utf-8');
    writeFileSync(join(bundledPluginDir, 'index.js'), "export { monitorFeishuProvider } from './src/channel/monitor';\n", 'utf-8');
    writeFileSync(
      join(bundledPluginDir, 'src', 'channel', 'monitor.js'),
      "import { getLarkAccount } from '../core/accounts';\nexport const monitorFeishuProvider = getLarkAccount;\n",
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'src', 'core', 'accounts.js'), 'export const getLarkAccount = () => true;\n', 'utf-8');
    writeFileSync(join(bundledPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(
      join(bundledPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'),
      'module.exports = {};\n',
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');

    mkdirSync(join(installedPluginDir, 'src', 'channel'), { recursive: true });
    mkdirSync(join(installedPluginDir, 'src', 'core'), { recursive: true });
    mkdirSync(join(installedPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
    mkdirSync(join(installedPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs'), { recursive: true });
    mkdirSync(join(installedPluginDir, 'node_modules', 'zod'), { recursive: true });
    writeFileSync(
      join(installedPluginDir, 'package.json'),
      `${JSON.stringify({
        name: '@larksuite/openclaw-lark',
        version: FEISHU_OFFICIAL_PLUGIN_VERSION,
        type: 'module',
      }, null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(join(installedPluginDir, 'openclaw.plugin.json'), '{"id":"openclaw-lark"}\n', 'utf-8');
    writeFileSync(join(installedPluginDir, 'index.js'), "export { monitorFeishuProvider } from './src/channel/monitor';\n", 'utf-8');
    writeFileSync(
      join(installedPluginDir, 'src', 'channel', 'monitor.js'),
      "import { getLarkAccount } from '../core/accounts';\nexport const monitorFeishuProvider = getLarkAccount;\n",
      'utf-8'
    );
    writeFileSync(join(installedPluginDir, 'src', 'core', 'accounts.js'), 'export const getLarkAccount = () => false;\n', 'utf-8');
    writeFileSync(join(installedPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(
      join(installedPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'),
      'module.exports = {};\n',
      'utf-8'
    );
    writeFileSync(join(installedPluginDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');

    const result = await repairInstalledFeishuOfficialPluginIfNeeded({
      openClawConfigDir: openclawConfigDir,
      isPackaged: false,
      resourcesDir,
      runCommand: vi.fn(async () => ({ success: true, stdout: '', stderr: '' })),
    });

    expect(result.repaired).toBe(true);
    expect(result.reason).toBe('repaired');
    expect(readFileSync(join(installedPluginDir, 'src', 'channel', 'monitor.js'), 'utf-8')).toContain(
      "from '../core/accounts.js'"
    );
  });

  it('repairs an installed feishu plugin when gateway startAccount uses dynamic monitor import', async () => {
    const resourcesDir = join(tempRoot, 'resources');
    const bundledPluginDir = join(resourcesDir, 'plugins', 'openclaw-lark');
    const openclawConfigDir = join(tempRoot, '.openclaw');
    const installedPluginDir = join(openclawConfigDir, 'extensions', 'openclaw-lark');

    mkdirSync(join(bundledPluginDir, 'src', 'channel'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', 'zod'), { recursive: true });

    writeFileSync(
      join(bundledPluginDir, 'package.json'),
      `${JSON.stringify({
        name: '@larksuite/openclaw-lark',
        version: FEISHU_OFFICIAL_PLUGIN_VERSION,
        type: 'module',
      }, null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'openclaw.plugin.json'), '{"id":"openclaw-lark"}\n', 'utf-8');
    writeFileSync(join(bundledPluginDir, 'index.js'), 'export {};\n', 'utf-8');
    writeFileSync(
      join(bundledPluginDir, 'src', 'channel', 'plugin.js'),
      [
        "import { FEISHU_CONFIG_JSON_SCHEMA } from '../core/config-schema.js';",
        'export const feishuPlugin = {',
        '  gateway: {',
        '    startAccount: async () => {',
        "      const { monitorFeishuProvider } = await import('./monitor.js');",
        '      return monitorFeishuProvider;',
        '    },',
        '  },',
        '  configSchema: { schema: FEISHU_CONFIG_JSON_SCHEMA },',
        '};',
        '',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'src', 'channel', 'monitor.js'), 'export const monitorFeishuProvider = true;\n', 'utf-8');
    mkdirSync(join(bundledPluginDir, 'src', 'core'), { recursive: true });
    writeFileSync(join(bundledPluginDir, 'src', 'core', 'config-schema.js'), 'export const FEISHU_CONFIG_JSON_SCHEMA = {};\n', 'utf-8');
    writeFileSync(join(bundledPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(
      join(bundledPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'),
      'module.exports = {};\n',
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');

    mkdirSync(join(installedPluginDir, 'src', 'channel'), { recursive: true });
    mkdirSync(join(installedPluginDir, 'src', 'core'), { recursive: true });
    mkdirSync(join(installedPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
    mkdirSync(join(installedPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs'), { recursive: true });
    mkdirSync(join(installedPluginDir, 'node_modules', 'zod'), { recursive: true });
    writeFileSync(
      join(installedPluginDir, 'package.json'),
      `${JSON.stringify({
        name: '@larksuite/openclaw-lark',
        version: FEISHU_OFFICIAL_PLUGIN_VERSION,
        type: 'module',
      }, null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(join(installedPluginDir, 'openclaw.plugin.json'), '{"id":"openclaw-lark"}\n', 'utf-8');
    writeFileSync(join(installedPluginDir, 'index.js'), 'export {};\n', 'utf-8');
    writeFileSync(
      join(installedPluginDir, 'src', 'channel', 'plugin.js'),
      [
        "import { FEISHU_CONFIG_JSON_SCHEMA } from '../core/config-schema.js';",
        'export const feishuPlugin = {',
        '  gateway: {',
        '    startAccount: async () => {',
        "      const { monitorFeishuProvider } = await import('./monitor.js');",
        '      return monitorFeishuProvider;',
        '    },',
        '  },',
        '  configSchema: { schema: FEISHU_CONFIG_JSON_SCHEMA },',
        '};',
        '',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(join(installedPluginDir, 'src', 'channel', 'monitor.js'), 'export const monitorFeishuProvider = false;\n', 'utf-8');
    writeFileSync(join(installedPluginDir, 'src', 'core', 'config-schema.js'), 'export const FEISHU_CONFIG_JSON_SCHEMA = {};\n', 'utf-8');
    writeFileSync(join(installedPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(
      join(installedPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'),
      'module.exports = {};\n',
      'utf-8'
    );
    writeFileSync(join(installedPluginDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');

    const result = await repairInstalledFeishuOfficialPluginIfNeeded({
      openClawConfigDir: openclawConfigDir,
      isPackaged: false,
      resourcesDir,
      runCommand: vi.fn(async () => ({ success: true, stdout: '', stderr: '' })),
    });

    expect(result.repaired).toBe(true);
    expect(result.reason).toBe('repaired');

    const patchedPluginEntry = readFileSync(join(installedPluginDir, 'src', 'channel', 'plugin.js'), 'utf-8');
    expect(patchedPluginEntry).toContain("import { monitorFeishuProvider } from './monitor.js';");
    expect(patchedPluginEntry).not.toContain("await import('./monitor.js')");
  });

  it('repairs an installed feishu plugin when runtime files still import openclaw/plugin-sdk root entry', async () => {
    const resourcesDir = join(tempRoot, 'resources');
    const bundledPluginDir = join(resourcesDir, 'plugins', 'openclaw-lark');
    const openclawConfigDir = join(tempRoot, '.openclaw');
    const installedPluginDir = join(openclawConfigDir, 'extensions', 'openclaw-lark');

    mkdirSync(join(bundledPluginDir, 'src', 'messaging', 'inbound'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs'), { recursive: true });
    mkdirSync(join(bundledPluginDir, 'node_modules', 'zod'), { recursive: true });

    writeFileSync(
      join(bundledPluginDir, 'package.json'),
      `${JSON.stringify({
        name: '@larksuite/openclaw-lark',
        version: FEISHU_OFFICIAL_PLUGIN_VERSION,
        type: 'module',
      }, null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'openclaw.plugin.json'), '{"id":"openclaw-lark"}\n', 'utf-8');
    writeFileSync(join(bundledPluginDir, 'index.js'), 'export {};\n', 'utf-8');
    writeFileSync(
      join(bundledPluginDir, 'src', 'messaging', 'inbound', 'handler.js'),
      [
        "import { recordPendingHistoryEntryIfEnabled, DEFAULT_GROUP_HISTORY_LIMIT, resolveSenderCommandAuthorization, isNormalizedSenderAllowed, } from 'openclaw/plugin-sdk';",
        'export const handler = {',
        '  recordPendingHistoryEntryIfEnabled,',
        '  DEFAULT_GROUP_HISTORY_LIMIT,',
        '  resolveSenderCommandAuthorization,',
        '  isNormalizedSenderAllowed,',
        '};',
        '',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(
      join(bundledPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'),
      'module.exports = {};\n',
      'utf-8'
    );
    writeFileSync(join(bundledPluginDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');

    mkdirSync(join(installedPluginDir, 'src', 'messaging', 'inbound'), { recursive: true });
    mkdirSync(join(installedPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
    mkdirSync(join(installedPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs'), { recursive: true });
    mkdirSync(join(installedPluginDir, 'node_modules', 'zod'), { recursive: true });
    writeFileSync(
      join(installedPluginDir, 'package.json'),
      `${JSON.stringify({
        name: '@larksuite/openclaw-lark',
        version: FEISHU_OFFICIAL_PLUGIN_VERSION,
        type: 'module',
      }, null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(join(installedPluginDir, 'openclaw.plugin.json'), '{"id":"openclaw-lark"}\n', 'utf-8');
    writeFileSync(join(installedPluginDir, 'index.js'), 'export {};\n', 'utf-8');
    writeFileSync(
      join(installedPluginDir, 'src', 'messaging', 'inbound', 'handler.js'),
      [
        "import { recordPendingHistoryEntryIfEnabled, DEFAULT_GROUP_HISTORY_LIMIT, resolveSenderCommandAuthorization, isNormalizedSenderAllowed, } from 'openclaw/plugin-sdk';",
        'export const handler = {',
        '  recordPendingHistoryEntryIfEnabled,',
        '  DEFAULT_GROUP_HISTORY_LIMIT,',
        '  resolveSenderCommandAuthorization,',
        '  isNormalizedSenderAllowed,',
        '};',
        '',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(join(installedPluginDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(
      join(installedPluginDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'),
      'module.exports = {};\n',
      'utf-8'
    );
    writeFileSync(join(installedPluginDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');

    const result = await repairInstalledFeishuOfficialPluginIfNeeded({
      openClawConfigDir: openclawConfigDir,
      isPackaged: false,
      resourcesDir,
      runCommand: vi.fn(async () => ({ success: true, stdout: '', stderr: '' })),
    });

    expect(result.repaired).toBe(true);
    expect(result.reason).toBe('repaired');

    const patchedHandler = readFileSync(join(installedPluginDir, 'src', 'messaging', 'inbound', 'handler.js'), 'utf-8');
    expect(patchedHandler).toContain("from 'openclaw/plugin-sdk/allow-from'");
    expect(patchedHandler).toContain("from 'openclaw/plugin-sdk/command-auth'");
    expect(patchedHandler).toContain("from 'openclaw/plugin-sdk/reply-history'");
    expect(patchedHandler).not.toContain("from 'openclaw/plugin-sdk'");
  });
});
