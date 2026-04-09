import type { ProviderConfig } from './secure-storage';
import {
  getAllProviders,
  getApiKey,
  getDefaultProvider,
  saveProvider,
} from './secure-storage';
import {
  cleanupOpenClawAuthProfilesEncoding,
  cleanupOpenClawProviderApiKeyConfig,
  cleanupLegacyProviderProfiles,
  cleanupLegacyOpenClawProviderAliases,
  cleanupOpenClawProviderEntries,
  getOpenClawAgentModelPrimary,
  saveProviderKeyToOpenClaw,
  setOpenClawAgentModel,
} from './openclaw-auth';
import { logger } from './logger';

const LEGACY_PROVIDER_TYPE = 'moonshot_code_plan';
const OFFICIAL_KIMI_MODEL = 'kimi-coding/k2p5';
const OFFICIAL_PROVIDER_LABEL = 'Kimi Coding（官方）';
const JURISMIND_PROVIDER_TYPE = 'jurismind';
const JURISMIND_MANAGED_MODEL = 'jurismind/jurismind';
const JURISMIND_LEGACY_MODELS = new Set([
  'jurismind',
  'jurismind/kimi-k2.5',
  'kimi-k2.5',
]);
const LEGACY_QWEN_PROVIDER_TYPE = 'qwen-portal';
const QWEN_PROVIDER_TYPE = 'qwen';
const QWEN_MANAGED_MODEL = 'qwen/qwen3.5-plus';
const QWEN_MANAGED_BASE_URL = 'https://coding-intl.dashscope.aliyuncs.com/v1';
const QWEN_LEGACY_BASE_URLS = new Set(['https://portal.qwen.ai', 'https://portal.qwen.ai/v1']);
const QWEN_LEGACY_MODELS = new Set([
  'coder-model',
  'qwen-portal/coder-model',
  'qwen/coder-model',
]);
const MINIMAX_PROVIDER_TYPES = new Set(['minimax-portal', 'minimax-portal-cn']);
const MINIMAX_MANAGED_MODEL = 'minimax-portal/MiniMax-M2.7';
const MINIMAX_LEGACY_MODELS = new Set([
  'MiniMax-M2.5',
  'minimax-portal/MiniMax-M2.5',
  'minimax-portal-cn/MiniMax-M2.5',
]);
const LAWCLAW_AGENT_ID = 'lawclaw-main';

export interface ProviderMigrationSummary {
  touchedProviders: number;
  normalizedProviders: number;
  syncedKeys: number;
  cleanedLegacyProfiles: boolean;
  rewroteDefaultModel: boolean;
  removedStaleProviderEntries: boolean;
  cleanedInvalidApiKeyConfig: boolean;
  cleanedAuthProfileEncoding: boolean;
}

interface ProviderMigrationDependencies {
  getAllProviders: typeof getAllProviders;
  getApiKey: typeof getApiKey;
  saveProvider: typeof saveProvider;
  getDefaultProvider: typeof getDefaultProvider;
  saveProviderKeyToOpenClaw: typeof saveProviderKeyToOpenClaw;
  cleanupLegacyProviderProfiles: typeof cleanupLegacyProviderProfiles;
  cleanupLegacyOpenClawProviderAliases: typeof cleanupLegacyOpenClawProviderAliases;
  setOpenClawAgentModel: typeof setOpenClawAgentModel;
  cleanupOpenClawProviderEntries: typeof cleanupOpenClawProviderEntries;
  getOpenClawAgentModelPrimary: typeof getOpenClawAgentModelPrimary;
  cleanupOpenClawProviderApiKeyConfig: typeof cleanupOpenClawProviderApiKeyConfig;
  cleanupOpenClawAuthProfilesEncoding: typeof cleanupOpenClawAuthProfilesEncoding;
}

const defaultDeps: ProviderMigrationDependencies = {
  getAllProviders,
  getApiKey,
  saveProvider,
  getDefaultProvider,
  saveProviderKeyToOpenClaw,
  cleanupLegacyProviderProfiles,
  cleanupLegacyOpenClawProviderAliases,
  setOpenClawAgentModel,
  cleanupOpenClawProviderEntries,
  getOpenClawAgentModelPrimary,
  cleanupOpenClawProviderApiKeyConfig,
  cleanupOpenClawAuthProfilesEncoding,
};

