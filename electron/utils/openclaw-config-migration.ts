import { type OpenClawConfig, readOpenClawConfig, writeOpenClawConfig } from './channel-config';
import { logger } from './logger';
import { migrateLegacyOpenClawWebToolConfig } from './openclaw-auth';

const RETIRED_CHANNEL_IDS = new Set(['dingtalk', 'qq', 'qqbot']);
const RETIRED_PLUGIN_IDS = new Set([
  'dingtalk',
  'openclaw-dingtalk',
  'qq',
  'qqbot',
  'openclaw-qq',
  'openclaw-qqbot',
]);

export interface OpenClawConfigMigrationSummary {
  removedChannels: string[];
  removedBindings: number;
  removedPluginEntries: string[];
  removedPluginAllow: string[];
  removedPluginInstalls: string[];
  removedPluginLoadPaths: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function isRetiredChannelId(value: string): boolean {
  return RETIRED_CHANNEL_IDS.has(normalizeKey(value));
}

function isRetiredPluginId(value: string): boolean {
  return RETIRED_PLUGIN_IDS.has(normalizeKey(value));
}

function matchesRetiredPluginString(value: string): boolean {
  const normalized = value.trim().toLowerCase().replaceAll('\\', '/');
  if (!normalized) {
    return false;
  }

  for (const pluginId of RETIRED_PLUGIN_IDS) {
    if (
      normalized === pluginId
      || normalized.startsWith(`${pluginId}@`)
      || normalized.endsWith(`/${pluginId}`)
      || normalized.includes(`/${pluginId}/`)
    ) {
      return true;
    }
  }

  return false;
}

function matchesRetiredPluginCandidate(candidate: unknown): boolean {
  if (typeof candidate === 'string') {
    return matchesRetiredPluginString(candidate);
  }

  if (!isRecord(candidate)) {
    return false;
  }

  for (const key of ['id', 'pluginId', 'name', 'path', 'sourcePath', 'installPath', 'package', 'npmSpec']) {
    const value = candidate[key];
    if (typeof value === 'string' && matchesRetiredPluginString(value)) {
      return true;
    }
  }

  return false;
}

function compactPlugins(config: OpenClawConfig): void {
  if (!isRecord(config.plugins)) {
    return;
  }

  const plugins = config.plugins;
  if (isRecord(plugins.entries) && Object.keys(plugins.entries).length === 0) {
    delete plugins.entries;
  }
  if (isRecord(plugins.installs) && Object.keys(plugins.installs).length === 0) {
    delete plugins.installs;
  }
  if (isRecord(plugins.load)) {
    const load = plugins.load;
    if (Array.isArray(load.paths) && load.paths.length === 0) {
      delete load.paths;
    }
    if (Object.keys(load).length === 0) {
      delete plugins.load;
    }
  }
  if (Array.isArray(plugins.allow) && plugins.allow.length === 0) {
    delete plugins.allow;
  }
  if (Object.keys(plugins).length === 0) {
    delete config.plugins;
  }
}

export function cleanupRetiredChannelEntriesInConfig(config: OpenClawConfig): {
  changed: boolean;
  config: OpenClawConfig;
  summary: OpenClawConfigMigrationSummary;
} {
  const sourcePlugins = isRecord(config.plugins) ? config.plugins : undefined;
  const sourcePluginLoad = sourcePlugins && isRecord(sourcePlugins.load) ? sourcePlugins.load : undefined;
  const nextConfig: OpenClawConfig = {
    ...config,
    ...(isRecord(config.channels) ? { channels: { ...config.channels } } : {}),
    ...(sourcePlugins
      ? {
          plugins: {
            ...sourcePlugins,
            ...(isRecord(sourcePlugins.entries) ? { entries: { ...sourcePlugins.entries } } : {}),
            ...(Array.isArray(sourcePlugins.allow) ? { allow: [...sourcePlugins.allow] } : {}),
            ...(isRecord(sourcePlugins.installs) ? { installs: { ...sourcePlugins.installs } } : {}),
            ...(sourcePluginLoad
              ? {
                  load: {
                    ...sourcePluginLoad,
                    ...(Array.isArray(sourcePluginLoad.paths)
                      ? { paths: [...sourcePluginLoad.paths] }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
  };
  const summary: OpenClawConfigMigrationSummary = {
    removedChannels: [],
    removedBindings: 0,
    removedPluginEntries: [],
    removedPluginAllow: [],
    removedPluginInstalls: [],
    removedPluginLoadPaths: 0,
  };
  let changed = false;

  if (isRecord(nextConfig.channels)) {
    for (const channelId of Object.keys(nextConfig.channels)) {
      if (!isRetiredChannelId(channelId)) {
        continue;
      }

      delete nextConfig.channels[channelId];
      summary.removedChannels.push(channelId);
      changed = true;
    }

    if (Object.keys(nextConfig.channels).length === 0) {
      delete nextConfig.channels;
    }
  }

  if (Array.isArray(nextConfig.bindings)) {
    const nextBindings = nextConfig.bindings.filter((binding) => {
      if (!isRecord(binding) || !isRecord(binding.match) || typeof binding.match.channel !== 'string') {
        return true;
      }

      return !isRetiredChannelId(binding.match.channel);
    });

    summary.removedBindings = nextConfig.bindings.length - nextBindings.length;
    if (summary.removedBindings > 0) {
      changed = true;
      if (nextBindings.length > 0) {
        nextConfig.bindings = nextBindings;
      } else {
        delete nextConfig.bindings;
      }
    }
  }

  if (isRecord(nextConfig.plugins)) {
    const plugins = nextConfig.plugins;

    if (isRecord(plugins.entries)) {
      for (const pluginId of Object.keys(plugins.entries)) {
        if (!isRetiredPluginId(pluginId)) {
          continue;
        }

        delete plugins.entries[pluginId];
        summary.removedPluginEntries.push(pluginId);
        changed = true;
      }
    }

    if (Array.isArray(plugins.allow)) {
      const removedPluginAllow = plugins.allow.filter(
        (item): item is string => typeof item === 'string' && isRetiredPluginId(item)
      );
      if (removedPluginAllow.length > 0) {
        plugins.allow = plugins.allow.filter(
          (item): item is string => typeof item === 'string' && !isRetiredPluginId(item)
        );
        summary.removedPluginAllow = removedPluginAllow;
        changed = true;
      }
    }

    if (isRecord(plugins.installs)) {
      for (const pluginId of Object.keys(plugins.installs)) {
        if (!isRetiredPluginId(pluginId)) {
          continue;
        }

        delete plugins.installs[pluginId];
        summary.removedPluginInstalls.push(pluginId);
        changed = true;
      }
    }

    if (isRecord(plugins.load) && Array.isArray(plugins.load.paths)) {
      const nextLoadPaths = plugins.load.paths.filter((entry) => !matchesRetiredPluginCandidate(entry));
      summary.removedPluginLoadPaths = plugins.load.paths.length - nextLoadPaths.length;
      if (summary.removedPluginLoadPaths > 0) {
        plugins.load.paths = nextLoadPaths;
        changed = true;
      }
    }

    compactPlugins(nextConfig);
  }

  return { changed, config: nextConfig, summary };
}

export async function runOpenClawConfigStartupMigration(): Promise<void> {
  try {
    const currentConfig = await readOpenClawConfig();
    const result = cleanupRetiredChannelEntriesInConfig(currentConfig);

    if (result.changed) {
      await writeOpenClawConfig(result.config);
    }

    const migratedLegacyWebTools = migrateLegacyOpenClawWebToolConfig();
    if (result.changed || migratedLegacyWebTools) {
      logger.info('OpenClaw config startup migration completed:', {
        ...result.summary,
        migratedLegacyWebTools,
      });
    } else {
      logger.debug('OpenClaw config startup migration skipped (no legacy data found).');
    }
  } catch (error) {
    logger.warn('OpenClaw config startup migration failed (non-blocking):', error);
  }
}
