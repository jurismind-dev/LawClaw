/**
 * OpenClaw auth/config helpers.
 * - Writes API keys into ~/.openclaw/agents/<id>/agent/auth-profiles.json
 * - Updates ~/.openclaw/openclaw.json default model/providers entries
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  getCanonicalProviderId,
  getProviderAliasIds,
  getProviderConfig,
  getProviderDefaultModel,
  getProviderEnvVar,
} from './provider-registry';
import { hasUtf8Bom, parseJsonText, stringifyJsonText } from './text-encoding';

const AUTH_STORE_VERSION = 1;
const AUTH_PROFILE_FILENAME = 'auth-profiles.json';
const JURISMIND_WEB_SEARCH_PROVIDER = 'doubao';
const LEGACY_JURISMIND_WEB_SEARCH_PROVIDER = 'perplexity';
const JURISMIND_WEB_SEARCH_MODEL = 'doubao';
const OPENCLAW_SAFE_PROVIDER_API_KEY_ENV_MARKERS = new Set([
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'MOONSHOT_API_KEY',
  'MINIMAX_API_KEY',
]);

interface AuthProfileEntry {
  type: 'api_key';
  provider: string;
  key: string;
}

interface OAuthProfileEntry {
  type: 'oauth';
  provider: string;
  access: string;
  refresh: string;
  expires: number;
}

interface AuthProfilesStore {
  version: number;
  profiles: Record<string, AuthProfileEntry | OAuthProfileEntry>;
  order?: Record<string, string[]>;
  lastGood?: Record<string, string>;
}

interface RuntimeProviderConfigOverride {
  baseUrl?: string;
  api?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  authHeader?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shouldPersistOpenClawApiKeyEnvMarker(apiKeyEnv?: string): boolean {
  const normalized = String(apiKeyEnv || '').trim();
  if (!normalized) {
    return false;
  }

  return OPENCLAW_SAFE_PROVIDER_API_KEY_ENV_MARKERS.has(normalized);
}

function applyOpenClawProviderApiKey(
  target: Record<string, unknown>,
  apiKeyEnv?: string
): void {
  delete target.apiKey;

  if (shouldPersistOpenClawApiKeyEnvMarker(apiKeyEnv)) {
    target.apiKey = String(apiKeyEnv).trim();
  }
}

function getAuthProfilesPath(agentId = 'main'): string {
  return join(homedir(), '.openclaw', 'agents', agentId, 'agent', AUTH_PROFILE_FILENAME);
}

function getOpenClawConfigPath(): string {
  return join(homedir(), '.openclaw', 'openclaw.json');
}

function readAuthProfiles(agentId = 'main'): AuthProfilesStore {
  const filePath = getAuthProfilesPath(agentId);

  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8');
      const data = parseJsonText(raw) as AuthProfilesStore;
      if (data.version && data.profiles && typeof data.profiles === 'object') {
        return data;
      }
    }
  } catch (error) {
    console.warn('Failed to read auth-profiles.json, creating fresh store:', error);
  }

  return {
    version: AUTH_STORE_VERSION,
    profiles: {},
  };
}

function writeAuthProfiles(store: AuthProfilesStore, agentId = 'main'): void {
  const filePath = getAuthProfilesPath(agentId);
  const dir = join(filePath, '..');

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, stringifyJsonText(store, { trailingNewline: false }), 'utf-8');
}

function readOpenClawConfig(): Record<string, unknown> {
  const configPath = getOpenClawConfigPath();

  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = parseJsonText(raw) as Record<string, unknown>;
      if (process.platform === 'win32' && !hasUtf8Bom(raw)) {
        writeFileSync(configPath, stringifyJsonText(parsed, { trailingNewline: false }), 'utf-8');
      }
      return parsed;
    }
  } catch (error) {
    console.warn('Failed to read openclaw.json, creating fresh config:', error);
  }

  return {};
}

function writeOpenClawConfig(config: Record<string, unknown>): void {
  const configPath = getOpenClawConfigPath();
  const dir = join(configPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, stringifyJsonText(config, { trailingNewline: false }), 'utf-8');
}

function upsertAuthProfile(store: AuthProfilesStore, providerId: string, apiKey: string): void {
  const profileId = `${providerId}:default`;

  store.profiles[profileId] = {
    type: 'api_key',
    provider: providerId,
    key: apiKey,
  };

  if (!store.order) {
    store.order = {};
  }
  if (!store.order[providerId]) {
    store.order[providerId] = [];
  }
  if (!store.order[providerId].includes(profileId)) {
    store.order[providerId].push(profileId);
  }

  if (!store.lastGood) {
    store.lastGood = {};
  }
  store.lastGood[providerId] = profileId;
}

function removeAuthProfile(store: AuthProfilesStore, providerId: string): boolean {
  const profileId = `${providerId}:default`;
  let changed = false;

  if (store.profiles[profileId]) {
    delete store.profiles[profileId];
    changed = true;
  }

  if (store.order?.[providerId]) {
    const nextOrder = store.order[providerId].filter((id) => id !== profileId);
    if (nextOrder.length > 0) {
      store.order[providerId] = nextOrder;
    } else {
      delete store.order[providerId];
    }
    changed = true;
  }

  if (store.lastGood?.[providerId] === profileId) {
    delete store.lastGood[providerId];
    changed = true;
  }

  return changed;
}

function getMappedDefaultModel(provider: string): string | undefined {
  const aliases = getProviderAliasIds(provider);
  for (const providerId of aliases) {
    const model = getProviderDefaultModel(providerId);
    if (model) {
      return model;
    }
  }
  return undefined;
}

function normalizeModelOverride(
  provider: string,
  canonicalProviderId: string,
  modelOverride?: string
): string | undefined {
  if (!modelOverride) {
    return undefined;
  }

  const raw = modelOverride.trim();
  if (!raw) {
    return undefined;
  }

  if (!raw.includes('/')) {
    return `${canonicalProviderId}/${raw}`;
  }

  const [providerPrefix, ...rest] = raw.split('/');
  if (rest.length === 0) {
    return `${canonicalProviderId}/${providerPrefix}`;
  }

  const resolvedPrefix = getCanonicalProviderId(providerPrefix);
  if (providerPrefix === provider || resolvedPrefix === canonicalProviderId) {
    return `${canonicalProviderId}/${rest.join('/')}`;
  }

  return raw;
}

function parseModelId(qualifiedModel: string, providerCandidates: string[]): string {
  for (const providerId of providerCandidates) {
    const prefix = `${providerId}/`;
    if (qualifiedModel.startsWith(prefix)) {
      return qualifiedModel.slice(prefix.length);
    }
  }
  return qualifiedModel;
}

function removeModelProviderEntries(
  config: Record<string, unknown>,
  providerIds: Iterable<string>
): boolean {
  const models = (config.models || {}) as Record<string, unknown>;
  const providers = (models.providers || {}) as Record<string, unknown>;

  let changed = false;
  for (const providerId of providerIds) {
    if (providers[providerId]) {
      delete providers[providerId];
      changed = true;
    }
  }

  if (!changed) {
    return false;
  }

  models.providers = providers;
  config.models = models;
  return true;
}

function ensureGatewayMode(config: Record<string, unknown>): void {
  const gateway = (config.gateway || {}) as Record<string, unknown>;
  if (!gateway.mode) {
    gateway.mode = 'local';
  }
  config.gateway = gateway;
}

function setAgentModelPrimary(config: Record<string, unknown>, agentId: string, model: string): void {
  const agents = isRecord(config.agents) ? { ...config.agents } : {};
  const list = Array.isArray(agents.list) ? [...agents.list] : [];

  const index = list.findIndex((item) => isRecord(item) && item.id === agentId);
  const agent =
    index >= 0 && isRecord(list[index])
      ? ({ ...(list[index] as Record<string, unknown>) } as Record<string, unknown>)
      : ({ id: agentId } as Record<string, unknown>);

  const agentModel = isRecord(agent.model) ? { ...agent.model } : {};
  agentModel.primary = model;
  agent.model = agentModel;

  if (index >= 0) {
    list[index] = agent;
  } else {
    list.push(agent);
  }

  agents.list = list;
  config.agents = agents;
}

export function getOpenClawAgentModelPrimary(agentId: string): string | undefined {
  const config = readOpenClawConfig();
  const agents = isRecord(config.agents) ? config.agents : {};
  const list = Array.isArray(agents.list) ? agents.list : [];
  const target = list.find((item) => isRecord(item) && item.id === agentId);
  if (!isRecord(target) || !isRecord(target.model)) {
    return undefined;
  }

  return typeof target.model.primary === 'string' ? target.model.primary : undefined;
}

/**
 * Save a provider API key to OpenClaw auth-profiles.
 * For aliased providers (moonshot_code_plan), key is always stored under the canonical ID.
 */