function shouldRenameToOfficialLabel(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === LEGACY_PROVIDER_TYPE ||
    normalized.includes('moonshot - code plan') ||
    normalized.includes('moonshot code plan')
  );
}

function normalizeMoonshotProvider(
  provider: ProviderConfig,
  nowIso: string
): { changed: boolean; next: ProviderConfig } {
  let changed = false;
  const next: ProviderConfig = {
    ...provider,
  };

  if (shouldRenameToOfficialLabel(provider.name) && provider.name !== OFFICIAL_PROVIDER_LABEL) {
    next.name = OFFICIAL_PROVIDER_LABEL;
    changed = true;
  }

  // Hidden fields in UI: remove stale base/model data to avoid wrong runtime override.
  if (provider.baseUrl !== undefined) {
    next.baseUrl = undefined;
    changed = true;
  }
  if (provider.model !== undefined) {
    next.model = undefined;
    changed = true;
  }

  if (changed) {
    next.updatedAt = nowIso;
  }

  return { changed, next };
}

function normalizeJurismindProvider(
  provider: ProviderConfig,
  nowIso: string
): { changed: boolean; next: ProviderConfig } {
  if (String(provider.type) !== JURISMIND_PROVIDER_TYPE) {
    return { changed: false, next: provider };
  }

  if (!provider.model || !JURISMIND_LEGACY_MODELS.has(provider.model)) {
    return { changed: false, next: provider };
  }

  return {
    changed: true,
    next: {
      ...provider,
      model: JURISMIND_MANAGED_MODEL,
      updatedAt: nowIso,
    },
  };
}

function getProviderType(provider: ProviderConfig): string {
  return String(provider.type || '').trim();
}

function getOpenClawProviderKey(providerType: string): string {
  if (providerType === 'minimax-portal-cn') {
    return 'minimax-portal';
  }
  if (providerType === LEGACY_QWEN_PROVIDER_TYPE) {
    return QWEN_PROVIDER_TYPE;
  }
  return providerType;
}

function cleanupLegacyProfilesForAllAgents(
  provider: string,
  deps: ProviderMigrationDependencies
): boolean {
  const cleanedMainProfiles = deps.cleanupLegacyProviderProfiles(provider);
  const cleanedLawClawProfiles = deps.cleanupLegacyProviderProfiles(provider, LAWCLAW_AGENT_ID);
  return cleanedMainProfiles || cleanedLawClawProfiles;
}

function normalizeQwenProvider(
  provider: ProviderConfig,
  nowIso: string
): { changed: boolean; next: ProviderConfig } {
  const providerType = getProviderType(provider);
  let changed = false;
  const next: ProviderConfig = {
    ...provider,
  };

  if (providerType === LEGACY_QWEN_PROVIDER_TYPE) {
    next.type = QWEN_PROVIDER_TYPE;
    changed = true;
  }

  const normalizedBaseUrl = String(provider.baseUrl || '').trim();
  if (
    providerType === LEGACY_QWEN_PROVIDER_TYPE
    || !normalizedBaseUrl
    || QWEN_LEGACY_BASE_URLS.has(normalizedBaseUrl)
  ) {
    if (provider.baseUrl !== QWEN_MANAGED_BASE_URL) {
      next.baseUrl = QWEN_MANAGED_BASE_URL;
      changed = true;
    }
  }

  const normalizedModel = String(provider.model || '').trim();
  if (
    providerType === LEGACY_QWEN_PROVIDER_TYPE
    || !normalizedModel
    || QWEN_LEGACY_MODELS.has(normalizedModel)
  ) {
    if (provider.model !== QWEN_MANAGED_MODEL) {
      next.model = QWEN_MANAGED_MODEL;
      changed = true;
    }
  }

  if (changed) {
    next.updatedAt = nowIso;
  }

  return { changed, next };
}

