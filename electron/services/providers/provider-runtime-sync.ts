import type { ProviderConfig } from '../../utils/secure-storage';
import { getAllProviders, getApiKey } from '../../utils/secure-storage';
import { listAgentsSnapshot } from '../../utils/agent-config';
import {
  removeProviderFromOpenClaw,
  removeProviderKeyFromOpenClaw,
  saveProviderKeyToOpenClaw,
  syncProviderAuthProfileToOpenClawAgents,
  syncProviderConfigToOpenClaw,
  updateAgentModelProvider,
  updateSingleAgentModelProvider,
} from '../../utils/openclaw-auth';
import { getProviderConfig } from '../../utils/provider-registry';
import { logger } from '../../utils/logger';

function isUnregisteredProviderType(type: string): boolean {
  return type === 'custom' || type === 'ollama';
}

export function getOpenClawProviderKey(type: string, providerId: string): string {
  if (isUnregisteredProviderType(type)) {
    const prefix = `${type}-`;
    if (providerId.startsWith(prefix)) {
      const tail = providerId.slice(prefix.length);
      if (tail.length === 8 && !tail.includes('-')) {
        return providerId;
      }
    }

    const suffix = providerId.replace(/-/g, '').slice(0, 8);
    return `${type}-${suffix}`;
  }

  if (type === 'minimax-portal-cn') {
    return 'minimax-portal';
  }

  return type;
}

function normalizeProviderBaseUrl(config: ProviderConfig, baseUrl?: string): string | undefined {
  if (!baseUrl) {
    return undefined;
  }

  const normalized = baseUrl.trim().replace(/\/+$/, '');

  if (config.type === 'minimax-portal' || config.type === 'minimax-portal-cn') {
    return normalized.replace(/\/v1$/, '').replace(/\/anthropic$/, '').replace(/\/$/, '') + '/anthropic';
  }

  if (isUnregisteredProviderType(config.type)) {
    return normalized.replace(/\/chat\/completions$/i, '');
  }

  return normalized;
}

function parseModelRef(modelRef: string): { providerKey: string; modelId: string } | null {
  const trimmed = modelRef.trim();
  const separatorIndex = trimmed.indexOf('/');
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return null;
  }

  return {
    providerKey: trimmed.slice(0, separatorIndex),
    modelId: trimmed.slice(separatorIndex + 1),
  };
}

async function listRuntimeAgentIds(): Promise<string[]> {
  const ids = new Set<string>(['main']);

  try {
    const snapshot = await listAgentsSnapshot();
    for (const agent of snapshot.agents) {
      const agentId = String(agent.id || '').trim();
      if (agentId) {
        ids.add(agentId);
      }
    }
  } catch (error) {
    logger.warn('[provider-runtime] Failed to enumerate configured agents for runtime sync:', error);
  }

  return Array.from(ids);
}

async function resolveStoredApiKey(
  config: ProviderConfig,
  apiKey: string | undefined,
): Promise<string | undefined> {
  if (apiKey !== undefined) {
    const trimmed = apiKey.trim();
    return trimmed || undefined;
  }

  const stored = await getApiKey(config.id);
  return stored || undefined;
}

async function syncProviderSecretToRuntime(
  config: ProviderConfig,
  apiKey: string | undefined,
): Promise<void> {
  const resolvedKey = await resolveStoredApiKey(config, apiKey);
  const agentIds = await listRuntimeAgentIds();

  if (!resolvedKey) {
    syncProviderAuthProfileToOpenClawAgents(getOpenClawProviderKey(config.type, config.id), agentIds);
    return;
  }

  const runtimeProviderKey = getOpenClawProviderKey(config.type, config.id);

  for (const agentId of agentIds) {
    saveProviderKeyToOpenClaw(runtimeProviderKey, resolvedKey, agentId);
  }
}

async function syncProviderToRuntime(
  config: ProviderConfig,
  apiKey: string | undefined,
): Promise<void> {
  const runtimeProviderKey = getOpenClawProviderKey(config.type, config.id);
  const meta = getProviderConfig(config.type);
  const api = isUnregisteredProviderType(config.type) ? 'openai-completions' : meta?.api;

  await syncProviderSecretToRuntime(config, apiKey);

  if (!api) {
    return;
  }

  await syncProviderConfigToOpenClaw(runtimeProviderKey, config.model, {
    baseUrl: normalizeProviderBaseUrl(config, config.baseUrl || meta?.baseUrl),
    api,
    apiKeyEnv: meta?.apiKeyEnv,
    headers: meta?.headers,
  });

  if (!isUnregisteredProviderType(config.type)) {
    return;
  }

  const resolvedKey = await resolveStoredApiKey(config, apiKey);
  const baseUrl = normalizeProviderBaseUrl(config, config.baseUrl);
  if (!resolvedKey || !baseUrl) {
    return;
  }

  await updateAgentModelProvider(runtimeProviderKey, {
    baseUrl,
    api: 'openai-completions',
    models: config.model ? [{ id: config.model, name: config.model }] : [],
    apiKey: resolvedKey,
  });
}

async function buildRuntimeProviderConfigMap(): Promise<Map<string, ProviderConfig>> {
  const providers = dedupeProvidersByRuntimeKey(await getAllProviders());
  const runtimeMap = new Map<string, ProviderConfig>();

  for (const provider of providers) {
    const runtimeKey = getOpenClawProviderKey(provider.type, provider.id);
    if (!runtimeMap.has(runtimeKey)) {
      runtimeMap.set(runtimeKey, provider);
    }
  }

  return runtimeMap;
}

