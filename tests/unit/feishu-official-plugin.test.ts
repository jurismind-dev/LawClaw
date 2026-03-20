import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FEISHU_OFFICIAL_PLUGIN_NPM_SPEC,
  FEISHU_OFFICIAL_PLUGIN_PACKAGE,
  FEISHU_OFFICIAL_PLUGIN_VERSION,
} from '@electron/utils/feishu-official-plugin';

describe('feishu official plugin metadata', () => {
  it('keeps bundled plugin package version in sync with runtime constants', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'resources', 'plugins', 'openclaw-lark', 'package.json'), 'utf-8')
    ) as { version?: string; name?: string; openclaw?: { install?: { npmSpec?: string } } };

    expect(packageJson.name).toBe(FEISHU_OFFICIAL_PLUGIN_PACKAGE);
    expect(packageJson.version).toBe(FEISHU_OFFICIAL_PLUGIN_VERSION);
    expect(packageJson.openclaw?.install?.npmSpec).toBe(FEISHU_OFFICIAL_PLUGIN_NPM_SPEC);
  });
});