function normalizeMiniMaxProvider(
  provider: ProviderConfig,
  nowIso: string
): { changed: boolean; next: ProviderConfig } {
  if (!MINIMAX_PROVIDER_TYPES.has(getProviderType(provider))) {
    return { changed: false, next: provider };
  }

  if (!provider.model || !MINIMAX_LEGACY_MODELS.has(provider.model)) {
    return { changed: false, next: provider };
  }

  return {
    changed: true,
    next: {
      ...provider,
      model: MINIMAX_MANAGED_MODEL,
      updatedAt: nowIso,
    },
  };
}

export async function migrateMoonshotCodePlanProvider(
  deps: ProviderMigrationDependencies = defaultDeps
): Promise<ProviderMigrationSummary> {
  const providers = await deps.getAllProviders();
  const targetProviders = providers.filter((provider) => provider.type === LEGACY_PROVIDER_TYPE);

  let normalizedProviders = 0;
  let syncedKeys = 0;
  const nowIso = new Date().toISOString();

  for (const provider of targetProviders) {
    const { changed, next } = normalizeMoonshotProvider(provider, nowIso);
    if (changed) {
      await deps.saveProvider(next);
      normalizedProviders += 1;
    }

    const apiKey = await deps.getApiKey(provider.id);
    if (apiKey?.trim()) {
      deps.saveProviderKeyToOpenClaw(LEGACY_PROVIDER_TYPE, apiKey.trim());
      deps.saveProviderKeyToOpenClaw(LEGACY_PROVIDER_TYPE, apiKey.trim(), LAWCLAW_AGENT_ID);
      syncedKeys += 1;
    }
  }

  const cleanedLegacyProfiles = cleanupLegacyProfilesForAllAgents(LEGACY_PROVIDER_TYPE, deps);
  const removedStaleProviderEntries = deps.cleanupOpenClawProviderEntries(LEGACY_PROVIDER_TYPE);

  let rewroteDefaultModel = false;
  const defaultProviderId = await deps.getDefaultProvider();
  if (defaultProviderId) {
    const defaultProvider = providers.find((provider) => provider.id === defaultProviderId);
    if (defaultProvider?.type === LEGACY_PROVIDER_TYPE) {
      deps.setOpenClawAgentModel(LAWCLAW_AGENT_ID, LEGACY_PROVIDER_TYPE, OFFICIAL_KIMI_MODEL);
      rewroteDefaultModel = true;
    }
  }

  return {
    touchedProviders: targetProviders.length,
    normalizedProviders,
    syncedKeys,
    cleanedLegacyProfiles,
    rewroteDefaultModel,
    removedStaleProviderEntries,
    cleanedInvalidApiKeyConfig: false,
    cleanedAuthProfileEncoding: false,
  };
}

export async function migrateQwenProvider(
  deps: ProviderMigrationDependencies = defaultDeps
): Promise<ProviderMigrationSummary> {
  const providers = await deps.getAllProviders();
  const targetProviders = providers.filter((provider) => {
    const providerType = getProviderType(provider);
    return providerType === LEGACY_QWEN_PROVIDER_TYPE || providerType === QWEN_PROVIDER_TYPE;
  });
  const nowIso = new Date().toISOString();
  let normalizedProviders = 0;
  let syncedKeys = 0;
  const cleanedMainAuthProfileEncoding = deps.cleanupOpenClawAuthProfilesEncoding();
  const cleanedLawClawAuthProfileEncoding = deps.cleanupOpenClawAuthProfilesEncoding(
    LAWCLAW_AGENT_ID
  );
  const cleanedAuthProfileEncoding =
    cleanedMainAuthProfileEncoding || cleanedLawClawAuthProfileEncoding;

  for (const provider of targetProviders) {
    const { changed, next } = normalizeQwenProvider(provider, nowIso);
    if (changed) {
      await deps.saveProvider(next);
      normalizedProviders += 1;
    }

    const apiKey = await deps.getApiKey(provider.id);
    if (apiKey?.trim()) {
      deps.saveProviderKeyToOpenClaw(QWEN_PROVIDER_TYPE, apiKey.trim());
      deps.saveProviderKeyToOpenClaw(QWEN_PROVIDER_TYPE, apiKey.trim(), LAWCLAW_AGENT_ID);
      syncedKeys += 1;
    }
  }

  let rewroteDefaultModel = false;
  const cleanedLegacyProfiles = cleanupLegacyProfilesForAllAgents(QWEN_PROVIDER_TYPE, deps);
  const removedStaleProviderEntries = deps.cleanupLegacyOpenClawProviderAliases(QWEN_PROVIDER_TYPE);
  const cleanedInvalidApiKeyConfig = deps.cleanupOpenClawProviderApiKeyConfig(QWEN_PROVIDER_TYPE);
  const defaultProviderId = await deps.getDefaultProvider();
  if (defaultProviderId) {
    const defaultProvider = providers.find((provider) => provider.id === defaultProviderId);
    const defaultProviderType = defaultProvider ? getProviderType(defaultProvider) : '';
    const currentPrimary = deps.getOpenClawAgentModelPrimary(LAWCLAW_AGENT_ID);
    if (
      defaultProvider
      && (defaultProviderType === LEGACY_QWEN_PROVIDER_TYPE || defaultProviderType === QWEN_PROVIDER_TYPE)
      && (!currentPrimary || QWEN_LEGACY_MODELS.has(currentPrimary))
    ) {
      deps.setOpenClawAgentModel(
        LAWCLAW_AGENT_ID,
        getOpenClawProviderKey(defaultProviderType),
        QWEN_MANAGED_MODEL
      );
      rewroteDefaultModel = true;
    }
  }

  return {
    touchedProviders: targetProviders.length,
    normalizedProviders,
    syncedKeys,
    cleanedLegacyProfiles,
    rewroteDefaultModel,
    removedStaleProviderEntries,
    cleanedInvalidApiKeyConfig,
    cleanedAuthProfileEncoding,
  };
}