function dedupeProvidersByRuntimeKey(providers: ProviderConfig[]): ProviderConfig[] {
  const seen = new Set<string>();
  const deduped: ProviderConfig[] = [];
  const sortedProviders = [...providers].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );

  for (const provider of sortedProviders) {
    const runtimeKey = getOpenClawProviderKey(provider.type, provider.id);
    if (seen.has(runtimeKey)) {
      continue;
    }

    seen.add(runtimeKey);
    deduped.push(provider);
  }

  return deduped;
}

async function buildAgentModelProviderEntry(
  config: ProviderConfig,
  modelId: string,
): Promise<{
  baseUrl?: string;
  api?: string;
  models?: Array<Record<string, unknown> & { id: string; name: string }>;
  apiKey?: string;
  authHeader?: boolean;
} | null> {
  const meta = getProviderConfig(config.type);
  const api = isUnregisteredProviderType(config.type) ? 'openai-completions' : meta?.api;
  const baseUrl = normalizeProviderBaseUrl(config, config.baseUrl || meta?.baseUrl);
  if (!api || !baseUrl) {
    return null;
  }

  const entry: {
    baseUrl?: string;
    api?: string;
    models?: Array<Record<string, unknown> & { id: string; name: string }>;
    apiKey?: string;
    authHeader?: boolean;
  } = {
    baseUrl,
    api,
    models: (() => {
      const registryModels = Array.isArray(meta?.models)
        ? meta.models.map((model) => ({ ...model }))
        : [];
      if (registryModels.length === 0) {
        return [{ id: modelId, name: modelId }];
      }

      const hasPrimaryModel = registryModels.some((model) => model.id === modelId);
      if (hasPrimaryModel) {
        return registryModels;
      }

      return [...registryModels, { id: modelId, name: modelId }];
    })(),
  };

  if (isUnregisteredProviderType(config.type)) {
    const apiKey = await getApiKey(config.id);
    if (apiKey) {
      entry.apiKey = apiKey;
    }
  }

  return entry;
}

async function syncAgentModelsToRuntime(agentIds?: Set<string>): Promise<void> {
  const snapshot = await listAgentsSnapshot();
  const runtimeProviderConfigs = await buildRuntimeProviderConfigMap();

  const targets = snapshot.agents.filter((agent) => {
    if (!agent.modelRef) {
      return false;
    }
    if (!agentIds) {
      return true;
    }
    return agentIds.has(agent.id);
  });

  for (const agent of targets) {
    const parsed = parseModelRef(agent.modelRef || '');
    if (!parsed) {
      continue;
    }

    const providerConfig = runtimeProviderConfigs.get(parsed.providerKey);
    if (!providerConfig) {
      logger.warn(
        `[provider-runtime] Missing provider mapping for runtime key "${parsed.providerKey}" on agent "${agent.id}"`,
      );
      continue;
    }

    const entry = await buildAgentModelProviderEntry(providerConfig, parsed.modelId);
    if (!entry) {
      continue;
    }

    await updateSingleAgentModelProvider(agent.id, parsed.providerKey, entry);
  }
}

export async function syncProviderApiKeyToRuntime(
  providerType: string,
  providerId: string,
  apiKey: string,
): Promise<void> {
  const runtimeProviderKey = getOpenClawProviderKey(providerType, providerId);
  const agentIds = await listRuntimeAgentIds();

  for (const agentId of agentIds) {
    saveProviderKeyToOpenClaw(runtimeProviderKey, apiKey, agentId);
  }
}

export async function syncDeletedProviderApiKeyToRuntime(
  providerType: string,
  providerId: string,
): Promise<void> {
  const runtimeProviderKey = getOpenClawProviderKey(providerType, providerId);
  const agentIds = await listRuntimeAgentIds();

  for (const agentId of agentIds) {
    removeProviderKeyFromOpenClaw(runtimeProviderKey, agentId);
  }
}

export async function syncSavedProviderToRuntime(
  config: ProviderConfig,
  apiKey: string | undefined,
): Promise<void> {
  await syncProviderToRuntime(config, apiKey);
  await syncAgentModelsToRuntime();
}

export async function syncUpdatedProviderToRuntime(
  config: ProviderConfig,
  apiKey: string | undefined,
): Promise<void> {
  await syncProviderToRuntime(config, apiKey);
  await syncAgentModelsToRuntime();
}

export async function syncDeletedProviderToRuntime(
  provider: ProviderConfig | null,
  providerId: string,
): Promise<void> {
  if (!provider?.type) {
    return;
  }

  const runtimeProviderKey = getOpenClawProviderKey(provider.type, providerId);
  await removeProviderFromOpenClaw(runtimeProviderKey);
}

export async function syncAgentModelOverrideToRuntime(agentId: string): Promise<void> {
  await syncAgentModelsToRuntime(new Set([agentId]));
}

export async function syncAllProvidersToRuntime(): Promise<void> {
  const providers = dedupeProvidersByRuntimeKey(await getAllProviders());

  for (const provider of providers) {
    await syncProviderToRuntime(provider, undefined);
  }

  await syncAgentModelsToRuntime();
}
