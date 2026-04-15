import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  FEISHU_OFFICIAL_PLUGIN_ID,
  FEISHU_OFFICIAL_PLUGIN_NPM_SPEC,
  FEISHU_OFFICIAL_PLUGIN_VERSION,
  findBundledFeishuOfficialPluginDir,
  getInstalledFeishuOfficialPluginVersion,
  getBundledFeishuOfficialPluginDirCandidates,
} from './feishu-official-plugin';
import { sanitizePluginPackageManifestForLocalInstall } from './openclaw-plugin-install';

type JsonObject = Record<string, unknown>;

const RELATIVE_JS_IMPORT_PATTERN =
  /(from\s+['"])(\.\.?\/[^'"?#]+)(['"])|(import\s*\(\s*['"])(\.\.?\/[^'"?#]+)(['"]\s*\))/g;
const FEISHU_PLUGIN_SDK_ROOT_IMPORT_PATTERN =
  /(?:from\s+['"]openclaw\/plugin-sdk['"]|import\s*\(\s*['"]openclaw\/plugin-sdk['"]\s*\))/;
const FEISHU_MONITOR_DYNAMIC_IMPORT =
  "const { monitorFeishuProvider } = await import('./monitor.js');";
const FEISHU_MONITOR_STATIC_IMPORT =
  "import { monitorFeishuProvider } from './monitor.js';";
const FEISHU_PLUGIN_SDK_IMPORT_REWRITES = [
  {
    relativePath: 'index.js',
    before: "import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';",
    after: "import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk/plugin-entry';",
  },
  {
    relativePath: 'src/channel/plugin.js',
    before: "import { DEFAULT_ACCOUNT_ID, PAIRING_APPROVED_MESSAGE } from 'openclaw/plugin-sdk';",
    after: [
      "import { DEFAULT_ACCOUNT_ID } from 'openclaw/plugin-sdk/account-id';",
      "import { PAIRING_APPROVED_MESSAGE } from 'openclaw/plugin-sdk/channel-status';",
    ].join('\n'),
  },
  {
    relativePath: 'src/channel/config-adapter.js',
    before: "import { DEFAULT_ACCOUNT_ID } from 'openclaw/plugin-sdk';",
    after: "import { DEFAULT_ACCOUNT_ID } from 'openclaw/plugin-sdk/account-id';",
  },
  {
    relativePath: 'src/channel/onboarding.js',
    before: "import { DEFAULT_ACCOUNT_ID, formatDocsLink } from 'openclaw/plugin-sdk';",
    after: [
      "import { DEFAULT_ACCOUNT_ID } from 'openclaw/plugin-sdk/account-id';",
      "import { formatDocsLink } from 'openclaw/plugin-sdk/setup-tools';",
    ].join('\n'),
  },
  {
    relativePath: 'src/channel/onboarding-config.js',
    before: "import { addWildcardAllowFrom } from 'openclaw/plugin-sdk';",
    after: "import { addWildcardAllowFrom } from 'openclaw/plugin-sdk/setup';",
  },
  {
    relativePath: 'src/core/accounts.js',
    before: "import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from 'openclaw/plugin-sdk';",
    after: "import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from 'openclaw/plugin-sdk/account-id';",
  },
  {
    relativePath: 'src/messaging/outbound/actions.js',
    before: "import { extractToolSend, jsonResult, readStringParam, readReactionParams } from 'openclaw/plugin-sdk';",
    after: [
      "import { jsonResult, readStringParam, readReactionParams } from 'openclaw/plugin-sdk/channel-actions';",
      "import { extractToolSend } from 'openclaw/plugin-sdk/tool-send';",
    ].join('\n'),
  },
  {
    relativePath: 'src/card/streaming-card-controller.js',
    before: "import { SILENT_REPLY_TOKEN } from 'openclaw/plugin-sdk';",
    after: "import { SILENT_REPLY_TOKEN } from 'openclaw/plugin-sdk/reply-runtime';",
  },
  {
    relativePath: 'src/card/reply-dispatcher.js',
    before: "import { createReplyPrefixContext, createTypingCallbacks, logTypingFailure, } from 'openclaw/plugin-sdk';",
    after: [
      "import { logTypingFailure } from 'openclaw/plugin-sdk/channel-feedback';",
      "import { createReplyPrefixContext, createTypingCallbacks } from 'openclaw/plugin-sdk/channel-reply-pipeline';",
    ].join('\n'),
  },
  {
    relativePath: 'src/messaging/inbound/handler.js',
    before: "import { recordPendingHistoryEntryIfEnabled, DEFAULT_GROUP_HISTORY_LIMIT, resolveSenderCommandAuthorization, isNormalizedSenderAllowed, } from 'openclaw/plugin-sdk';",
    after: [
      "import { isNormalizedSenderAllowed } from 'openclaw/plugin-sdk/allow-from';",
      "import { resolveSenderCommandAuthorization } from 'openclaw/plugin-sdk/command-auth';",
      "import { DEFAULT_GROUP_HISTORY_LIMIT, recordPendingHistoryEntryIfEnabled } from 'openclaw/plugin-sdk/reply-history';",
    ].join('\n'),
  },
  {
    relativePath: 'src/messaging/inbound/dispatch-builders.js',
    before: "import { buildPendingHistoryContextFromMap } from 'openclaw/plugin-sdk';",
    after: "import { buildPendingHistoryContextFromMap } from 'openclaw/plugin-sdk/reply-history';",
  },
  {
    relativePath: 'src/messaging/inbound/dispatch-context.js',
    before: "import { resolveThreadSessionKeys } from 'openclaw/plugin-sdk';",
    after: "import { resolveThreadSessionKeys } from 'openclaw/plugin-sdk/routing';",
  },
  {
    relativePath: 'src/messaging/inbound/dispatch.js',
    before: "import { clearHistoryEntriesIfEnabled } from 'openclaw/plugin-sdk';",
    after: "import { clearHistoryEntriesIfEnabled } from 'openclaw/plugin-sdk/reply-history';",
  },
  {
    relativePath: 'src/messaging/inbound/reaction-handler.js',
    before: "import { DEFAULT_GROUP_HISTORY_LIMIT } from 'openclaw/plugin-sdk';",
    after: "import { DEFAULT_GROUP_HISTORY_LIMIT } from 'openclaw/plugin-sdk/reply-history';",
  },
  {
    relativePath: 'src/tools/tat/im/resource.js',
    before: "import { buildRandomTempFilePath } from 'openclaw/plugin-sdk';",
    after: "import { buildRandomTempFilePath } from 'openclaw/plugin-sdk/temp-path';",
  },
  {
    relativePath: 'src/tools/oapi/im/resource.js',
    before: "import { buildRandomTempFilePath } from 'openclaw/plugin-sdk';",
    after: "import { buildRandomTempFilePath } from 'openclaw/plugin-sdk/temp-path';",
  },
] as const;

export interface FeishuPluginCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

export type FeishuPluginCommandRunner = (
  command: string,
  args: string[],
  cwd: string,
  useShell: boolean
) => Promise<FeishuPluginCommandResult>;

export interface PrepareFeishuOfficialPluginInstallDirOptions {
  isPackaged: boolean;
  resourcesDir: string;
  resourcesPath?: string;
  runCommand: FeishuPluginCommandRunner;
  npmSpec?: string;
}

export interface PrepareFeishuOfficialPluginInstallDirResult {
  success: boolean;
  tempDir?: string;
  installPath?: string;
  error?: string;
  details?: string;
}

export interface RepairInstalledFeishuOfficialPluginOptions
  extends PrepareFeishuOfficialPluginInstallDirOptions {
  openClawConfigDir: string;
}

export interface RepairInstalledFeishuOfficialPluginResult {
  repaired: boolean;
  reason: 'not-installed' | 'healthy' | 'repaired' | 'failed';
  pluginDir: string;
  missingPaths: string[];
  error?: string;
  details?: string;
}

const TOP_LEVEL_NODE_MODULE_PATTERN = /^node_modules\/((?:@[^/]+\/)?[^/]+)$/;
const LOCKFILE_SKIP_PACKAGE_PREFIXES = ['@types/'];
const LOCKFILE_SKIP_PACKAGES = new Set(['typescript', '@playwright/test']);
const FEISHU_OFFICIAL_PLUGIN_REQUIRED_RUNTIME_PATHS = [
  'package.json',
  'openclaw.plugin.json',
  'index.js',
  'node_modules/@larksuiteoapi/node-sdk/package.json',
  'node_modules/@sinclair/typebox/build/cjs/index.js',
  'node_modules/zod/package.json',
];

const FEISHU_OFFICIAL_PLUGIN_ENTRY_VALIDATION_PATHS = [
  'index.js',
  'src/channel/monitor.js',
  'src/channel/plugin.js',
];

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function parseJsonObject(filePath: string): JsonObject | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    return asObject(parsed);
  } catch {
    return null;
  }
}

