import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getWeixinPluginMissingRuntimePaths,
  repairInstalledWeixinPluginIfNeeded,
} from '../../electron/utils/weixin-plugin-installer';

const tempDirs: string[] = [];

function createPluginDir(rootDir: string, version = '2.1.7') {
  const pluginDir = join(rootDir, 'extensions', 'openclaw-weixin');
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(
    join(pluginDir, 'package.json'),
    JSON.stringify({ name: '@tencent-weixin/openclaw-weixin', version }, null, 2),
    'utf-8'
  );
  writeFileSync(
    join(pluginDir, 'openclaw.plugin.json'),
    JSON.stringify({ id: 'openclaw-weixin', name: 'Weixin' }, null, 2),
    'utf-8'
  );
  writeFileSync(join(pluginDir, 'index.ts'), 'export default {};\n', 'utf-8');
  return pluginDir;
}

afterEach(() => {
  vi.clearAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('weixin plugin startup repair', () => {
  it('reports healthy when the installed plugin already matches the pinned version', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'lawclaw-weixin-plugin-'));
    tempDirs.push(configDir);
    const pluginDir = createPluginDir(configDir, '2.1.7');

    const runOpenClawCli = vi.fn();
    const result = await repairInstalledWeixinPluginIfNeeded({
      openClawConfigDir: configDir,
      runOpenClawCli,
    });

    expect(result).toEqual({
      repaired: false,
      reason: 'healthy',
      pluginDir,
      missingPaths: [],
    });
    expect(runOpenClawCli).not.toHaveBeenCalled();
  });

  it('reinstalls the plugin when the installed version is stale', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'lawclaw-weixin-plugin-'));
    tempDirs.push(configDir);
    const pluginDir = createPluginDir(configDir, '1.0.2');

    const runOpenClawCli = vi.fn(async (args: string[]) => {
      if (args[0] === 'plugins' && args[1] === 'uninstall') {
        return { success: true, stdout: '', stderr: '' };
      }

      if (args[0] === 'plugins' && args[1] === 'install') {
        createPluginDir(configDir, '2.1.7');
        return { success: true, stdout: 'installed', stderr: '' };
      }

      throw new Error(`unexpected args: ${args.join(' ')}`);
    });

    const result = await repairInstalledWeixinPluginIfNeeded({
      openClawConfigDir: configDir,
      runOpenClawCli,
    });

    expect(result).toEqual({
      repaired: true,
      reason: 'repaired',
      pluginDir,
      missingPaths: [],
    });
    expect(runOpenClawCli).toHaveBeenNthCalledWith(1, ['plugins', 'uninstall', 'openclaw-weixin']);
    expect(runOpenClawCli).toHaveBeenNthCalledWith(
      2,
      ['plugins', 'install', '@tencent-weixin/openclaw-weixin@2.1.7']
    );
  });

  it('detects missing runtime files before declaring the installed plugin healthy', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'lawclaw-weixin-plugin-'));
    tempDirs.push(configDir);
    const pluginDir = join(configDir, 'extensions', 'openclaw-weixin');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'package.json'), JSON.stringify({ version: '2.1.7' }), 'utf-8');

    expect(getWeixinPluginMissingRuntimePaths(pluginDir)).toEqual([
      'openclaw.plugin.json',
      'index.ts',
    ]);
  });
});
