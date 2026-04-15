import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { prepareBundledFeishuResourcePlugin } = require('../../scripts/bundled-resource-plugin.cjs');

describe('bundled resource plugin preparation', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-bundled-resource-plugin-'));
  });

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('hydrates incomplete feishu plugin dependencies before packaging', () => {
    const sourceDir = join(tempRoot, 'resources', 'plugins', 'openclaw-lark');
    const typeboxDir = join(sourceDir, 'node_modules', '@sinclair', 'typebox');

    mkdirSync(join(typeboxDir, 'build', 'cjs'), { recursive: true });
    mkdirSync(join(sourceDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
    mkdirSync(join(sourceDir, 'node_modules', 'zod'), { recursive: true });

    writeFileSync(
      join(sourceDir, 'package.json'),
      `${JSON.stringify({
        name: '@larksuite/openclaw-lark',
        version: '2026.4.7',
        dependencies: {},
      }, null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(join(sourceDir, 'openclaw.plugin.json'), '{}\n', 'utf-8');
    writeFileSync(join(sourceDir, 'index.js'), 'export {};\n', 'utf-8');
    writeFileSync(join(sourceDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(join(sourceDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(join(typeboxDir, 'package.json'), JSON.stringify({ version: '0.34.48' }), 'utf-8');
    writeFileSync(
      join(sourceDir, 'package-lock.json'),
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
    rmSync(join(typeboxDir, 'build', 'cjs', 'index.js'), { force: true });

    const installDependencies = vi.fn((packageDir: string) => {
      expect(existsSync(join(packageDir, 'node_modules'))).toBe(false);

      mkdirSync(join(packageDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
      mkdirSync(join(packageDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs'), { recursive: true });
      mkdirSync(join(packageDir, 'node_modules', 'zod'), { recursive: true });
      writeFileSync(join(packageDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
      writeFileSync(join(packageDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');
      writeFileSync(
        join(packageDir, 'node_modules', '@sinclair', 'typebox', 'package.json'),
        JSON.stringify({ version: '0.34.48' }),
        'utf-8'
      );
      writeFileSync(
        join(packageDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'),
        'module.exports = {};\n',
        'utf-8'
      );
    });

    const prepared = prepareBundledFeishuResourcePlugin({
      sourceDir,
      installDependencies,
    });

    expect(installDependencies).toHaveBeenCalledTimes(1);
    expect(
      existsSync(join(prepared.preparedDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'))
    ).toBe(true);

    const savedManifest = JSON.parse(readFileSync(join(prepared.preparedDir, 'package.json'), 'utf-8'));
    expect(savedManifest.dependencies).toEqual({});

    rmSync(prepared.tempDir, { recursive: true, force: true });
  });

  it('rewrites feishu plugin runtime imports away from the root plugin-sdk entry', () => {
    const sourceDir = join(tempRoot, 'resources', 'plugins', 'openclaw-lark');

    mkdirSync(join(sourceDir, 'src', 'messaging', 'inbound'), { recursive: true });
    mkdirSync(join(sourceDir, 'node_modules', '@larksuiteoapi', 'node-sdk'), { recursive: true });
    mkdirSync(join(sourceDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs'), { recursive: true });
    mkdirSync(join(sourceDir, 'node_modules', 'zod'), { recursive: true });

    writeFileSync(
      join(sourceDir, 'package.json'),
      `${JSON.stringify({
        name: '@larksuite/openclaw-lark',
        version: '2026.4.7',
        type: 'module',
      }, null, 2)}\n`,
      'utf-8'
    );
    writeFileSync(join(sourceDir, 'openclaw.plugin.json'), '{"id":"openclaw-lark"}\n', 'utf-8');
    writeFileSync(join(sourceDir, 'index.js'), "import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';\nexport default emptyPluginConfigSchema();\n", 'utf-8');
    writeFileSync(
      join(sourceDir, 'src', 'messaging', 'inbound', 'handler.js'),
      "import { recordPendingHistoryEntryIfEnabled, DEFAULT_GROUP_HISTORY_LIMIT, resolveSenderCommandAuthorization, isNormalizedSenderAllowed, } from 'openclaw/plugin-sdk';\nexport { recordPendingHistoryEntryIfEnabled, DEFAULT_GROUP_HISTORY_LIMIT, resolveSenderCommandAuthorization, isNormalizedSenderAllowed };\n",
      'utf-8'
    );
    writeFileSync(join(sourceDir, 'node_modules', '@larksuiteoapi', 'node-sdk', 'package.json'), '{}\n', 'utf-8');
    writeFileSync(
      join(sourceDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'index.js'),
      'module.exports = {};\n',
      'utf-8'
    );
    writeFileSync(join(sourceDir, 'node_modules', 'zod', 'package.json'), '{}\n', 'utf-8');

    const prepared = prepareBundledFeishuResourcePlugin({ sourceDir });

    const preparedIndex = readFileSync(join(prepared.preparedDir, 'index.js'), 'utf-8');
    const preparedHandler = readFileSync(join(prepared.preparedDir, 'src', 'messaging', 'inbound', 'handler.js'), 'utf-8');

    expect(preparedIndex).toContain("from 'openclaw/plugin-sdk/plugin-entry'");
    expect(preparedIndex).not.toContain("from 'openclaw/plugin-sdk'");
    expect(preparedHandler).toContain("from 'openclaw/plugin-sdk/allow-from'");
    expect(preparedHandler).toContain("from 'openclaw/plugin-sdk/command-auth'");
    expect(preparedHandler).toContain("from 'openclaw/plugin-sdk/reply-history'");
    expect(preparedHandler).not.toContain("from 'openclaw/plugin-sdk'");

    rmSync(prepared.tempDir, { recursive: true, force: true });
  });
});
