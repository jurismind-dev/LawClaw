import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { finalizeFeishuOfficialPluginConfig } from './feishu-channel-defaults';

type JsonObject = Record<string, unknown>;
type PluginChannelBackups = Record<string, JsonObject>;

const BACKUP_FILE_NAME = 'clawx-plugin-channel-backups.json';
const ALREADY_INSTALLED_REGEX = /already\s+installed/i;
const FEISHU_OFFICIAL_PLUGIN_ID = 'feishu-openclaw-plugin';

export type PluginInstallSource = 'extensions' | 'plugins.installs' | 'plugins.load.paths';

export interface PluginInstallDetection {
  installed: boolean;
  source?: PluginInstallSource;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function normalizeManifestDependencies(manifest: JsonObject): { manifest: JsonObject; changed: boolean } {
  const dependencies = asObject(manifest.dependencies);
  if (!dependencies || Object.keys(dependencies).length === 0) {
    return { manifest, changed: false };
  }

  return {
    manifest: {
      ...manifest,
      dependencies: {},
    },
    changed: true,
  };
}

function matchesPluginPathCandidate(candidate: unknown, pluginId: string): boolean {
  const pluginIdLower = pluginId.toLowerCase();

  if (typeof candidate === 'string') {
    const normalized = candidate.toLowerCase().replaceAll('\\', '/');
    return normalized.includes(`/${pluginIdLower}`) || normalized.includes(`${pluginIdLower}/`);
  }

  const candidateObject = asObject(candidate);
  if (!candidateObject) {
    return false;
  }

  if (typeof candidateObject.id === 'string' && candidateObject.id.toLowerCase() === pluginIdLower) {
    return true;
  }

  for (const key of ['path', 'sourcePath', 'installPath']) {
    if (typeof candidateObject[key] === 'string' && matchesPluginPathCandidate(candidateObject[key], pluginId)) {
      return true;
    }
  }

  return false;
}

/**
 * Check plugin install state from OpenClaw config only (without filesystem state).
 */
export function detectPluginInstalledFromConfig(
  config: JsonObject | undefined,
  pluginId: string
): PluginInstallDetection {
  if (!config) {
    return { installed: false };
  }

  const pluginIdLower = pluginId.toLowerCase();
  const plugins = asObject(config.plugins);
  if (!plugins) {
    return { installed: false };
  }

  const installs = asObject(plugins.installs);
  if (
    installs &&
    Object.keys(installs).some((key) => key.toLowerCase() === pluginIdLower)
  ) {
    return { installed: true, source: 'plugins.installs' };
  }

  const load = asObject(plugins.load);
  if (load && Array.isArray(load.paths) && load.paths.some((entry) => matchesPluginPathCandidate(entry, pluginId))) {
    return { installed: true, source: 'plugins.load.paths' };
  }

  return { installed: false };
}

/**
 * Unified plugin install detection using extension directory plus OpenClaw config.
 */
export function detectPluginInstallationState(
  pluginId: string,
  options: { hasExtensionDir: boolean; config?: JsonObject }
): PluginInstallDetection {
  if (options.hasExtensionDir) {
    return { installed: true, source: 'extensions' };
  }

  return detectPluginInstalledFromConfig(options.config, pluginId);
}

/**
 * Match OpenClaw CLI "already installed" errors so repeat installs can be idempotent.
 */
export function isAlreadyInstalledErrorMessage(message?: string): boolean {
  if (!message) {
    return false;
  }
  return ALREADY_INSTALLED_REGEX.test(message);
}

function getBackupFilePath(configDir: string): string {
  return join(configDir, BACKUP_FILE_NAME);
}

function readBackups(configDir: string): PluginChannelBackups {
  const backupPath = getBackupFilePath(configDir);
  if (!existsSync(backupPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(backupPath, 'utf-8'));
    const backupObject = asObject(parsed);
    if (!backupObject) {
      return {};
    }

    const normalized: PluginChannelBackups = {};
    for (const [pluginId, value] of Object.entries(backupObject)) {
      const entry = asObject(value);
      if (entry) {
        normalized[pluginId] = entry;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function writeBackups(configDir: string, backups: PluginChannelBackups): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(getBackupFilePath(configDir), JSON.stringify(backups, null, 2), 'utf-8');
}

/**
 * Strip plugin channel config that may make OpenClaw config parsing fail
 * before the plugin is installed.
 */
export function stripPluginChannelConfigForInstall(
  config: JsonObject,
  pluginId: string
): { config: JsonObject; removedChannelConfig?: JsonObject } {
  if (pluginId !== 'qqbot') {
    return { config };
  }

  const channels = asObject(config.channels);
  if (!channels) {
    return { config };
  }

  const qqbot = asObject(channels.qqbot);
  if (!qqbot) {
    return { config };
  }

  const nextChannels: JsonObject = { ...channels };
  delete nextChannels.qqbot;

  return {
    config: {
      ...config,
      channels: nextChannels,
    },
    removedChannelConfig: qqbot,
  };
}

/**
 * Strip plugin channel config only when the plugin is not installed.
 */
export function stripPluginChannelConfigForStartup(
  config: JsonObject,
  pluginId: string,
  pluginInstalled: boolean
): { config: JsonObject; removedChannelConfig?: JsonObject } {
  if (pluginInstalled) {
    return { config };
  }
  return stripPluginChannelConfigForInstall(config, pluginId);
}

/**
 * Restore plugin channel config after plugin install command finishes.
 */
export function restorePluginChannelConfigAfterInstall(
  config: JsonObject,
  pluginId: string,
  removedChannelConfig?: JsonObject
): JsonObject {
  if (pluginId !== 'qqbot' || !removedChannelConfig) {
    return config;
  }

  const channels = asObject(config.channels) || {};
  return {
    ...config,
    channels: {
      ...channels,
      qqbot: removedChannelConfig,
    },
  };
}

/**
 * Apply post-install config required by bundled plugins that replace built-in
 * OpenClaw channels.
 */
export function finalizeBundledPluginConfigAfterInstall(
  config: JsonObject,
  pluginId: string
): { config: JsonObject; changed: boolean } {
  if (pluginId !== FEISHU_OFFICIAL_PLUGIN_ID) {
    return { config, changed: false };
  }
  return finalizeFeishuOfficialPluginConfig(config, {
    seedDisabledWhenEmpty: true,
  });
}

/**
 * Persist stripped plugin channel config to a sidecar backup file.
 */
export function savePluginChannelConfigBackup(
  configDir: string,
  pluginId: string,
  channelConfig: JsonObject
): void {
  const backups = readBackups(configDir);
  backups[pluginId] = { ...channelConfig };
  writeBackups(configDir, backups);
}

/**
 * Read backed-up plugin channel config from sidecar file.
 */
export function readPluginChannelConfigBackup(
  configDir: string,
  pluginId: string
): JsonObject | undefined {
  const backups = readBackups(configDir);
  const backup = backups[pluginId];
  return backup ? { ...backup } : undefined;
}

/**
 * Remove one plugin's backup entry after successful restore.
 */
export function clearPluginChannelConfigBackup(configDir: string, pluginId: string): void {
  const backups = readBackups(configDir);
  if (!backups[pluginId]) {
    return;
  }

  delete backups[pluginId];
  writeBackups(configDir, backups);
}

/**
 * Sanitize plugin manifest for local-dir install so OpenClaw won't execute
 * npm install (which currently fails on some Windows environments).
 */
export function sanitizePluginPackageManifestForLocalInstall(
  packageDir: string
): { changed: boolean } {
  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Plugin package manifest not found: ${manifestPath}`);
  }

  const manifestRaw = readFileSync(manifestPath, 'utf-8');
  const parsed = JSON.parse(manifestRaw);
  const manifest = asObject(parsed);
  if (!manifest) {
    throw new Error(`Invalid plugin package manifest JSON: ${manifestPath}`);
  }

  const normalized = normalizeManifestDependencies(manifest);
  if (!normalized.changed) {
    return { changed: false };
  }

  writeFileSync(manifestPath, `${JSON.stringify(normalized.manifest, null, 2)}\n`, 'utf-8');
  return { changed: true };
}
