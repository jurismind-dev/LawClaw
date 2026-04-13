import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

async function loadCompatTools() {
  return import('../../scripts/openclaw-bundle-compat.cjs');
}

function createPackageFixture(rootDir: string, packageJson: object) {
  const packageDir = join(rootDir, 'node_modules', 'https-proxy-agent');
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  return packageDir;
}

function findPluginSdkDistFile(prefix: string): string {
  const distDir = join(process.cwd(), 'node_modules', 'openclaw', 'dist', 'plugin-sdk');
  const match = readdirSync(distDir).find((name) => name.startsWith(prefix));
  if (!match) {
    throw new Error(`Missing OpenClaw plugin-sdk dist file with prefix ${prefix}`);
  }
  return join(distDir, match);
}

function findWindowsSpawnDistFile(): { source: string; relative: string } {
  const rootDistDir = join(process.cwd(), 'node_modules', 'openclaw', 'dist');
  const rootMatch = readdirSync(rootDistDir).find((name) => /^windows-spawn-.*\.js$/.test(name));
  if (rootMatch) {
    return {
      source: join(rootDistDir, rootMatch),
      relative: rootMatch,
    };
  }

  const source = findPluginSdkDistFile('windows-spawn-');
  return {
    source,
    relative: `plugin-sdk/${basename(source)}`,
  };
}

