import { join } from 'path';
import { homedir } from 'os';
import { readJson5File, writeJsonFile } from './openclaw-json5';

type InternalAutomationConfig = {
  bootEnabled: boolean;
  heartbeatEnabled: boolean;
  heartbeatEvery: string;
};

const DEFAULT_HEARTBEAT_EVERY = '15m';
const BOOT_MD_HOOK_NAME = 'boot-md';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOpenClawConfigPath(): string {
  return join(homedir(), '.openclaw', 'openclaw.json');
}

function readConfig(): Record<string, unknown> {
  return readJson5File<Record<string, unknown>>(getOpenClawConfigPath(), {});
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

function readHeartbeatConfig(config: Record<string, unknown>): Record<string, unknown> {
  const agents = isRecord(config.agents) ? config.agents : {};
  const defaults = isRecord(agents.defaults) ? agents.defaults : {};
  return isRecord(defaults.heartbeat) ? defaults.heartbeat : {};
}

function readBootEnabled(config: Record<string, unknown>): boolean {
  const hooks = isRecord(config.hooks) ? config.hooks : {};
  const internal = isRecord(hooks.internal) ? hooks.internal : {};
  const entries = isRecord(internal.entries) ? internal.entries : {};
  const bootEntry = isRecord(entries[BOOT_MD_HOOK_NAME]) ? entries[BOOT_MD_HOOK_NAME] : null;

  if (bootEntry && typeof bootEntry.enabled === 'boolean') {
    return bootEntry.enabled;
  }

  // Backward compatibility for older invalid config written by LawClaw.
  const bundled = Array.isArray(internal.bundled)
    ? internal.bundled.filter((item): item is string => typeof item === 'string')
    : [];
  if (bundled.map((item) => item.trim()).includes(BOOT_MD_HOOK_NAME)) {
    return internal.enabled !== false;
  }

  return false;
}

export function getInternalAutomationConfig(): InternalAutomationConfig {
  const config = readConfig();
  const heartbeat = readHeartbeatConfig(config);
  const heartbeatEvery = normalizeHeartbeatEvery(heartbeat.every);

  return {
    bootEnabled: readBootEnabled(config),
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
  const entries = ensureNestedRecord(internal, 'entries');
  const bootEntry = ensureNestedRecord(entries, BOOT_MD_HOOK_NAME);
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

  internal.enabled = true;
  bootEntry.enabled = nextBootEnabled;
  heartbeat.every = nextHeartbeatEvery;

  if ('bundled' in internal) {
    delete internal.bundled;
  }

  writeJsonFile(getOpenClawConfigPath(), config);

  return {
    bootEnabled: nextBootEnabled,
    heartbeatEnabled: nextHeartbeatEvery !== '0m',
    heartbeatEvery: nextHeartbeatEvery,
  };
}