export function saveProviderKeyToOpenClaw(provider: string, apiKey: string, agentId = 'main'): void {
  const canonicalProviderId = getCanonicalProviderId(provider);
  const aliasIds = getProviderAliasIds(provider).filter((id) => id !== canonicalProviderId);

  const store = readAuthProfiles(agentId);
  upsertAuthProfile(store, canonicalProviderId, apiKey);

  // Cleanup legacy profile ids to avoid stale/forked keys.
  for (const alias of aliasIds) {
    removeAuthProfile(store, alias);
  }

  writeAuthProfiles(store, agentId);
  console.log(
    `Saved API key for provider "${provider}" as canonical "${canonicalProviderId}" (agent: ${agentId})`
  );
}

/** Remove provider API key(s) from OpenClaw auth-profiles. */
export function removeProviderKeyFromOpenClaw(provider: string, agentId = 'main'): void {
  const aliasIds = getProviderAliasIds(provider);
  const store = readAuthProfiles(agentId);

  let changed = false;
  for (const providerId of aliasIds) {
    changed = removeAuthProfile(store, providerId) || changed;
  }

  if (changed) {
    writeAuthProfiles(store, agentId);
  }

  console.log(
    `Removed API key profiles for provider aliases [${aliasIds.join(', ')}] (agent: ${agentId})`
  );
}

