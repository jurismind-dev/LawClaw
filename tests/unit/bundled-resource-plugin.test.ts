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
        version: '2026.3.17',
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
            version: '2026.3.17',
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
});
