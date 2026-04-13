import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FEISHU_OFFICIAL_PLUGIN_NPM_SPEC,
  FEISHU_OFFICIAL_PLUGIN_PACKAGE,
  FEISHU_OFFICIAL_PLUGIN_VERSION,
  getInstalledFeishuOfficialPluginVersion,
} from '@electron/utils/feishu-official-plugin';

describe('feishu official plugin metadata', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop() as string, { recursive: true, force: true });
    }
  });

  it('keeps bundled plugin package version in sync with runtime constants', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'resources', 'plugins', 'openclaw-lark', 'package.json'), 'utf-8')
    ) as { version?: string; name?: string; openclaw?: { install?: { npmSpec?: string } } };

    expect(packageJson.name).toBe(FEISHU_OFFICIAL_PLUGIN_PACKAGE);
    expect(packageJson.version).toBe(FEISHU_OFFICIAL_PLUGIN_VERSION);
    expect(packageJson.openclaw?.install?.npmSpec).toBe(FEISHU_OFFICIAL_PLUGIN_NPM_SPEC);
  });

  it('reads the installed feishu plugin version from the user extensions directory', () => {
    const openclawConfigDir = mkdtempSync(join(tmpdir(), 'lawclaw-feishu-plugin-version-'));
    tempDirs.push(openclawConfigDir);

    const pluginDir = join(openclawConfigDir, 'extensions', 'openclaw-lark');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({ name: '@larksuite/openclaw-lark', version: '2026.3.17' }, null, 2),
      'utf-8'
    );

    expect(getInstalledFeishuOfficialPluginVersion(openclawConfigDir)).toBe('2026.3.17');
  });
});