/**
 * Remove only non-canonical legacy profiles for an aliased provider mapping.
 * Example: moonshot_code_plan -> remove moonshot_code_plan:default, keep kimi-coding:default.
 */
export function cleanupLegacyProviderProfiles(provider: string, agentId = 'main'): boolean {
  const canonicalProviderId = getCanonicalProviderId(provider);
  const legacyAliases = getProviderAliasIds(provider).filter((id) => id !== canonicalProviderId);
  if (legacyAliases.length === 0) {
    return false;
  }

  const store = readAuthProfiles(agentId);
  let changed = false;
  for (const providerId of legacyAliases) {
    changed = removeAuthProfile(store, providerId) || changed;
  }

  if (changed) {
    writeAuthProfiles(store, agentId);
    console.log(
      `Cleaned legacy auth profiles for provider "${provider}" -> [${legacyAliases.join(', ')}]`
    );
  }

  return changed;
}

/** Build environment variables object with all stored API keys for Gateway startup. */
export function buildProviderEnvVars(
  providers: Array<{ type: string; apiKey: string }>
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const { type, apiKey } of providers) {
    const envVar = getProviderEnvVar(type);
    if (envVar && apiKey) {
      env[envVar] = apiKey;
    }
  }

  return env;
}

/**
 * Remove stale models.providers entries from ~/.openclaw/openclaw.json.
 * Returns true when at least one entry was removed.
 */
export function cleanupOpenClawProviderEntries(providerIds: string | string[]): boolean {
  const requested = Array.isArray(providerIds) ? providerIds : [providerIds];
  const allAliases = new Set<string>();
  for (const providerId of requested) {
    for (const alias of getProviderAliasIds(providerId)) {
      allAliases.add(alias);
    }
  }

  const config = readOpenClawConfig();
  const changed = removeModelProviderEntries(config, allAliases);
  if (changed) {
    writeOpenClawConfig(config);
    console.log(`Removed stale OpenClaw provider entries: ${Array.from(allAliases).join(', ')}`);
  }
  return changed;
}

/**
 * Update ~/.openclaw/openclaw.json default model and (if needed) models.providers entry.
 */
export function setOpenClawDefaultModel(provider: string, modelOverride?: string): void {
  const canonicalProviderId = getCanonicalProviderId(provider);
  const aliasIds = getProviderAliasIds(provider);

  // moonshot_code_plan is always pinned to official kimi-coding/k2p5.
  const forcedKimiCodingDefault = provider === 'moonshot_code_plan';
  const normalizedOverride = forcedKimiCodingDefault
    ? undefined
    : normalizeModelOverride(provider, canonicalProviderId, modelOverride);

  const model = normalizedOverride || getMappedDefaultModel(provider);
  if (!model) {
    console.warn(`No default model mapping for provider "${provider}"`);
    return;
  }

  const config = readOpenClawConfig();

  const agents = (config.agents || {}) as Record<string, unknown>;
  const defaults = (agents.defaults || {}) as Record<string, unknown>;
  defaults.model = { primary: model };
  agents.defaults = defaults;
  config.agents = agents;

  const modelId = parseModelId(model, [canonicalProviderId, ...aliasIds]);
  const providerCfg = getProviderConfig(provider) || getProviderConfig(canonicalProviderId);

  if (providerCfg) {
    const models = (config.models || {}) as Record<string, unknown>;
    const providers = (models.providers || {}) as Record<string, unknown>;

    const existingProvider =
      providers[canonicalProviderId] && typeof providers[canonicalProviderId] === 'object'
        ? (providers[canonicalProviderId] as Record<string, unknown>)
        : {};

    const existingModels = Array.isArray(existingProvider.models)
      ? (existingProvider.models as Array<Record<string, unknown>>)
      : [];
    const registryModels = (providerCfg.models ?? []).map((m) => ({ ...m })) as Array<
      Record<string, unknown>
    >;

    const mergedModels = [...registryModels];
    for (const item of existingModels) {
      const id = typeof item?.id === 'string' ? item.id : '';
      if (id && !mergedModels.some((m) => m.id === id)) {
        mergedModels.push(item);
      }
    }
    if (modelId && !mergedModels.some((m) => m.id === modelId)) {
      mergedModels.push({ id: modelId, name: modelId });
    }

    const nextProvider: Record<string, unknown> = {
      ...existingProvider,
      baseUrl: providerCfg.baseUrl,
      api: providerCfg.api,
      models: mergedModels,
    };
    applyOpenClawProviderApiKey(nextProvider, providerCfg.apiKeyEnv);
    providers[canonicalProviderId] = nextProvider;

    // Remove stale alias entries when canonical id differs.
    for (const alias of aliasIds) {
      if (alias !== canonicalProviderId && providers[alias]) {
        delete providers[alias];
      }
    }

    models.providers = providers;
    config.models = models;
  } else {
    removeModelProviderEntries(config, aliasIds);
  }

  ensureGatewayMode(config);
  writeOpenClawConfig(config);
  console.log(
    `Set OpenClaw default model to "${model}" for provider "${provider}" (canonical: ${canonicalProviderId})`
  );
}

