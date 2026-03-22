import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { finalizeFeishuOfficialPluginConfig } from './feishu-channel-defaults';

type JsonObject = Record<string, unknown>;

const ALREADY_INSTALLED_REGEX = /already\s+installed/i;
const FEISHU_OFFICIAL_PLUGIN_ID = 'openclaw-lark';

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
  if (installs && Object.keys(installs).some((key) => key.toLowerCase() === pluginIdLower)) {
    return { installed: true, source: 'plugins.installs' };
  }

  const load = asObject(plugins.load);
  if (load && Array.isArray(load.paths) && load.paths.some((entry) => matchesPluginPathCandidate(entry, pluginId))) {
    return { installed: true, source: 'plugins.load.paths' };
  }

  return { installed: false };
}

export function detectPluginInstallationState(
  pluginId: string,
  options: { hasExtensionDir: boolean; config?: JsonObject }
): PluginInstallDetection {
  if (options.hasExtensionDir) {
    return { installed: true, source: 'extensions' };
  }

  return detectPluginInstalledFromConfig(options.config, pluginId);
}

export function isAlreadyInstalledErrorMessage(message?: string): boolean {
  if (!message) {
    return false;
  }
  return ALREADY_INSTALLED_REGEX.test(message);
}

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
