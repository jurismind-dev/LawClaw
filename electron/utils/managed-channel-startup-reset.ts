import { access, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { getSetting, setSetting } from './store';
import { stringifyJsonText, parseJsonText } from './text-encoding';
import { clearWeixinStoredState, WEIXIN_CHANNEL_ID } from './weixin-channel-state';

const FEISHU_CHANNEL_ID = 'feishu';
const RESET_MARKER_FILENAME = 'managed-channel-reset-v1.json';
const RESET_TARGET_CHANNEL_IDS = new Set([FEISHU_CHANNEL_ID, WEIXIN_CHANNEL_ID]);
const RESET_TARGET_PLUGIN_IDS = new Set([
  FEISHU_CHANNEL_ID,
  'openclaw-lark',
  'feishu-openclaw-plugin',
  '@larksuite/openclaw-lark',
  WEIXIN_CHANNEL_ID,
]);
const RESET_TARGET_EXTENSION_DIRS = [
  'openclaw-lark',
  FEISHU_CHANNEL_ID,
  'feishu-openclaw-plugin',
  WEIXIN_CHANNEL_ID,
] as const;

interface ManagedChannelStartupResetDeps {
  appVersion: string;
  homeDir: string;
  now: () => Date;
  clearWeixinStoredState: typeof clearWeixinStoredState;
  getManagedChannels: () => Promise<string[]>;
  setManagedChannels: (channels: string[]) => Promise<void>;
}

export interface ManagedChannelStartupResetSummary {
  status: 'applied' | 'skipped';
  reason?: 'already-ran';
  configChanged: boolean;
  removedExtensionDirs: string[];
  updatedManagedChannels: boolean;
  clearedWeixinState: boolean;
  markerPath: string;
}

interface BindingRule {
  match?: {
    channel?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeChannelId(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readOpenClawConfig(configPath: string): Promise<Record<string, unknown>> {
  if (!(await pathExists(configPath))) {
    return {};
  }

  const raw = await readFile(configPath, 'utf-8');
  const parsed = parseJsonText(raw);
  return isRecord(parsed) ? parsed : {};
}

async function writeOpenClawConfig(configPath: string, config: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, stringifyJsonText(config), 'utf-8');
}

function cleanupManagedChannelConfig(config: Record<string, unknown>): boolean {
  let changed = false;

  if (isRecord(config.channels)) {
    const channels = { ...config.channels };
    for (const channelId of RESET_TARGET_CHANNEL_IDS) {
      if (Object.prototype.hasOwnProperty.call(channels, channelId)) {
        delete channels[channelId];
        changed = true;
      }
    }

    if (Object.keys(channels).length > 0) {
      config.channels = channels;
    } else if (Object.prototype.hasOwnProperty.call(config, 'channels')) {
      delete config.channels;
    }
  }

  if (Array.isArray(config.bindings)) {
    const nextBindings = config.bindings.filter((binding) => {
      const match = isRecord(binding) ? (binding as BindingRule).match : undefined;
      return !RESET_TARGET_CHANNEL_IDS.has(normalizeChannelId(match?.channel));
    });

    if (nextBindings.length !== config.bindings.length) {
      if (nextBindings.length > 0) {
        config.bindings = nextBindings;
      } else {
        delete config.bindings;
      }
      changed = true;
    }
  }

  if (isRecord(config.plugins)) {
    const plugins = { ...config.plugins };

    if (Array.isArray(plugins.allow)) {
      const nextAllow = plugins.allow.filter((item): item is string => {
        return typeof item === 'string' && !RESET_TARGET_PLUGIN_IDS.has(item);
      });
      if (nextAllow.length !== plugins.allow.length) {
        changed = true;
      }
      if (nextAllow.length > 0) {
        plugins.allow = nextAllow;
      } else {
        delete plugins.allow;
      }
    }

    if (isRecord(plugins.entries)) {
      const nextEntries = { ...plugins.entries };
      for (const pluginId of RESET_TARGET_PLUGIN_IDS) {
        if (Object.prototype.hasOwnProperty.call(nextEntries, pluginId)) {
          delete nextEntries[pluginId];
          changed = true;
        }
      }

      if (Object.keys(nextEntries).length > 0) {
        plugins.entries = nextEntries;
      } else {
        delete plugins.entries;
      }
    }

    if (plugins.enabled === true && !plugins.allow && !plugins.entries) {
      delete plugins.enabled;
      changed = true;
    }

    if (Object.keys(plugins).length > 0) {
      config.plugins = plugins;
    } else {
      delete config.plugins;
    }
  }

  return changed;
}

async function removeManagedChannelExtensionDirs(openClawConfigDir: string): Promise<string[]> {
  const removed: string[] = [];

  for (const dirName of RESET_TARGET_EXTENSION_DIRS) {
    const dirPath = join(openClawConfigDir, 'extensions', dirName);
    if (!(await pathExists(dirPath))) {
      continue;
    }

    await rm(dirPath, { recursive: true, force: true });
    removed.push(dirName);
  }

  return removed;
}

function createDefaultDeps(): ManagedChannelStartupResetDeps {
  return {
    appVersion: 'unknown',
    homeDir: homedir(),
    now: () => new Date(),
    clearWeixinStoredState,
    getManagedChannels: async () => {
      const stored = await getSetting('lawclawManagedChannels');
      if (!Array.isArray(stored)) {
        return [];
      }

      return Array.from(
        new Set(
          stored
            .map((item) => normalizeChannelId(item))
            .filter(Boolean)
        )
      );
    },
    setManagedChannels: async (channels: string[]) => {
      await setSetting('lawclawManagedChannels', channels);
    },
  };
}

export async function runManagedChannelStartupReset(
  overrides: Partial<ManagedChannelStartupResetDeps> = {}
): Promise<ManagedChannelStartupResetSummary> {
  const deps = {
    ...createDefaultDeps(),
    ...overrides,
  };
  const openClawConfigDir = join(deps.homeDir, '.openclaw');
  const configPath = join(openClawConfigDir, 'openclaw.json');
  const markerPath = join(deps.homeDir, '.LawClaw', 'migrations', RESET_MARKER_FILENAME);

  if (await pathExists(markerPath)) {
    return {
      status: 'skipped',
      reason: 'already-ran',
      configChanged: false,
      removedExtensionDirs: [],
      updatedManagedChannels: false,
      clearedWeixinState: false,
      markerPath,
    };
  }

  const config = await readOpenClawConfig(configPath);
  const configChanged = cleanupManagedChannelConfig(config);
  if (configChanged) {
    await writeOpenClawConfig(configPath, config);
  }

  await deps.clearWeixinStoredState();
  const removedExtensionDirs = await removeManagedChannelExtensionDirs(openClawConfigDir);

  const managedChannels = await deps.getManagedChannels();
  const nextManagedChannels = managedChannels.filter((channelId) => !RESET_TARGET_CHANNEL_IDS.has(channelId));
  const updatedManagedChannels = nextManagedChannels.length !== managedChannels.length;
  if (updatedManagedChannels) {
    await deps.setManagedChannels(nextManagedChannels);
  }

  await mkdir(dirname(markerPath), { recursive: true });
  await writeFile(
    markerPath,
    JSON.stringify(
      {
        version: 1,
        resetAt: deps.now().toISOString(),
        appVersion: deps.appVersion,
        resetChannels: Array.from(RESET_TARGET_CHANNEL_IDS),
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );

  return {
    status: 'applied',
    configChanged,
    removedExtensionDirs,
    updatedManagedChannels,
    clearedWeixinState: true,
    markerPath,
  };
}