/**
 * Update OpenClaw model + provider config using runtime config values.
 * Useful for runtime providers such as custom/ollama.
 */
export function setOpenClawDefaultModelWithOverride(
  provider: string,
  modelOverride: string | undefined,
  override: RuntimeProviderConfigOverride
): void {
  const canonicalProviderId = getCanonicalProviderId(provider);
  const aliasIds = getProviderAliasIds(provider);

  const model =
    normalizeModelOverride(provider, canonicalProviderId, modelOverride) || getMappedDefaultModel(provider);
  if (!model) {
    console.warn(`No default model mapping for provider "${provider}"`);
    return;
  }

  const config = readOpenClawConfig();

  const modelId = parseModelId(model, [canonicalProviderId, ...aliasIds]);
  const agents = (config.agents || {}) as Record<string, unknown>;
  const defaults = (agents.defaults || {}) as Record<string, unknown>;
  defaults.model = { primary: model };
  agents.defaults = defaults;
  config.agents = agents;

  if (override.baseUrl && override.api) {
    const models = (config.models || {}) as Record<string, unknown>;
    const providers = (models.providers || {}) as Record<string, unknown>;

    const existingProvider =
      providers[canonicalProviderId] && typeof providers[canonicalProviderId] === 'object'
        ? (providers[canonicalProviderId] as Record<string, unknown>)
        : {};

    const existingModels = Array.isArray(existingProvider.models)
      ? (existingProvider.models as Array<Record<string, unknown>>)
      : [];
    const mergedModels = [...existingModels];
    if (modelId && !mergedModels.some((m) => m.id === modelId)) {
      mergedModels.push({ id: modelId, name: modelId });
    }

    const nextProvider: Record<string, unknown> = {
      ...existingProvider,
      baseUrl: override.baseUrl,
      api: override.api,
      models: mergedModels,
    };
    applyOpenClawProviderApiKey(nextProvider, override.apiKeyEnv);
    if (override.headers && Object.keys(override.headers).length > 0) {
      nextProvider.headers = override.headers;
    }
    if (override.authHeader !== undefined) {
      nextProvider.authHeader = override.authHeader;
    }

    providers[canonicalProviderId] = nextProvider;
    for (const alias of aliasIds) {
      if (alias !== canonicalProviderId && providers[alias]) {
        delete providers[alias];
      }
    }

    models.providers = providers;
    config.models = models;
  }

  ensureGatewayMode(config);
  writeOpenClawConfig(config);
  console.log(
    `Set OpenClaw default model to "${model}" for provider "${provider}" (runtime override, canonical: ${canonicalProviderId})`
  );
}

/**
 * Update ~/.openclaw/openclaw.json model for a specific agent and (if needed)
 * models.providers entry.
 */
