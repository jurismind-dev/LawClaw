import { join } from 'path';
import { homedir } from 'os';
import { readJson5File, writeJsonFile } from './openclaw-json5';

type InternalHooksConfig = {
  enabled?: boolean;
  bundled?: string[];
};

type InternalAutomationConfig = {
  bootEnabled: boolean;
  heartbeatEnabled: boolean;
  heartbeatEvery: string;
};

const DEFAULT_HEARTBEAT_EVERY = '15m';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOpenClawConfigPath(): string {
  return join(homedir(), '.openclaw', 'openclaw.json');
}

function readConfig(): Record<string, unknown> {
  return readJson5File<Record<string, unknown>>(getOpenClawConfigPath(), {});
}

function readInternalHooksConfig(config: Record<string, unknown>): InternalHooksConfig {
  const hooks = isRecord(config.hooks) ? config.hooks : {};
  const internal = isRecord(hooks.internal) ? hooks.internal : {};
  const bundled = Array.isArray(internal.bundled)
    ? internal.bundled.filter((item): item is string => typeof item === 'string')
    : undefined;

  return {
    enabled: typeof internal.enabled === 'boolean' ? internal.enabled : undefined,
    bundled,
  };
}

function readHeartbeatConfig(config: Record<string, unknown>): Record<string, unknown> {
  const agents = isRecord(config.agents) ? config.agents : {};
  const defaults = isRecord(agents.defaults) ? agents.defaults : {};
  return isRecord(defaults.heartbeat) ? defaults.heartbeat : {};
}

function ensureNestedRecord(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = isRecord(root[key]) ? { ...(root[key] as Record<string, unknown>) } : {};
  root[key] = current;
  return current;
}

function normalizeHeartbeatEvery(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_HEARTBEAT_EVERY;
  }

  const trimmed = value.trim();
  return trimmed || DEFAULT_HEARTBEAT_EVERY;
}

export function getInternalAutomationConfig(): InternalAutomationConfig {
  const config = readConfig();
  const internalHooks = readInternalHooksConfig(config);
  const heartbeat = readHeartbeatConfig(config);
  const bundled = new Set((internalHooks.bundled ?? ['boot-md']).map((item) => item.trim()).filter(Boolean));
  const heartbeatEvery = normalizeHeartbeatEvery(heartbeat.every);

  return {
    bootEnabled: (internalHooks.enabled ?? true) && bundled.has('boot-md'),
    heartbeatEnabled: heartbeatEvery !== '0m',
    heartbeatEvery,
  };
}

export function setInternalAutomationConfig(
  updates: Partial<Pick<InternalAutomationConfig, 'bootEnabled' | 'heartbeatEnabled'>>,
): InternalAutomationConfig {
  const config = readConfig();
  const hooks = ensureNestedRecord(config, 'hooks');
  const internal = ensureNestedRecord(hooks, 'internal');
  const agents = ensureNestedRecord(config, 'agents');
  const defaults = ensureNestedRecord(agents, 'defaults');
  const heartbeat = ensureNestedRecord(defaults, 'heartbeat');

  const current = getInternalAutomationConfig();
  const nextBootEnabled = updates.bootEnabled ?? current.bootEnabled;
  const nextHeartbeatEnabled = updates.heartbeatEnabled ?? current.heartbeatEnabled;
  const currentHeartbeatEvery = normalizeHeartbeatEvery(heartbeat.every);
  const nextHeartbeatEvery =
    nextHeartbeatEnabled
      ? (currentHeartbeatEvery === '0m' ? DEFAULT_HEARTBEAT_EVERY : currentHeartbeatEvery)
      : '0m';

  const existingBundled = Array.isArray(internal.bundled)
    ? internal.bundled.filter((item): item is string => typeof item === 'string')
    : ['boot-md'];
  const bundled = new Set(existingBundled.map((item) => item.trim()).filter(Boolean));

  if (nextBootEnabled) {
    bundled.add('boot-md');
  } else {
    bundled.delete('boot-md');
  }

  internal.enabled = bundled.size > 0;
  internal.bundled = Array.from(bundled);

  heartbeat.every = nextHeartbeatEvery;

  writeJsonFile(getOpenClawConfigPath(), config);

  return {
    bootEnabled: Boolean(internal.enabled) && bundled.has('boot-md'),
    heartbeatEnabled: nextHeartbeatEvery !== '0m',
    heartbeatEvery: normalizeHeartbeatEvery(heartbeat.every),
  };
}
