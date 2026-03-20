import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

function findDistFile(prefix: string): string {
  const distDir = join(process.cwd(), 'node_modules', 'openclaw', 'dist');
  const match = readdirSync(distDir).find((name) => name.startsWith(prefix));
  if (!match) {
    throw new Error(`Missing OpenClaw dist file with prefix ${prefix}`);
  }
  return join(distDir, match);
}

function findPluginSdkDistFile(prefix: string): string {
  const distDir = join(process.cwd(), 'node_modules', 'openclaw', 'dist', 'plugin-sdk');
  const match = readdirSync(distDir).find((name) => name.startsWith(prefix));
  if (!match) {
    throw new Error(`Missing OpenClaw plugin-sdk dist file with prefix ${prefix}`);
  }
  return join(distDir, match);
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

  it('patches OpenClaw runtime chunks to add native doubao web_search support', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-runtime-'));
    tempDirs.push(tempRoot);

    const openclawDir = join(tempRoot, 'openclaw');
    const distDir = join(openclawDir, 'dist');
    mkdirSync(join(distDir, 'plugin-sdk'), { recursive: true });

    const authProfilesSource = findDistFile('auth-profiles-');
    const onboardSearchSource = findDistFile('onboard-search-');
    const threadBindingsSource = join(
      process.cwd(),
      'node_modules',
      'openclaw',
      'dist',
      'plugin-sdk',
      'thread-bindings-SYAnWHuW.js'
    );

    cpSync(authProfilesSource, join(distDir, basename(authProfilesSource)));
    cpSync(onboardSearchSource, join(distDir, basename(onboardSearchSource)));
    cpSync(threadBindingsSource, join(distDir, 'plugin-sdk', 'thread-bindings-SYAnWHuW.js'));

    const { patchOpenClawWebSearchRuntime } = await loadCompatTools();
    const patchedFiles = patchOpenClawWebSearchRuntime(openclawDir);
    expect(Array.isArray(patchedFiles)).toBe(true);

    const patchedAuthProfiles = readFileSync(
      join(distDir, basename(authProfilesSource)),
      'utf8'
    );
    expect(patchedAuthProfiles).toContain('DEFAULT_DOUBAO_BASE_URL');
    expect(patchedAuthProfiles).toContain('"tools.web.search.doubao.apiKey"');
    expect(patchedAuthProfiles).toContain('provider === "doubao"');
    expect(patchedAuthProfiles).toContain('/responses');

    const patchedOnboardSearch = readFileSync(
      join(distDir, basename(onboardSearchSource)),
      'utf8'
    );
    expect(patchedOnboardSearch).toContain('label: "Doubao Search"');
    expect(patchedOnboardSearch).toContain('case "doubao": return search?.doubao?.apiKey;');

    expect(patchOpenClawWebSearchRuntime(openclawDir)).toEqual([]);
  });

  it('patches OpenClaw Windows spawn runtime for executable preference and Unicode-safe cmd shim parsing', async () => {
    const tempRoot = mkdtempSync(join(process.cwd(), '.tmp-lawclaw-openclaw-win-spawn-'));
    tempDirs.push(tempRoot);

    const openclawDir = join(tempRoot, 'openclaw');
    const pluginSdkDir = join(openclawDir, 'dist', 'plugin-sdk');
    mkdirSync(pluginSdkDir, { recursive: true });

    const windowsSpawnSource = findPluginSdkDistFile('windows-spawn-');
    const windowsSpawnCopy = join(pluginSdkDir, basename(windowsSpawnSource));
    writeFileSync(windowsSpawnCopy, 'export const placeholder = true;\n', 'utf8');

    const { patchOpenClawWindowsSpawnRuntime } = await loadCompatTools();
    expect(patchOpenClawWindowsSpawnRuntime(openclawDir)).toEqual([
      `plugin-sdk/${basename(windowsSpawnSource)}`,
    ]);

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