export function setOpenClawAgentModel(agentId: string, provider: string, modelOverride?: string): void {
  const canonicalProviderId = getCanonicalProviderId(provider);
  const aliasIds = getProviderAliasIds(provider);

  // moonshot_code_plan is always pinned to official kimi-coding/k2p5.
  const forcedKimiCodingDefault = provider === 'moonshot_code_plan';
  const normalizedOverride = forcedKimiCodingDefault
    ? undefined
    : normalizeModelOverride(provider, canonicalProviderId, modelOverride);

  const model = normalizedOverride || getMappedDefaultModel(provider);
  if (!model) {
    console.warn(`No default model mapping for provider "${provider}"`);
    return;
  }

  const config = readOpenClawConfig();
  setAgentModelPrimary(config, agentId, model);

  const modelId = parseModelId(model, [canonicalProviderId, ...aliasIds]);
  const providerCfg = getProviderConfig(provider) || getProviderConfig(canonicalProviderId);

  if (providerCfg) {
    const models = (config.models || {}) as Record<string, unknown>;
    const providers = (models.providers || {}) as Record<string, unknown>;

    const existingProvider =
      providers[canonicalProviderId] && typeof providers[canonicalProviderId] === 'object'
        ? (providers[canonicalProviderId] as Record<string, unknown>)
        : {};

    const existingModels = Array.isArray(existingProvider.models)
      ? (existingProvider.models as Array<Record<string, unknown>>)
      : [];
    const registryModels = (providerCfg.models ?? []).map((m) => ({ ...m })) as Array<
      Record<string, unknown>
    >;

    const mergedModels = [...registryModels];
    for (const item of existingModels) {
      const id = typeof item?.id === 'string' ? item.id : '';
      if (id && !mergedModels.some((m) => m.id === id)) {
        mergedModels.push(item);
      }
    }
    if (modelId && !mergedModels.some((m) => m.id === modelId)) {
      mergedModels.push({ id: modelId, name: modelId });
    }

    const nextProvider: Record<string, unknown> = {
      ...existingProvider,
      baseUrl: providerCfg.baseUrl,
      api: providerCfg.api,
      models: mergedModels,
    };
    applyOpenClawProviderApiKey(nextProvider, providerCfg.apiKeyEnv);
    providers[canonicalProviderId] = nextProvider;

    // Remove stale alias entries when canonical id differs.
    for (const alias of aliasIds) {
      if (alias !== canonicalProviderId && providers[alias]) {
        delete providers[alias];
      }
    }

    models.providers = providers;
    config.models = models;
  } else {
    removeModelProviderEntries(config, aliasIds);
  }

  ensureGatewayMode(config);
  writeOpenClawConfig(config);
  console.log(
    `Set OpenClaw model to "${model}" for agent "${agentId}" via provider "${provider}" (canonical: ${canonicalProviderId})`
  );
}

/**
 * Update a specific agent model + provider config using runtime config values.
 * Useful for runtime providers such as custom/ollama.
 */
export function setOpenClawAgentModelWithOverride(
  agentId: string,
  provider: string,
  modelOverride: string | undefined,
  override: RuntimeProviderConfigOverride
): void {
  const canonicalProviderId = getCanonicalProviderId(provider);
  const aliasIds = getProviderAliasIds(provider);

  const model =
    normalizeModelOverride(provider, canonicalProviderId, modelOverride) || getMappedDefaultModel(provider);
  if (!model) {
    console.warn(`No default model mapping for provider "${provider}"`);
    return;
  }

  const config = readOpenClawConfig();
  setAgentModelPrimary(config, agentId, model);

  const modelId = parseModelId(model, [canonicalProviderId, ...aliasIds]);

  if (override.baseUrl && override.api) {
    const models = (config.models || {}) as Record<string, unknown>;
    const providers = (models.providers || {}) as Record<string, unknown>;

    const existingProvider =
      providers[canonicalProviderId] && typeof providers[canonicalProviderId] === 'object'
        ? (providers[canonicalProviderId] as Record<string, unknown>)
        : {};

    const existingModels = Array.isArray(existingProvider.models)
      ? (existingProvider.models as Array<Record<string, unknown>>)
      : [];
    const mergedModels = [...existingModels];
    if (modelId && !mergedModels.some((m) => m.id === modelId)) {
      mergedModels.push({ id: modelId, name: modelId });
    }

    const nextProvider: Record<string, unknown> = {
      ...existingProvider,
      baseUrl: override.baseUrl,
      api: override.api,
      models: mergedModels,
    };
    applyOpenClawProviderApiKey(nextProvider, override.apiKeyEnv);
    if (override.headers && Object.keys(override.headers).length > 0) {
      nextProvider.headers = override.headers;
    }
    if (override.authHeader !== undefined) {
      nextProvider.authHeader = override.authHeader;
    }

    providers[canonicalProviderId] = nextProvider;
    for (const alias of aliasIds) {
      if (alias !== canonicalProviderId && providers[alias]) {
        delete providers[alias];
      }
    }

    models.providers = providers;
    config.models = models;
  }

  ensureGatewayMode(config);
  writeOpenClawConfig(config);
  console.log(
    `Set OpenClaw model to "${model}" for agent "${agentId}" via provider "${provider}" (runtime override, canonical: ${canonicalProviderId})`
  );
}

/**
 * Remove model.primary from a specific agent without touching agents.defaults.model.
 */