describe('openclaw bundle compatibility patches', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds require/default exports for import-only https-proxy-agent bundles', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-bundle-'));
    tempDirs.push(tempRoot);

    createPackageFixture(tempRoot, {
      name: 'https-proxy-agent',
      version: '8.0.0',
      type: 'module',
      exports: {
        import: {
          types: './dist/index.d.ts',
          default: './dist/index.js',
        },
      },
    });

    const { patchOpenClawBundleCompat } = await loadCompatTools();
    const patchedPackages = patchOpenClawBundleCompat(join(tempRoot, 'node_modules'));

    expect(patchedPackages).toEqual(['https-proxy-agent']);

    const patchedPackage = JSON.parse(
      readFileSync(join(tempRoot, 'node_modules', 'https-proxy-agent', 'package.json'), 'utf8')
    );

    expect(patchedPackage.main).toBe('./dist/index.js');
    expect(patchedPackage.exports.import).toEqual({
      types: './dist/index.d.ts',
      default: './dist/index.js',
    });
    expect(patchedPackage.exports.require).toBe('./dist/index.js');
    expect(patchedPackage.exports.default).toBe('./dist/index.js');
  });

  it('leaves already-compatible packages untouched', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-bundle-'));
    tempDirs.push(tempRoot);

    createPackageFixture(tempRoot, {
      name: 'https-proxy-agent',
      version: '8.0.0',
      type: 'module',
      main: './dist/index.js',
      exports: {
        import: {
          default: './dist/index.js',
        },
        require: './dist/index.js',
        default: './dist/index.js',
      },
    });

    const packageJsonPath = join(tempRoot, 'node_modules', 'https-proxy-agent', 'package.json');
    const before = readFileSync(packageJsonPath, 'utf8');

    const { patchOpenClawBundleCompat } = await loadCompatTools();
    const patchedPackages = patchOpenClawBundleCompat(join(tempRoot, 'node_modules'));

    expect(patchedPackages).toEqual([]);
    expect(readFileSync(packageJsonPath, 'utf8')).toBe(before);
  });

  it('installs a bundled Jurismind doubao extension for modern OpenClaw layouts', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-runtime-'));
    tempDirs.push(tempRoot);

    const openclawDir = join(tempRoot, 'openclaw');
    const distDir = join(openclawDir, 'dist');
    mkdirSync(join(distDir, 'plugin-sdk'), { recursive: true });
    mkdirSync(join(distDir, 'extensions'), { recursive: true });
    writeFileSync(join(openclawDir, 'package.json'), JSON.stringify({ version: '2026.4.11' }, null, 2), 'utf8');
    writeFileSync(join(distDir, 'plugin-sdk', 'provider-web-search.js'), 'export const marker = true;\n', 'utf8');
    writeFileSync(join(distDir, 'plugin-sdk', 'plugin-entry.js'), 'export const marker = true;\n', 'utf8');

    const { patchOpenClawWebSearchRuntime } = await loadCompatTools();
    const patchedFiles = patchOpenClawWebSearchRuntime(openclawDir);
    expect(patchedFiles).toEqual([
      'extensions/jurismind-doubao/package.json',
      'extensions/jurismind-doubao/openclaw.plugin.json',
      'extensions/jurismind-doubao/index.js',
    ]);

    const manifest = JSON.parse(
      readFileSync(join(distDir, 'extensions', 'jurismind-doubao', 'openclaw.plugin.json'), 'utf8')
    ) as {
      id?: string;
      name?: string;
      description?: string;
      enabledByDefault?: boolean;
      activation?: {
        onProviders?: string[];
        onCapabilities?: string[];
      };
      setup?: {
        providers?: Array<{
          id?: string;
          authMethods?: string[];
          envVars?: string[];
        }>;
        requiresRuntime?: boolean;
      };
      providerAuthEnvVars?: Record<string, string[]>;
      contracts?: {
        webSearchProviders?: string[];
      };
      configContracts?: {
        secretInputs?: {
          bundledDefaultEnabled?: boolean;
          paths?: Array<{
            path?: string;
            expected?: string;
          }>;
        };
      };
    };
    expect(manifest.id).toBe('jurismind-doubao');
    expect(manifest.name).toBe('Jurismind Doubao Search');
    expect(manifest.description).toBe('Bundled Jurismind Doubao web search provider');
    expect(manifest.enabledByDefault).toBe(true);
    expect(manifest.activation?.onProviders).toEqual(['doubao']);
    expect(manifest.activation?.onCapabilities).toEqual(['provider']);
    expect(manifest.setup?.providers).toEqual([
      {
        id: 'doubao',
        authMethods: ['api-key'],
        envVars: ['JURISMIND_API_KEY'],
      },
    ]);
    expect(manifest.setup?.requiresRuntime).toBe(false);
    expect(manifest.providerAuthEnvVars?.doubao).toEqual(['JURISMIND_API_KEY']);
    expect(manifest.contracts?.webSearchProviders).toEqual(['doubao']);
    expect(manifest.configContracts?.secretInputs?.bundledDefaultEnabled).toBe(true);
    expect(manifest.configContracts?.secretInputs?.paths).toEqual([
      {
        path: 'webSearch.apiKey',
        expected: 'string',
      },
    ]);

    const generatedIndex = readFileSync(
      join(distDir, 'extensions', 'jurismind-doubao', 'index.js'),
      'utf8'
    );
    expect(generatedIndex).toContain("plugins.entries.jurismind-doubao.config.webSearch.apiKey");
    expect(generatedIndex).toContain("api.registerWebSearchProvider(createDoubaoWebSearchProvider())");
    expect(generatedIndex).toContain("provider: 'doubao'");

    expect(patchOpenClawWebSearchRuntime(openclawDir)).toEqual([]);
  });

  it('removes excluded OpenClaw bundled extensions from modern layouts', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-runtime-'));
    tempDirs.push(tempRoot);

    const openclawDir = join(tempRoot, 'openclaw');
    const extensionsDir = join(openclawDir, 'dist', 'extensions');
    mkdirSync(join(extensionsDir, 'qqbot'), { recursive: true });
    mkdirSync(join(extensionsDir, 'telegram'), { recursive: true });
    writeFileSync(join(extensionsDir, 'qqbot', 'openclaw.plugin.json'), JSON.stringify({ id: 'qqbot' }), 'utf8');
    writeFileSync(join(extensionsDir, 'telegram', 'openclaw.plugin.json'), JSON.stringify({ id: 'telegram' }), 'utf8');

    const { removeBundledExtensions } = await loadCompatTools();
    expect(removeBundledExtensions(openclawDir)).toEqual(['extensions/qqbot']);
    expect(() => readFileSync(join(extensionsDir, 'qqbot', 'openclaw.plugin.json'), 'utf8')).toThrow();
    expect(readFileSync(join(extensionsDir, 'telegram', 'openclaw.plugin.json'), 'utf8')).toContain('"telegram"');
    expect(removeBundledExtensions(openclawDir)).toEqual([]);
  });

  it('patches OpenClaw Windows spawn runtime for executable preference and Unicode-safe cmd shim parsing', async () => {
    const tempRoot = mkdtempSync(join(process.cwd(), '.tmp-lawclaw-openclaw-win-spawn-'));
    tempDirs.push(tempRoot);

    const openclawDir = join(tempRoot, 'openclaw');
    const pluginSdkDir = join(openclawDir, 'dist', 'plugin-sdk');
    mkdirSync(pluginSdkDir, { recursive: true });

    const windowsSpawnFixture = findWindowsSpawnDistFile();
    const windowsSpawnCopy = join(openclawDir, 'dist', windowsSpawnFixture.relative);
    writeFileSync(windowsSpawnCopy, 'export const placeholder = true;\n', 'utf8');

    const { patchOpenClawWindowsSpawnRuntime } = await loadCompatTools();
    expect(patchOpenClawWindowsSpawnRuntime(openclawDir)).toEqual([windowsSpawnFixture.relative]);

    const patchedSource = readFileSync(windowsSpawnCopy, 'utf8');
    expect(patchedSource).toContain('lawclaw windows spawn patch v1');
    expect(patchedSource).toContain('const WRAPPER_TEXT_ENCODINGS = ["utf8", "utf-16le", "gbk"]');

    const mod = await import(pathToFileURL(windowsSpawnCopy).href) as {
      a: (params: {
        command: string;
        env: NodeJS.ProcessEnv;
        platform: NodeJS.Platform;
        execPath: string;
        packageName?: string;
      }) => {
        command: string;
        leadingArgv: string[];
        resolution: string;
        windowsHide?: boolean;
      };
      r: (command: string, env: NodeJS.ProcessEnv) => string;
    };

    const binDir = join(tempRoot, 'bin');
    mkdirSync(binDir, { recursive: true });
    const exePath = join(binDir, 'python.exe');
    const cmdPath = join(binDir, 'python.cmd');
    writeFileSync(exePath, '', 'utf8');
    writeFileSync(cmdPath, '@echo off\r\n', 'utf8');

    expect(mod.r('python', {
      PATH: binDir,
      PATHEXT: '.CMD;.EXE',
    })).toBe(exePath);

    const bridgeDir = join(tempRoot, 'runtime-bridge');
    const systemDir = join(tempRoot, 'system32');
    mkdirSync(bridgeDir, { recursive: true });
    mkdirSync(systemDir, { recursive: true });

    const bridgeScript = join(bridgeDir, 'python-bridge.ps1');
    writeFileSync(join(systemDir, 'powershell.exe'), '', 'utf8');
    writeFileSync(bridgeScript, '# bridge\n', 'utf8');
    writeFileSync(
      join(bridgeDir, 'python.cmd'),
      '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0python-bridge.ps1" %*\r\n',
      'utf8'
    );

    expect(mod.a({
      command: 'python',
      env: {
        PATH: `${bridgeDir};${systemDir}`,
        PATHEXT: '.CMD;.EXE',
      },
      platform: 'win32',
      execPath: '/mock/node.exe',
      packageName: 'acpx',
    })).toEqual({
      command: 'powershell.exe',
      leadingArgv: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', bridgeScript],
      resolution: 'exe-entrypoint',
      windowsHide: true,
    });

    const gbkDir = join(tempRoot, 'gbk');
    const chineseSegment = '中文用户';
    const chineseTargetDir = join(gbkDir, chineseSegment);
    mkdirSync(chineseTargetDir, { recursive: true });
    const gbkExe = join(chineseTargetDir, 'python.exe');
    writeFileSync(gbkExe, '', 'utf8');

    const gbkWrapper = join(gbkDir, 'gbk-python.cmd');
    const gbkContent = Buffer.concat([
      Buffer.from('@echo off\r\n"%~dp0', 'ascii'),
      Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0xd3, 0xc3, 0xbb, 0xa7]),
      Buffer.from('\\python.exe" %*\r\n', 'ascii'),
    ]);
    writeFileSync(gbkWrapper, gbkContent);

    expect(mod.a({
      command: gbkWrapper,
      env: {
        PATH: gbkDir,
        PATHEXT: '.CMD;.EXE',
      },
      platform: 'win32',
      execPath: '/mock/node.exe',
      packageName: 'acpx',
    })).toEqual({
      command: gbkExe,
      leadingArgv: [],
      resolution: 'exe-entrypoint',
      windowsHide: true,
    });

    expect(patchOpenClawWindowsSpawnRuntime(openclawDir)).toEqual([]);
  });
});