function formatMissingRuntimePaths(missingPaths: string[]): string {
  return missingPaths.map((entry) => `"${entry}"`).join(', ');
}

function rewriteExtensionlessRelativeJsImports(filePath: string): boolean {
  const original = readFileSync(filePath, 'utf-8');
  let changed = false;

  const next = original.replace(
    RELATIVE_JS_IMPORT_PATTERN,
    (
      match,
      staticPrefix: string | undefined,
      staticSpec: string | undefined,
      staticSuffix: string | undefined,
      dynamicPrefix: string | undefined,
      dynamicSpec: string | undefined,
      dynamicSuffix: string | undefined
    ) => {
      const spec = staticSpec ?? dynamicSpec;
      if (!spec) {
        return match;
      }

      if (/\.[a-z0-9]+$/i.test(spec)) {
        return match;
      }

      const candidateJsPath = `${spec}.js`;
      const resolvedJsPath = join(dirname(filePath), candidateJsPath);
      if (!existsSync(resolvedJsPath)) {
        return match;
      }

      changed = true;
      if (staticSpec) {
        return `${staticPrefix}${candidateJsPath}${staticSuffix}`;
      }
      return `${dynamicPrefix}${candidateJsPath}${dynamicSuffix}`;
    }
  );

  if (!changed) {
    return false;
  }

  writeFileSync(filePath, next, 'utf-8');
  return true;
}

