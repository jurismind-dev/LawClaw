import {
  clearDefaultProvider,
  getAllProviders,
  getApiKey,
  getProvider,
  setDefaultProvider,
  type ProviderConfig,
} from './secure-storage';
import {
  clearOpenClawAgentModelPrimary,
  getOAuthTokenFromOpenClaw,
  saveProviderKeyToOpenClaw,
  setOpenClawAgentModel,
  setOpenClawAgentModelWithOverride,
} from './openclaw-auth';
import { getProviderConfig, getProviderEnvVar } from './provider-registry';
import { logger } from './logger';

const LAWCLAW_MAIN_AGENT_ID = 'lawclaw-main';
const KEYLESS_PROVIDER_TYPES = new Set(['ollama']);
const OAUTH_ONLY_PROVIDER_TYPES = new Set(['qwen-portal']);
const OAUTH_OR_API_KEY_PROVIDER_TYPES = new Set(['minimax-portal', 'minimax-portal-cn']);

interface SelectionOptions {
  restartGateway?: () => void;
}

function getOpenClawProviderKey(type: string, providerId: string): string {
  if (type === 'custom' || type === 'ollama') {
    const suffix = providerId.replace(/-/g, '').slice(0, 8);
    return `${type}-${suffix}`;
  }
  if (type === 'minimax-portal-cn') {
    return 'minimax-portal';
  }
  return type;
}

function shouldUseRuntimeOverride(type: string): boolean {
  return type === 'custom' || type === 'ollama';
}

function toModelOverride(provider: ProviderConfig, providerKey: string): string | undefined {
  if (provider.type === 'moonshot_code_plan') {
    return undefined;
  }

  if (!provider.model) {
    return undefined;
  }

  return provider.model.startsWith(`${providerKey}/`)
    ? provider.model
    : `${providerKey}/${provider.model}`;
}

function toTimestamp(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

async function hasOAuthToken(providerKey: string): Promise<boolean> {
  const dedicatedToken = await getOAuthTokenFromOpenClaw(providerKey, LAWCLAW_MAIN_AGENT_ID);
  if (dedicatedToken) {
    return true;
  }

  const legacyMainToken = await getOAuthTokenFromOpenClaw(providerKey, 'main');
  return Boolean(legacyMainToken);
}

export async function applyLawClawProviderSelection(
  providerId: string,
  options: SelectionOptions = {}
): Promise<void> {
  const provider = await getProvider(providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  const providerKey = getOpenClawProviderKey(provider.type, providerId);
  const modelOverride = toModelOverride(provider, providerKey);
  const registryProviderConfig = getProviderConfig(provider.type);

  await setDefaultProvider(providerId);

  if (shouldUseRuntimeOverride(provider.type)) {
    setOpenClawAgentModelWithOverride(LAWCLAW_MAIN_AGENT_ID, providerKey, modelOverride, {
      baseUrl: provider.baseUrl || registryProviderConfig?.baseUrl,
      api: registryProviderConfig?.api || 'openai-completions',
      apiKeyEnv: getProviderEnvVar(provider.type),
      headers: registryProviderConfig?.headers,
    });
  } else {
    setOpenClawAgentModel(LAWCLAW_MAIN_AGENT_ID, providerKey, modelOverride);
  }

  const providerApiKey = await getApiKey(providerId);
  if (providerApiKey) {
    saveProviderKeyToOpenClaw(providerKey, providerApiKey);
    saveProviderKeyToOpenClaw(providerKey, providerApiKey, LAWCLAW_MAIN_AGENT_ID);
  }

  if (options.restartGateway) {
    logger.info(`Scheduling Gateway restart after LawClaw provider switch to "${providerKey}"`);
    options.restartGateway();
  }
}

export async function clearLawClawProviderSelection(options: SelectionOptions = {}): Promise<void> {
  await clearDefaultProvider();
  clearOpenClawAgentModelPrimary(LAWCLAW_MAIN_AGENT_ID);

  if (options.restartGateway) {
    logger.info('Scheduling Gateway restart after clearing LawClaw provider selection');
    options.restartGateway();
  }
}

export async function isProviderAvailableForLawClaw(provider: ProviderConfig): Promise<boolean> {
  if (!provider.enabled) {
    return false;
  }

  if (KEYLESS_PROVIDER_TYPES.has(provider.type)) {
    return true;
  }

  const providerApiKey = await getApiKey(provider.id);
  if (providerApiKey) {
    return true;
  }

  const providerKey = getOpenClawProviderKey(provider.type, provider.id);

  if (OAUTH_ONLY_PROVIDER_TYPES.has(provider.type)) {
    return hasOAuthToken(providerKey);
  }

  if (OAUTH_OR_API_KEY_PROVIDER_TYPES.has(provider.type)) {
    return hasOAuthToken(providerKey);
  }

  return false;
}

export async function pickFallbackLawClawProvider(
  excludedProviderIds: string[] = []
): Promise<ProviderConfig | null> {
  const excluded = new Set(excludedProviderIds);
  const providers = await getAllProviders();
  const candidates: ProviderConfig[] = [];

  for (const provider of providers) {
    if (excluded.has(provider.id)) {
      continue;
    }

    if (await isProviderAvailableForLawClaw(provider)) {
      candidates.push(provider);
    }
  }

  candidates.sort((left, right) => {
    const updatedDiff = toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }

    const createdDiff = toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    return left.id.localeCompare(right.id);
  });

  return candidates[0] ?? null;
}