export function clearOpenClawAgentModelPrimary(agentId: string): void {
  const config = readOpenClawConfig();
  const agents = isRecord(config.agents) ? { ...config.agents } : {};
  const list = Array.isArray(agents.list) ? [...agents.list] : [];
  const index = list.findIndex((item) => isRecord(item) && item.id === agentId);

  if (index < 0 || !isRecord(list[index])) {
    return;
  }

  const agent = { ...(list[index] as Record<string, unknown>) };
  if (!isRecord(agent.model)) {
    return;
  }

  const model = { ...(agent.model as Record<string, unknown>) };
  if (!Object.prototype.hasOwnProperty.call(model, 'primary')) {
    return;
  }

  delete model.primary;
  if (Object.keys(model).length > 0) {
    agent.model = model;
  } else {
    delete agent.model;
  }

  list[index] = agent;
  agents.list = list;
  config.agents = agents;
  writeOpenClawConfig(config);
  console.log(`Cleared OpenClaw model.primary for agent "${agentId}"`);
}

function discoverAgentIds(): string[] {
  const agentsDir = join(homedir(), '.openclaw', 'agents');
  try {
    if (!existsSync(agentsDir)) return ['main'];
    const ids = readdirSync(agentsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(agentsDir, entry.name, 'agent')))
      .map((entry) => entry.name);
    return ids.length > 0 ? ids : ['main'];
  } catch {
    return ['main'];
  }
}

/**
 * Save OAuth tokens to OpenClaw auth-profiles for one/all agents.
 */
export async function saveOAuthTokenToOpenClaw(
  provider: string,
  token: { access: string; refresh: string; expires: number },
  agentId?: string
): Promise<void> {
  const agentIds = agentId ? [agentId] : discoverAgentIds();
  const canonicalProviderId = getCanonicalProviderId(provider);
  const aliasIds = getProviderAliasIds(provider).filter((id) => id !== canonicalProviderId);

  for (const id of agentIds) {
    const store = readAuthProfiles(id);
    const profileId = `${canonicalProviderId}:default`;
    store.profiles[profileId] = {
      type: 'oauth',
      provider: canonicalProviderId,
      access: token.access,
      refresh: token.refresh,
      expires: token.expires,
    };

    if (!store.order) store.order = {};
    if (!store.order[canonicalProviderId]) store.order[canonicalProviderId] = [];
    if (!store.order[canonicalProviderId].includes(profileId)) {
      store.order[canonicalProviderId].push(profileId);
    }

    if (!store.lastGood) store.lastGood = {};
    store.lastGood[canonicalProviderId] = profileId;

    // Cleanup legacy alias profile ids to avoid stale/forked tokens.
    for (const alias of aliasIds) {
      removeAuthProfile(store, alias);
    }

    writeAuthProfiles(store, id);
  }
}

/**
 * Read OAuth access token from OpenClaw auth-profiles.
 */
export async function getOAuthTokenFromOpenClaw(
  provider: string,
  agentId = 'main'
): Promise<string | null> {
  const canonicalProviderId = getCanonicalProviderId(provider);
  const store = readAuthProfiles(agentId);
  const profileId = `${canonicalProviderId}:default`;
  const profile = store.profiles[profileId];
  if (profile && profile.type === 'oauth') {
    return profile.access;
  }
  return null;
}

/**
 * Remove provider-related auth and config entries from OpenClaw.
 */
export async function removeProviderFromOpenClaw(provider: string): Promise<void> {
  const aliasIds = getProviderAliasIds(provider);

  for (const agentId of discoverAgentIds()) {
    removeProviderKeyFromOpenClaw(provider, agentId);
  }

  const config = readOpenClawConfig();
  removeModelProviderEntries(config, aliasIds);
  const plugins = isRecord(config.plugins) ? { ...config.plugins } : {};
  const entries = isRecord(plugins.entries) ? { ...plugins.entries } : {};
  let pluginChanged = false;
  for (const alias of aliasIds) {
    const pluginId = `${alias}-auth`;
    if (entries[pluginId]) {
      delete entries[pluginId];
      pluginChanged = true;
    }
  }
  if (pluginChanged) {
    plugins.entries = entries;
    config.plugins = plugins;
  }
  writeOpenClawConfig(config);
}

/**
 * Sync provider config into openclaw.json without changing default model.
 */
export async function syncProviderConfigToOpenClaw(
  provider: string,
  modelId: string | undefined,
  override: RuntimeProviderConfigOverride
): Promise<void> {
  const config = readOpenClawConfig();
  const providersRoot = isRecord(config.models) ? { ...config.models } : {};
  const providers = isRecord(providersRoot.providers) ? { ...providersRoot.providers } : {};

  if (override.baseUrl && override.api) {
    const nextModels: Array<Record<string, unknown>> = [];
    if (modelId) {
      nextModels.push({ id: modelId, name: modelId });
    }

    const nextProvider: Record<string, unknown> = {
      baseUrl: override.baseUrl,
      api: override.api,
      models: nextModels,
    };
    applyOpenClawProviderApiKey(nextProvider, override.apiKeyEnv);
    if (override.headers && Object.keys(override.headers).length > 0) {
      nextProvider.headers = override.headers;
    }
    if (override.authHeader !== undefined) {
      nextProvider.authHeader = override.authHeader;
    }

    providers[provider] = nextProvider;
    providersRoot.providers = providers;
    config.models = providersRoot;
  }

  if (provider === 'minimax-portal' || provider === 'qwen-portal') {
    const plugins = isRecord(config.plugins) ? { ...config.plugins } : {};
    const entries = isRecord(plugins.entries) ? { ...plugins.entries } : {};
    entries[`${provider}-auth`] = { enabled: true };
    plugins.entries = entries;
    config.plugins = plugins;
  }

  writeOpenClawConfig(config);
}