function isExtensionlessRelativeJsImport(filePath: string, spec: string | undefined): boolean {
  if (!spec || /\.[a-z0-9]+$/i.test(spec)) {
    return false;
  }

  return existsSync(join(dirname(filePath), `${spec}.js`));
}

function normalizeFeishuPluginEsmImports(packageDir: string): { changed: boolean; fileCount: number } {
  const srcDir = join(packageDir, 'src');
  if (!existsSync(srcDir)) {
    return { changed: false, fileCount: 0 };
  }

  let changed = false;
  let fileCount = 0;
  const stack = [srcDir, packageDir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          continue;
        }
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('.js')) {
        continue;
      }

      if (rewriteExtensionlessRelativeJsImports(fullPath)) {
        changed = true;
        fileCount++;
      }
    }
  }

  return { changed, fileCount };
}

function patchFeishuGatewayMonitorImport(packageDir: string): boolean {
  const pluginEntryPath = join(packageDir, 'src', 'channel', 'plugin.js');
  if (!existsSync(pluginEntryPath)) {
    return false;
  }

  const original = readFileSync(pluginEntryPath, 'utf-8');
  if (!original.includes(FEISHU_MONITOR_DYNAMIC_IMPORT)) {
    return false;
  }

  let next = original.replace(FEISHU_MONITOR_DYNAMIC_IMPORT, '');
  if (!next.includes(FEISHU_MONITOR_STATIC_IMPORT)) {
    const anchor = "import { FEISHU_CONFIG_JSON_SCHEMA } from '../core/config-schema.js';";
    if (!next.includes(anchor)) {
      throw new Error(`Unable to patch Feishu plugin monitor import: anchor not found in ${pluginEntryPath}`);
    }
    next = next.replace(anchor, `${anchor}\n${FEISHU_MONITOR_STATIC_IMPORT}`);
  }

  writeFileSync(pluginEntryPath, next, 'utf-8');
  return true;
}

function patchFeishuPluginSdkRootImports(packageDir: string): { changed: boolean; fileCount: number } {
  let changed = false;
  let fileCount = 0;

  for (const rewrite of FEISHU_PLUGIN_SDK_IMPORT_REWRITES) {
    const filePath = join(packageDir, rewrite.relativePath);
    if (!existsSync(filePath)) {
      continue;
    }

    const original = readFileSync(filePath, 'utf-8');
    if (!original.includes(rewrite.before)) {
      continue;
    }

    const next = original.replace(rewrite.before, rewrite.after);
    if (next === original) {
      continue;
    }

    writeFileSync(filePath, next, 'utf-8');
    changed = true;
    fileCount++;
  }

  return { changed, fileCount };
}

function getFeishuPluginSdkRootImportPaths(packageDir: string): string[] {
  const paths: string[] = [];
  const stack = [packageDir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          continue;
        }
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('.js')) {
        continue;
      }

      if (FEISHU_PLUGIN_SDK_ROOT_IMPORT_PATTERN.test(readFileSync(fullPath, 'utf-8'))) {
        paths.push(fullPath.slice(packageDir.length + 1).replaceAll('\\', '/'));
      }
    }
  }

  return paths.sort((left, right) => left.localeCompare(right));
}