export async function migrateJurismindProviderModel(
  deps: ProviderMigrationDependencies = defaultDeps
): Promise<ProviderMigrationSummary> {
  const providers = await deps.getAllProviders();
  const targetProviders = providers.filter(
    (provider) => getProviderType(provider) === JURISMIND_PROVIDER_TYPE
  );
  const nowIso = new Date().toISOString();
  let normalizedProviders = 0;
  let syncedKeys = 0;
  const cleanedMainAuthProfileEncoding = deps.cleanupOpenClawAuthProfilesEncoding();
  const cleanedLawClawAuthProfileEncoding = deps.cleanupOpenClawAuthProfilesEncoding(
    LAWCLAW_AGENT_ID
  );
  const cleanedAuthProfileEncoding =
    cleanedMainAuthProfileEncoding || cleanedLawClawAuthProfileEncoding;

  for (const provider of targetProviders) {
    const { changed, next } = normalizeJurismindProvider(provider, nowIso);
    if (changed) {
      await deps.saveProvider(next);
      normalizedProviders += 1;
    }

    const apiKey = await deps.getApiKey(provider.id);
    if (apiKey?.trim()) {
      deps.saveProviderKeyToOpenClaw(JURISMIND_PROVIDER_TYPE, apiKey.trim());
      deps.saveProviderKeyToOpenClaw(JURISMIND_PROVIDER_TYPE, apiKey.trim(), LAWCLAW_AGENT_ID);
      syncedKeys += 1;
    }
  }

  let rewroteDefaultModel = false;
  const cleanedInvalidApiKeyConfig = deps.cleanupOpenClawProviderApiKeyConfig(
    JURISMIND_PROVIDER_TYPE
  );
  const defaultProviderId = await deps.getDefaultProvider();
  if (defaultProviderId) {
    const defaultProvider = providers.find((provider) => provider.id === defaultProviderId);
    const currentPrimary = deps.getOpenClawAgentModelPrimary(LAWCLAW_AGENT_ID);
    if (
      defaultProvider?.type === JURISMIND_PROVIDER_TYPE
      && currentPrimary
      && JURISMIND_LEGACY_MODELS.has(currentPrimary)
    ) {
      deps.setOpenClawAgentModel(
        LAWCLAW_AGENT_ID,
        JURISMIND_PROVIDER_TYPE,
        JURISMIND_MANAGED_MODEL
      );
      rewroteDefaultModel = true;
    }
  }

  return {
    touchedProviders: targetProviders.length,
    normalizedProviders,
    syncedKeys,
    cleanedLegacyProfiles: false,
    rewroteDefaultModel,
    removedStaleProviderEntries: false,
    cleanedInvalidApiKeyConfig,
    cleanedAuthProfileEncoding,
  };
}

