import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

function createNamedPackageFixture(rootDir: string, packageName: string, packageJson: object, files: Record<string, string>) {
  const packageDir = join(rootDir, 'node_modules', ...packageName.split('/'));
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(packageDir, relativePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');
  }
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

  it('patches OpenClaw plugin-sdk compat exports for legacy channel plugins', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-runtime-'));
    tempDirs.push(tempRoot);

    const openclawDir = join(tempRoot, 'openclaw');
    const pluginSdkDir = join(openclawDir, 'dist', 'plugin-sdk');
    mkdirSync(pluginSdkDir, { recursive: true });
    writeFileSync(
      join(pluginSdkDir, 'compat.js'),
      [
        `import { n as emptyPluginConfigSchema } from "../config-schema.js";`,
        `//#region src/plugin-sdk/compat.ts`,
        `if (process.env.VITEST !== "true") process.emitWarning("compat");`,
        `//#endregion`,
        `export { emptyPluginConfigSchema };`,
        '',
      ].join('\n'),
      'utf8',
    );

    writeFileSync(
      join(openclawDir, 'dist', 'message-action-discovery-test.js'),
      [
        `function describeMessageToolSafely(params) {`,
        `\ttry {`,
        `\t\treturn params.describeMessageTool(params.context) ?? null;`,
        `\t} catch (error) {`,
        `\t\treturn null;`,
        `\t}`,
        `}`,
        '',
      ].join('\n'),
      'utf8',
    );

    const { patchOpenClawPluginSdkCompat } = await loadCompatTools();
    const patchedFiles = patchOpenClawPluginSdkCompat(openclawDir);

    expect(patchedFiles).toEqual([
      'dist/plugin-sdk/compat.js',
      'dist/message-action-discovery-test.js',
    ]);

    const patchedCompat = readFileSync(join(pluginSdkDir, 'compat.js'), 'utf8');
    expect(patchedCompat).toContain('lawclaw plugin-sdk compat patch v1');
    expect(patchedCompat).toContain(`import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "./account-id.js";`);
    expect(patchedCompat).toContain(`import { addWildcardAllowFrom, formatDocsLink } from "./setup.js";`);
    expect(patchedCompat).toContain(`import { resolveSenderCommandAuthorization } from "./command-auth.js";`);
    expect(patchedCompat).toContain('export { DEFAULT_ACCOUNT_ID, SILENT_REPLY_TOKEN');
    expect(patchedCompat).toContain('normalizeAccountId');
    expect(patchedCompat).toContain('createTypingCallbacks');

    const patchedDiscovery = readFileSync(
      join(openclawDir, 'dist', 'message-action-discovery-test.js'),
      'utf8',
    );
    expect(patchedDiscovery).toContain('lawclaw message-action-discovery guard v1');
    expect(patchedDiscovery).toContain('if (typeof params.describeMessageTool !== "function") return null;');

    expect(patchOpenClawPluginSdkCompat(openclawDir)).toEqual([]);
  });

  it('patches legacy lru-cache bundles to expose the constructor via named exports', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-bundle-'));
    tempDirs.push(tempRoot);

    createNamedPackageFixture(
      tempRoot,
      'lru-cache',
      {
        name: 'lru-cache',
        version: '7.18.3',
        main: './index.js',
        exports: {
          '.': {
            import: {
              default: './index.mjs',
            },
            require: {
              default: './index.js',
            },
          },
        },
      },
      {
        'index.js': `'use strict';\nclass LRUCache {}\nmodule.exports = LRUCache\n`,
        'index.mjs': `class LRUCache {}\nexport default LRUCache\n`,
      }
    );

    const { patchOpenClawBundleCompat } = await loadCompatTools();
    const patchedPackages = patchOpenClawBundleCompat(join(tempRoot, 'node_modules'));

    expect(patchedPackages).toEqual(['lru-cache']);

    const requireFromTemp = createRequire(join(tempRoot, 'package.json'));
    const cjsModule = requireFromTemp('lru-cache') as { LRUCache?: unknown; default?: unknown };
    expect(typeof cjsModule).toBe('function');
    expect(cjsModule.LRUCache).toBe(cjsModule);
    expect(cjsModule.default).toBe(cjsModule);

    const esmModule = await import(pathToFileURL(join(tempRoot, 'node_modules', 'lru-cache', 'index.mjs')).href) as {
      default?: unknown;
      LRUCache?: unknown;
    };
    expect(esmModule.LRUCache).toBe(esmModule.default);

    expect(patchOpenClawBundleCompat(join(tempRoot, 'node_modules'))).toEqual([]);
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
      {
        id: 'jurismind',
        authMethods: ['api-key'],
        envVars: ['JURISMIND_API_KEY'],
      },
    ]);
    expect(manifest.setup?.requiresRuntime).toBe(false);
    expect(manifest.providerAuthEnvVars?.doubao).toEqual(['JURISMIND_API_KEY']);
    expect(manifest.providerAuthEnvVars?.jurismind).toEqual(['JURISMIND_API_KEY']);
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

  it('patches OpenClaw kill-tree runtime to resolve taskkill via SystemRoot', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-kill-tree-'));
    tempDirs.push(tempRoot);

    const openclawDir = join(tempRoot, 'openclaw');
    const distDir = join(openclawDir, 'dist');
    mkdirSync(distDir, { recursive: true });

    const killTreePath = join(distDir, 'kill-tree-test.js');
    writeFileSync(
      killTreePath,
      [
        'import { spawn } from "node:child_process";',
        'function runTaskkill(args) {',
        '\ttry {',
        '\t\tspawn("taskkill", args, {',
        '\t\t\tstdio: "ignore",',
        '\t\t\tdetached: true,',
        '\t\t\twindowsHide: true',
        '\t\t});',
        '\t} catch {}',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const { patchOpenClawKillTreeRuntime } = await loadCompatTools();
    expect(patchOpenClawKillTreeRuntime(openclawDir)).toEqual(['kill-tree-test.js']);

    const patchedSource = readFileSync(killTreePath, 'utf8');
    expect(patchedSource).toContain('import path from "node:path";');
    expect(patchedSource).toContain('const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || "C:\\\\Windows";');
    expect(patchedSource).toContain('const taskkillPath = path.join(systemRoot, "System32", "taskkill.exe");');
    expect(patchedSource).toContain('spawn(taskkillPath, args, {');
    expect(patchedSource).toContain('lawclaw windows kill-tree patch v1');

    expect(patchOpenClawKillTreeRuntime(openclawDir)).toEqual([]);
  });

  it('patches OpenClaw kill-tree runtime when child_process import formatting changes', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-kill-tree-format-'));
    tempDirs.push(tempRoot);

    const openclawDir = join(tempRoot, 'openclaw');
    const distDir = join(openclawDir, 'dist');
    mkdirSync(distDir, { recursive: true });

    const killTreePath = join(distDir, 'kill-tree-test.js');
    writeFileSync(
      killTreePath,
      [
        "import{spawn}from'node:child_process';",
        'function runTaskkill(args) {',
        '\ttry {',
        '\t\tspawn("taskkill", args, {',
        '\t\t\tstdio: "ignore",',
        '\t\t\tdetached: true,',
        '\t\t\twindowsHide: true',
        '\t\t});',
        '\t} catch {}',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const { patchOpenClawKillTreeRuntime } = await loadCompatTools();
    expect(patchOpenClawKillTreeRuntime(openclawDir)).toEqual(['kill-tree-test.js']);

    const patchedSource = readFileSync(killTreePath, 'utf8');
    expect(patchedSource).toContain('import path from "node:path";');
    expect(patchedSource).toContain('const taskkillPath = path.join(systemRoot, "System32", "taskkill.exe");');
  });

  it('ignores re-export kill-tree chunks and patches only the implementation chunk', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-kill-tree-reexport-'));
    tempDirs.push(tempRoot);

    const openclawDir = join(tempRoot, 'openclaw');
    const distDir = join(openclawDir, 'dist');
    mkdirSync(distDir, { recursive: true });

    writeFileSync(
      join(distDir, 'kill-tree-reexport.js'),
      'import { t as killProcessTree } from "./kill-tree-impl.js";\nexport { killProcessTree };\n',
      'utf8',
    );
    writeFileSync(
      join(distDir, 'kill-tree-impl.js'),
      [
        'import { spawn } from "node:child_process";',
        'function runTaskkill(args) {',
        '\ttry {',
        '\t\tspawn("taskkill", args, {',
        '\t\t\tstdio: "ignore",',
        '\t\t\tdetached: true,',
        '\t\t\twindowsHide: true',
        '\t\t});',
        '\t} catch {}',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const { patchOpenClawKillTreeRuntime } = await loadCompatTools();
    expect(patchOpenClawKillTreeRuntime(openclawDir)).toEqual(['kill-tree-impl.js']);
  });

  it('patches OpenClaw exec runtime to inject UTF-8 setup for PowerShell inline commands', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-exec-runtime-'));
    tempDirs.push(tempRoot);

    const openclawDir = join(tempRoot, 'openclaw');
    const distDir = join(openclawDir, 'dist');
    mkdirSync(distDir, { recursive: true });

    const execPath = join(distDir, 'exec-runtime.js');
    writeFileSync(
      execPath,
      [
        'const WINDOWS_UNSAFE_CMD_CHARS_RE = /[&|<>^%\\r\\n]/;',
        'function isWindowsBatchCommand(resolvedCommand) {',
        '\treturn false;',
        '}',
        'function escapeForCmdExe(arg) {',
        '\treturn arg;',
        '}',
        'function buildCmdExeCommandLine(resolvedCommand, args) {',
        '\treturn [escapeForCmdExe(resolvedCommand), ...args.map(escapeForCmdExe)].join(" ");',
        '}',
        '/**',
        '* On Windows, Node 18.20.2+ (CVE-2024-27980) rejects spawning .cmd/.bat directly',
        '* without shell, causing EINVAL. Resolve npm/npx to node + cli script so we',
        '* spawn node.exe instead of npm.cmd.',
        '*/',
        'function resolveNpmArgvForWindows(argv) {',
        '\treturn null;',
        '}',
        'function resolveCommand(command) {',
        '\treturn command;',
        '}',
        'function resolveChildProcessInvocation(params) {',
        '\tconst finalArgv = process$1.platform === "win32" ? resolveNpmArgvForWindows(params.argv) ?? params.argv : params.argv;',
        '\tconst resolvedCommand = finalArgv !== params.argv ? finalArgv[0] ?? "" : resolveCommand(params.argv[0] ?? "");',
        '\tconst useCmdWrapper = isWindowsBatchCommand(resolvedCommand);',
        '\treturn {',
        '\t\tcommand: useCmdWrapper ? process$1.env.ComSpec ?? "cmd.exe" : resolvedCommand,',
        '\t\targs: useCmdWrapper ? [',
        '\t\t\t"/d",',
        '\t\t\t"/s",',
        '\t\t\t"/c",',
        '\t\t\tbuildCmdExeCommandLine(resolvedCommand, finalArgv.slice(1))',
        '\t\t] : finalArgv.slice(1),',
        '\t\tusesWindowsExitCodeShim: process$1.platform === "win32" && (useCmdWrapper || finalArgv !== params.argv),',
        '\t\twindowsHide: true,',
        '\t\twindowsVerbatimArguments: useCmdWrapper ? true : params.windowsVerbatimArguments',
        '\t};',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const { patchOpenClawExecRuntime } = await loadCompatTools();
    expect(patchOpenClawExecRuntime(openclawDir)).toEqual(['exec-runtime.js']);

    const patchedSource = readFileSync(execPath, 'utf8');
    expect(patchedSource).toContain('lawclaw windows exec powershell utf8 patch v1');
    expect(patchedSource).toContain('const WINDOWS_POWERSHELL_COMMANDS = new Set(["powershell", "powershell.exe", "pwsh", "pwsh.exe"]);');
    expect(patchedSource).toContain('const WINDOWS_POWERSHELL_UTF8_PREAMBLE = "chcp 65001 > $null;');
    expect(patchedSource).toContain('function injectWindowsPowerShellUtf8CommandArgs(args)');
    expect(patchedSource).toContain('const normalizedArgs = !useCmdWrapper && isWindowsPowerShellCommand(resolvedCommand) ? injectWindowsPowerShellUtf8CommandArgs(commandArgs) : commandArgs;');

    expect(patchOpenClawExecRuntime(openclawDir)).toEqual([]);
  });
});