function hasFeishuGatewayDynamicMonitorImport(packageDir: string): boolean {
  const pluginEntryPath = join(packageDir, 'src', 'channel', 'plugin.js');
  if (!existsSync(pluginEntryPath)) {
    return false;
  }

  return readFileSync(pluginEntryPath, 'utf-8').includes(FEISHU_MONITOR_DYNAMIC_IMPORT);
}

function getFeishuOfficialPluginInvalidEntryPaths(packageDir: string): string[] {
  const invalidPaths = FEISHU_OFFICIAL_PLUGIN_ENTRY_VALIDATION_PATHS.filter((relativePath) => {
    const filePath = join(packageDir, relativePath);
    if (!existsSync(filePath)) {
      return false;
    }

    const content = readFileSync(filePath, 'utf-8');
    RELATIVE_JS_IMPORT_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RELATIVE_JS_IMPORT_PATTERN.exec(content)) !== null) {
      if (isExtensionlessRelativeJsImport(filePath, match[2] ?? match[5])) {
        return true;
      }
    }
    return false;
  });

  if (hasFeishuGatewayDynamicMonitorImport(packageDir)) {
    invalidPaths.push('src/channel/plugin.js');
  }

  invalidPaths.push(...getFeishuPluginSdkRootImportPaths(packageDir));

  return Array.from(new Set(invalidPaths));
}