export async function migrateMiniMaxProviderModel(
  deps: ProviderMigrationDependencies = defaultDeps
): Promise<ProviderMigrationSummary> {
  const providers = await deps.getAllProviders();
  const targetProviders = providers.filter((provider) => MINIMAX_PROVIDER_TYPES.has(getProviderType(provider)));
  const nowIso = new Date().toISOString();
  let normalizedProviders = 0;
  let syncedKeys = 0;

  for (const provider of targetProviders) {
    const { changed, next } = normalizeMiniMaxProvider(provider, nowIso);
    if (changed) {
      await deps.saveProvider(next);
      normalizedProviders += 1;
    }

    const apiKey = await deps.getApiKey(provider.id);
    if (apiKey?.trim()) {
      const providerKey = getOpenClawProviderKey(getProviderType(provider));
      deps.saveProviderKeyToOpenClaw(providerKey, apiKey.trim());
      deps.saveProviderKeyToOpenClaw(providerKey, apiKey.trim(), LAWCLAW_AGENT_ID);
      syncedKeys += 1;
    }
  }

  let rewroteDefaultModel = false;
  const defaultProviderId = await deps.getDefaultProvider();
  if (defaultProviderId) {
    const defaultProvider = providers.find((provider) => provider.id === defaultProviderId);
    const currentPrimary = deps.getOpenClawAgentModelPrimary(LAWCLAW_AGENT_ID);
    if (
      defaultProvider
      && MINIMAX_PROVIDER_TYPES.has(getProviderType(defaultProvider))
      && (!currentPrimary || MINIMAX_LEGACY_MODELS.has(currentPrimary))
    ) {
      deps.setOpenClawAgentModel(LAWCLAW_AGENT_ID, 'minimax-portal', MINIMAX_MANAGED_MODEL);
      rewroteDefaultModel = true;
    }
  }

  return {
    touchedProviders: targetProviders.length,
    normalizedProviders,
    syncedKeys,
    cleanedLegacyProfiles: false,
    rewroteDefaultModel,
    removedStaleProviderEntries: false,
    cleanedInvalidApiKeyConfig: false,
    cleanedAuthProfileEncoding: false,
  };
}

export async function runProviderStartupMigration(): Promise<void> {
  try {
    const moonshotResult = await migrateMoonshotCodePlanProvider();
    if (
      moonshotResult.touchedProviders > 0
      || moonshotResult.cleanedLegacyProfiles
      || moonshotResult.rewroteDefaultModel
    ) {
      logger.info('Kimi Coding provider migration completed:', moonshotResult);
    } else {
      logger.debug('Kimi Coding provider migration skipped (no legacy data found).');
    }

    const qwenResult = await migrateQwenProvider();
    if (
      qwenResult.normalizedProviders > 0
      || qwenResult.rewroteDefaultModel
      || qwenResult.cleanedLegacyProfiles
      || qwenResult.removedStaleProviderEntries
      || qwenResult.cleanedInvalidApiKeyConfig
      || qwenResult.cleanedAuthProfileEncoding
    ) {
      logger.info('Qwen provider migration completed:', qwenResult);
    } else {
      logger.debug('Qwen provider migration skipped (no legacy data found).');
    }

    const minimaxResult = await migrateMiniMaxProviderModel();
    if (minimaxResult.normalizedProviders > 0 || minimaxResult.rewroteDefaultModel) {
      logger.info('MiniMax provider model migration completed:', minimaxResult);
    } else {
      logger.debug('MiniMax provider model migration skipped (no legacy data found).');
    }

    const jurismindResult = await migrateJurismindProviderModel();
    if (
      jurismindResult.normalizedProviders > 0
      || jurismindResult.rewroteDefaultModel
      || jurismindResult.cleanedInvalidApiKeyConfig
      || jurismindResult.cleanedAuthProfileEncoding
    ) {
      logger.info('Jurismind provider model migration completed:', jurismindResult);
    } else {
      logger.debug('Jurismind provider model migration skipped (no legacy data found).');
    }
  } catch (error) {
    logger.warn('Provider startup migration failed (non-blocking):', error);
  }
}