/**
 * Read currently active providers from openclaw.json.
 */
export async function getActiveOpenClawProviders(): Promise<Set<string>> {
  const activeProviders = new Set<string>();
  const config = readOpenClawConfig();

  const models = isRecord(config.models) ? config.models : {};
  const providers = isRecord(models.providers) ? models.providers : {};
  for (const key of Object.keys(providers)) {
    activeProviders.add(key);
  }

  const plugins = isRecord(config.plugins) ? config.plugins : {};
  const entries = isRecord(plugins.entries) ? plugins.entries : {};
  for (const [pluginId, meta] of Object.entries(entries)) {
    if (pluginId.endsWith('-auth') && isRecord(meta) && meta.enabled) {
      activeProviders.add(pluginId.replace(/-auth$/, ''));
    }
  }

  return activeProviders;
}

/**
 * Sync gateway token into openclaw.json so non-dev mode can authenticate.
 */
export async function syncGatewayTokenToConfig(token: string): Promise<void> {
  const config = readOpenClawConfig();
  const gateway = isRecord(config.gateway) ? { ...config.gateway } : {};
  const auth = isRecord(gateway.auth) ? { ...gateway.auth } : {};

  auth.mode = 'token';
  auth.token = token;
  gateway.auth = auth;
  if (!gateway.mode) gateway.mode = 'local';
  config.gateway = gateway;

  writeOpenClawConfig(config);
}

/**
 * Ensure browser automation defaults exist in openclaw.json.
 */
export async function syncBrowserConfigToOpenClaw(): Promise<void> {
  const config = readOpenClawConfig();
  const browser = isRecord(config.browser) ? { ...config.browser } : {};
  let changed = false;

  if (browser.enabled === undefined) {
    browser.enabled = true;
    changed = true;
  }
  if (browser.defaultProfile === undefined) {
    browser.defaultProfile = 'openclaw';
    changed = true;
  }
  if (!changed) return;

  config.browser = browser;
  writeOpenClawConfig(config);
}

function resolveJurismindWebSearchBaseUrl(): string {
  return getProviderConfig('jurismind')?.baseUrl || 'http://101.132.245.215:3001/v1';
}

function isManagedJurismindWebSearchConfig(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const model = typeof value.model === 'string' ? value.model.trim() : '';
  const baseUrl =
    typeof value.baseUrl === 'string' ? value.baseUrl.trim().replace(/\/+$/, '') : '';

  return model === JURISMIND_WEB_SEARCH_MODEL && baseUrl === resolveJurismindWebSearchBaseUrl();
}

/**
 * Sync LawClaw-managed Doubao web search config into openclaw.json.
 * LawClaw patches the bundled OpenClaw runtime to add a native doubao
 * web_search provider backed by the Jurismind Responses API endpoint.
 */
export function syncJurismindWebSearchConfig(apiKey: string): void {
  const trimmedKey = String(apiKey || '').trim();
  if (!trimmedKey) {
    return;
  }

  const config = readOpenClawConfig();
  const tools = isRecord(config.tools) ? { ...config.tools } : {};
  const web = isRecord(tools.web) ? { ...tools.web } : {};
  const search = isRecord(web.search) ? { ...web.search } : {};
  const transportConfig = isRecord(search[JURISMIND_WEB_SEARCH_PROVIDER])
    ? { ...(search[JURISMIND_WEB_SEARCH_PROVIDER] as Record<string, unknown>) }
    : {};

  transportConfig.apiKey = trimmedKey;
  transportConfig.baseUrl = resolveJurismindWebSearchBaseUrl();
  transportConfig.model = JURISMIND_WEB_SEARCH_MODEL;

  const legacyTransportConfig = search[LEGACY_JURISMIND_WEB_SEARCH_PROVIDER];
  if (isManagedJurismindWebSearchConfig(legacyTransportConfig)) {
    delete search[LEGACY_JURISMIND_WEB_SEARCH_PROVIDER];
  }

  search.enabled = true;
  search.provider = JURISMIND_WEB_SEARCH_PROVIDER;
  search[JURISMIND_WEB_SEARCH_PROVIDER] = transportConfig;
  web.search = search;
  tools.web = web;
  config.tools = tools;

  writeOpenClawConfig(config);
  console.log('Synced Jurismind-backed Doubao web search config to OpenClaw');
}