function collectLockfileRootDependencies(packageDir: string): Record<string, string> {
  const packageLock = parseJsonObject(join(packageDir, 'package-lock.json'));
  const packages = asObject(packageLock?.packages);
  if (!packages) {
    return {};
  }

  const entries = Object.entries(packages)
    .map(([lockPath, entry]) => {
      const match = lockPath.match(TOP_LEVEL_NODE_MODULE_PATTERN);
      const packageEntry = asObject(entry);
      if (!match?.[1] || !packageEntry || typeof packageEntry.version !== 'string' || !packageEntry.version.trim()) {
        return null;
      }

      const packageName = match[1];
      if (
        LOCKFILE_SKIP_PACKAGES.has(packageName)
        || LOCKFILE_SKIP_PACKAGE_PREFIXES.some((prefix) => packageName.startsWith(prefix))
      ) {
        return null;
      }

      return [packageName, packageEntry.version.trim()] as const;
    })
    .filter((entry): entry is readonly [string, string] => Array.isArray(entry));

  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

export function getFeishuOfficialPluginMissingRuntimePaths(packageDir: string): string[] {
  return FEISHU_OFFICIAL_PLUGIN_REQUIRED_RUNTIME_PATHS
    .filter((relativePath) => !existsSync(join(packageDir, relativePath)));
}

export function hydratePluginManifestDependenciesFromLockfile(
  packageDir: string
): { changed: boolean; dependencyCount: number } {
  const manifestPath = join(packageDir, 'package.json');
  const manifest = parseJsonObject(manifestPath);
  if (!manifest) {
    throw new Error(`Plugin package manifest not found or invalid: ${manifestPath}`);
  }

  const existingDependencies = asObject(manifest.dependencies);
  if (existingDependencies && Object.keys(existingDependencies).length > 0) {
    return {
      changed: false,
      dependencyCount: Object.keys(existingDependencies).length,
    };
  }

  const lockfileDependencies = collectLockfileRootDependencies(packageDir);
  const dependencyNames = Object.keys(lockfileDependencies);
  if (dependencyNames.length === 0) {
    return { changed: false, dependencyCount: 0 };
  }

  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      ...manifest,
      dependencies: lockfileDependencies,
    }, null, 2)}\n`,
    'utf-8'
  );

  return {
    changed: true,
    dependencyCount: dependencyNames.length,
  };
}

async function repairPreparedPluginInstallDir(
  packageDir: string,
  runCommand: FeishuPluginCommandRunner
): Promise<{ success: boolean; error?: string; details?: string }> {
  const missingBeforeRepair = getFeishuOfficialPluginMissingRuntimePaths(packageDir);
  if (missingBeforeRepair.length > 0) {
    const hydrated = hydratePluginManifestDependenciesFromLockfile(packageDir);
    if (hydrated.dependencyCount === 0) {
      return {
        success: false,
        error: 'Unable to restore Feishu official plugin dependencies',
        details: 'package-lock.json does not provide any installable runtime dependencies',
      };
    }

    const nodeModulesDir = join(packageDir, 'node_modules');
    if (existsSync(nodeModulesDir)) {
      // The bundled plugin may contain partially tracked dependencies. Remove them
      // before reinstalling so npm does not keep a broken package tree in place.
      rmSync(nodeModulesDir, { recursive: true, force: true });
    }

    const depsResult = await runCommand(
      'npm',
      ['install', '--omit=dev', '--omit=peer', '--silent', '--ignore-scripts'],
      packageDir,
      true
    );
    if (!depsResult.success) {
      return {
        success: false,
        error: depsResult.error || 'Failed to install Feishu official plugin dependencies',
        details: depsResult.stderr || depsResult.stdout,
      };
    }

    sanitizePluginPackageManifestForLocalInstall(packageDir);
  }
  normalizeFeishuPluginEsmImports(packageDir);
  patchFeishuGatewayMonitorImport(packageDir);
  patchFeishuPluginSdkRootImports(packageDir);

  const missingPaths = getFeishuOfficialPluginMissingRuntimePaths(packageDir);
  if (missingPaths.length > 0) {
    return {
      success: false,
      error: 'Feishu official plugin repair finished but runtime files are still missing',
      details: formatMissingRuntimePaths(missingPaths),
    };
  }

  const invalidEntryPaths = getFeishuOfficialPluginInvalidEntryPaths(packageDir);
  if (invalidEntryPaths.length > 0) {
    return {
      success: false,
      error: 'Feishu official plugin repair finished but ESM entry imports are still invalid',
      details: formatMissingRuntimePaths(invalidEntryPaths),
    };
  }

  return { success: true };
}

export async function prepareFeishuOfficialPluginInstallDir(
  options: PrepareFeishuOfficialPluginInstallDirOptions
): Promise<PrepareFeishuOfficialPluginInstallDirResult> {
  const bundledDir = findBundledFeishuOfficialPluginDir({
    resourcesDir: options.resourcesDir,
    isPackaged: options.isPackaged,
    resourcesPath: options.resourcesPath,
  });

  if (bundledDir) {
    const missingPaths = getFeishuOfficialPluginMissingRuntimePaths(bundledDir);
    const invalidEntryPaths = getFeishuOfficialPluginInvalidEntryPaths(bundledDir);
    if (missingPaths.length === 0 && invalidEntryPaths.length === 0) {
      return {
        success: true,
        installPath: bundledDir,
      };
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'lawclaw-feishu-install-'));
    const repairDir = join(tempDir, FEISHU_OFFICIAL_PLUGIN_ID);
    cpSync(bundledDir, repairDir, { recursive: true, dereference: true });

    const repairResult = await repairPreparedPluginInstallDir(repairDir, options.runCommand);
    if (!repairResult.success) {
      return {
        success: false,
        tempDir,
        error: repairResult.error,
        details:
          repairResult.details
          || [
            missingPaths.length > 0
              ? `Bundled plugin is incomplete. Missing runtime files: ${formatMissingRuntimePaths(missingPaths)}`
              : null,
            invalidEntryPaths.length > 0
              ? `Bundled plugin has invalid ESM imports: ${formatMissingRuntimePaths(invalidEntryPaths)}`
              : null,
          ].filter(Boolean).join('\n'),
      };
    }

    return {
      success: true,
      tempDir,
      installPath: repairDir,
    };
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'lawclaw-feishu-install-'));
  const extractDir = join(tempDir, 'extract');
  mkdirSync(extractDir, { recursive: true });

  const packResult = await options.runCommand(
    'npm',
    ['pack', options.npmSpec || FEISHU_OFFICIAL_PLUGIN_NPM_SPEC, '--silent'],
    tempDir,
    true
  );
  if (!packResult.success) {
    return {
      success: false,
      tempDir,
      error: packResult.error || 'Failed to download Feishu official plugin package',
      details: packResult.stderr || packResult.stdout,
    };
  }

  const packedName = packResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
  if (!packedName) {
    return {
      success: false,
      tempDir,
      error: 'npm pack completed but returned no archive filename',
      details: packResult.stdout,
    };
  }

  const archivePath = join(tempDir, packedName);
  const extractResult = await options.runCommand('tar', ['-xzf', archivePath, '-C', extractDir], tempDir, false);
  if (!extractResult.success) {
    return {
      success: false,
      tempDir,
      error: extractResult.error || 'Failed to extract Feishu official plugin archive',
      details: extractResult.stderr || extractResult.stdout,
    };
  }

  const installPath = join(extractDir, 'package');
  const repairResult = await repairPreparedPluginInstallDir(installPath, options.runCommand);
  if (!repairResult.success) {
    return {
      success: false,
      tempDir,
      error: repairResult.error,
      details: repairResult.details,
    };
  }

  return {
    success: true,
    tempDir,
    installPath,
  };
}

export function describeMissingBundledFeishuOfficialPluginCandidates(options: {
  resourcesDir: string;
  isPackaged: boolean;
  resourcesPath?: string;
}): string[] {
  return getBundledFeishuOfficialPluginDirCandidates(options);
}

export async function repairInstalledFeishuOfficialPluginIfNeeded(
  options: RepairInstalledFeishuOfficialPluginOptions
): Promise<RepairInstalledFeishuOfficialPluginResult> {
  const pluginDir = join(options.openClawConfigDir, 'extensions', FEISHU_OFFICIAL_PLUGIN_ID);
  if (!existsSync(pluginDir)) {
    return {
      repaired: false,
      reason: 'not-installed',
      pluginDir,
      missingPaths: [],
    };
  }

  const installedVersion = getInstalledFeishuOfficialPluginVersion(options.openClawConfigDir);
  const missingPaths = getFeishuOfficialPluginMissingRuntimePaths(pluginDir);
  const invalidEntryPaths = getFeishuOfficialPluginInvalidEntryPaths(pluginDir);
  if (
    missingPaths.length === 0
    && invalidEntryPaths.length === 0
    && installedVersion === FEISHU_OFFICIAL_PLUGIN_VERSION
  ) {
    return {
      repaired: false,
      reason: 'healthy',
      pluginDir,
      missingPaths: [],
    };
  }

  const prepared = await prepareFeishuOfficialPluginInstallDir(options);
  if (!prepared.success || !prepared.installPath) {
    return {
      repaired: false,
      reason: 'failed',
      pluginDir,
      missingPaths,
      error: prepared.error || 'Failed to prepare Feishu official plugin repair payload',
      details: prepared.details,
    };
  }

  const publishTempDir = mkdtempSync(join(tmpdir(), 'lawclaw-feishu-repair-publish-'));
  const stageDir = join(publishTempDir, FEISHU_OFFICIAL_PLUGIN_ID);
  const extensionsDir = join(options.openClawConfigDir, 'extensions');

  try {
    mkdirSync(extensionsDir, { recursive: true });
    cpSync(prepared.installPath, stageDir, { recursive: true, dereference: true });

    rmSync(pluginDir, { recursive: true, force: true });
    cpSync(stageDir, pluginDir, { recursive: true, dereference: true });

    const installedVersionAfterRepair = getInstalledFeishuOfficialPluginVersion(options.openClawConfigDir);
    const missingAfterRepair = getFeishuOfficialPluginMissingRuntimePaths(pluginDir);
    const invalidAfterRepair = getFeishuOfficialPluginInvalidEntryPaths(pluginDir);
    if (
      installedVersionAfterRepair !== FEISHU_OFFICIAL_PLUGIN_VERSION
      || missingAfterRepair.length > 0
      || invalidAfterRepair.length > 0
    ) {
      const details = [];
      if (installedVersionAfterRepair !== FEISHU_OFFICIAL_PLUGIN_VERSION) {
        details.push(
          `expected version ${FEISHU_OFFICIAL_PLUGIN_VERSION}, got ${installedVersionAfterRepair || 'unknown'}`
        );
      }
      if (missingAfterRepair.length > 0) {
        details.push(formatMissingRuntimePaths(missingAfterRepair));
      }
      if (invalidAfterRepair.length > 0) {
        details.push(`invalid ESM imports: ${formatMissingRuntimePaths(invalidAfterRepair)}`);
      }

      return {
        repaired: false,
        reason: 'failed',
        pluginDir,
        missingPaths: missingAfterRepair,
        error: 'Feishu official plugin repair completed but validation failed',
        details: details.join('\n'),
      };
    }

    return {
      repaired: true,
      reason: 'repaired',
      pluginDir,
      missingPaths,
    };
  } catch (error) {
    return {
      repaired: false,
      reason: 'failed',
      pluginDir,
      missingPaths,
      error: String(error),
    };
  } finally {
    rmSync(publishTempDir, { recursive: true, force: true });
    if (prepared.tempDir) {
      rmSync(prepared.tempDir, { recursive: true, force: true });
    }
  }
}
