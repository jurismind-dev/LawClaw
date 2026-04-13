import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
});