/**
 * Clear LawClaw-managed Doubao web search config from openclaw.json.
 * When the managed transport was the active provider, disable search so
 * OpenClaw does not fall back to an unintended provider.
 */
export function clearJurismindWebSearchConfig(): boolean {
  const config = readOpenClawConfig();
  const tools = isRecord(config.tools) ? { ...config.tools } : {};
  const web = isRecord(tools.web) ? { ...tools.web } : {};
  const search = isRecord(web.search) ? { ...web.search } : {};
  const currentProvider = typeof search.provider === 'string' ? search.provider : '';
  const existingTransportConfig = search[JURISMIND_WEB_SEARCH_PROVIDER];
  const hasManagedConfig = isManagedJurismindWebSearchConfig(existingTransportConfig);
  const legacyTransportConfig = search[LEGACY_JURISMIND_WEB_SEARCH_PROVIDER];
  const hasManagedLegacyConfig = isManagedJurismindWebSearchConfig(legacyTransportConfig);
  const hasDifferentConfiguredProvider =
    currentProvider.length > 0
    && currentProvider !== JURISMIND_WEB_SEARCH_PROVIDER
    && currentProvider !== LEGACY_JURISMIND_WEB_SEARCH_PROVIDER;

  let changed = false;

  if (hasManagedConfig) {
    const nextTransportConfig = isRecord(existingTransportConfig)
      ? { ...existingTransportConfig }
      : {};

    delete nextTransportConfig.apiKey;
    delete nextTransportConfig.baseUrl;
    delete nextTransportConfig.model;

    if (Object.keys(nextTransportConfig).length > 0) {
      search[JURISMIND_WEB_SEARCH_PROVIDER] = nextTransportConfig;
    } else {
      delete search[JURISMIND_WEB_SEARCH_PROVIDER];
    }
    changed = true;
  }

  if (hasManagedLegacyConfig) {
    const nextLegacyTransportConfig = isRecord(legacyTransportConfig)
      ? { ...legacyTransportConfig }
      : {};

    delete nextLegacyTransportConfig.apiKey;
    delete nextLegacyTransportConfig.baseUrl;
    delete nextLegacyTransportConfig.model;

    if (Object.keys(nextLegacyTransportConfig).length > 0) {
      search[LEGACY_JURISMIND_WEB_SEARCH_PROVIDER] = nextLegacyTransportConfig;
    } else {
      delete search[LEGACY_JURISMIND_WEB_SEARCH_PROVIDER];
    }
    changed = true;
  }

  if (!hasDifferentConfiguredProvider && (hasManagedConfig || hasManagedLegacyConfig || currentProvider.length > 0)) {
    delete search.provider;
    search.enabled = false;
    changed = true;
  }

  if (!changed) {
    return false;
  }

  web.search = search;
  tools.web = web;
  config.tools = tools;
  writeOpenClawConfig(config);
  console.log('Cleared Jurismind-backed Doubao web search config from OpenClaw');
  return true;
}

/**
 * Update provider entries in all discovered agents' models.json files.
 */
export async function updateAgentModelProvider(
  providerType: string,
  entry: {
    baseUrl?: string;
    api?: string;
    models?: Array<{ id: string; name: string }>;
    apiKey?: string;
    authHeader?: boolean;
  }
): Promise<void> {
  for (const agentId of discoverAgentIds()) {
    const modelsPath = join(homedir(), '.openclaw', 'agents', agentId, 'agent', 'models.json');
    let data: Record<string, unknown> = {};

    try {
      if (existsSync(modelsPath)) {
        data = JSON.parse(readFileSync(modelsPath, 'utf-8')) as Record<string, unknown>;
      }
    } catch {
      data = {};
    }

    const providers = isRecord(data.providers) ? { ...data.providers } : {};
    const existing = isRecord(providers[providerType]) ? { ...providers[providerType] } : {};
    const existingModels = Array.isArray(existing.models)
      ? (existing.models as Array<Record<string, unknown>>)
      : [];

    const mergedModels = (entry.models ?? []).map((item) => {
      const prev = existingModels.find((oldItem) => oldItem.id === item.id);
      return prev ? { ...prev, id: item.id, name: item.name } : { ...item };
    });

    if (entry.baseUrl !== undefined) existing.baseUrl = entry.baseUrl;
    if (entry.api !== undefined) existing.api = entry.api;
    if (mergedModels.length > 0) existing.models = mergedModels;
    if (entry.apiKey !== undefined) existing.apiKey = entry.apiKey;
    if (entry.authHeader !== undefined) existing.authHeader = entry.authHeader;

    providers[providerType] = existing;
    data.providers = providers;

    writeFileSync(modelsPath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

// Re-export for backwards compatibility.
export { getProviderEnvVar } from './provider-registry';
