import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FEISHU_OFFICIAL_PLUGIN_ID,
  FEISHU_OFFICIAL_PLUGIN_NPM_SPEC,
  FEISHU_OFFICIAL_PLUGIN_VERSION,
  findBundledFeishuOfficialPluginDir,
  getBundledFeishuOfficialPluginDirCandidates,
} from './feishu-official-plugin';
import { sanitizePluginPackageManifestForLocalInstall } from './openclaw-plugin-install';

type JsonObject = Record<string, unknown>;

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
  installedVersion: string | null;
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

function getPluginManifestVersion(packageDir: string): string | null {
  const manifest = parseJsonObject(join(packageDir, 'package.json'));
  return typeof manifest?.version === 'string' && manifest.version.trim()
    ? manifest.version.trim()
    : null;
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

  const missingPaths = getFeishuOfficialPluginMissingRuntimePaths(packageDir);
  if (missingPaths.length > 0) {
    return {
      success: false,
      error: 'Feishu official plugin repair finished but runtime files are still missing',
      details: formatMissingRuntimePaths(missingPaths),
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
    if (missingPaths.length === 0) {
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
          || `Bundled plugin is incomplete. Missing runtime files: ${formatMissingRuntimePaths(missingPaths)}`,
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
      installedVersion: null,
      missingPaths: [],
    };
  }

  const missingPaths = getFeishuOfficialPluginMissingRuntimePaths(pluginDir);
  const installedVersion = getPluginManifestVersion(pluginDir);
  const versionMismatch = installedVersion !== FEISHU_OFFICIAL_PLUGIN_VERSION;
  if (missingPaths.length === 0 && !versionMismatch) {
    return {
      repaired: false,
      reason: 'healthy',
      pluginDir,
      installedVersion,
      missingPaths: [],
    };
  }

  const prepared = await prepareFeishuOfficialPluginInstallDir(options);
  if (!prepared.success || !prepared.installPath) {
    return {
      repaired: false,
      reason: 'failed',
      pluginDir,
      installedVersion,
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

    const missingAfterRepair = getFeishuOfficialPluginMissingRuntimePaths(pluginDir);
    if (missingAfterRepair.length > 0) {
      return {
        repaired: false,
        reason: 'failed',
        pluginDir,
        installedVersion: getPluginManifestVersion(pluginDir),
        missingPaths: missingAfterRepair,
        error: 'Feishu official plugin repair completed but runtime files are still missing',
        details: formatMissingRuntimePaths(missingAfterRepair),
      };
    }

    const repairedVersion = getPluginManifestVersion(pluginDir);
    if (repairedVersion !== FEISHU_OFFICIAL_PLUGIN_VERSION) {
      return {
        repaired: false,
        reason: 'failed',
        pluginDir,
        installedVersion: repairedVersion,
        missingPaths: [],
        error: 'Feishu official plugin repair completed but version is still incompatible',
        details: `expected ${FEISHU_OFFICIAL_PLUGIN_VERSION}, received ${repairedVersion || 'unknown'}`,
      };
    }

    return {
      repaired: true,
      reason: 'repaired',
      pluginDir,
      installedVersion: repairedVersion,
      missingPaths,
    };
  } catch (error) {
    return {
      repaired: false,
      reason: 'failed',
      pluginDir,
      installedVersion,
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
