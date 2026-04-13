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
const LAWCLAW_AGENT_ID = 'lawclaw-main';
const LEGACY_QWEN_PROVIDER_TYPE = 'qwen-portal';
const MODELSTUDIO_PROVIDER_TYPE = 'modelstudio';
const MODELSTUDIO_PROVIDER_LABEL = 'Model Studio';
const MODELSTUDIO_DEFAULT_BASE_URL = 'https://coding.dashscope.aliyuncs.com/v1';
const MODELSTUDIO_DEFAULT_MODEL = 'qwen3.5-plus';

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
  if (provider.type !== JURISMIND_PROVIDER_TYPE) {
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

function normalizeQwenPortalProvider(
  provider: ProviderConfig,
  nowIso: string
): { changed: boolean; next: ProviderConfig } {
  if (provider.type !== LEGACY_QWEN_PROVIDER_TYPE) {
    return { changed: false, next: provider };
  }

  const rawModel = provider.model?.trim();
  let nextModel = rawModel;
  if (!nextModel || nextModel === 'coder-model' || nextModel.startsWith('qwen-portal/')) {
    nextModel = MODELSTUDIO_DEFAULT_MODEL;
  } else if (nextModel.startsWith('modelstudio/')) {
    nextModel = nextModel.slice('modelstudio/'.length);
  }

  const rawBaseUrl = provider.baseUrl?.trim();
  const nextBaseUrl = !rawBaseUrl || rawBaseUrl.includes('portal.qwen.ai')
    ? MODELSTUDIO_DEFAULT_BASE_URL
    : rawBaseUrl;

  return {
    changed: true,
    next: {
      ...provider,
      type: MODELSTUDIO_PROVIDER_TYPE,
      name: MODELSTUDIO_PROVIDER_LABEL,
      baseUrl: nextBaseUrl,
      model: nextModel,
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

  const cleanedLegacyProfiles =
    deps.cleanupLegacyProviderProfiles(LEGACY_PROVIDER_TYPE)
    || deps.cleanupLegacyProviderProfiles(LEGACY_PROVIDER_TYPE, LAWCLAW_AGENT_ID);
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

export async function migrateJurismindProviderModel(
  deps: ProviderMigrationDependencies = defaultDeps
): Promise<ProviderMigrationSummary> {
  const providers = await deps.getAllProviders();
  const targetProviders = providers.filter((provider) => provider.type === JURISMIND_PROVIDER_TYPE);
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

export async function migrateQwenPortalProvider(
  deps: ProviderMigrationDependencies = defaultDeps
): Promise<ProviderMigrationSummary> {
  const providers = await deps.getAllProviders();
  const targetProviders = providers.filter((provider) => provider.type === LEGACY_QWEN_PROVIDER_TYPE);

  let normalizedProviders = 0;
  let syncedKeys = 0;
  let rewroteDefaultModel = false;
  const nowIso = new Date().toISOString();

  for (const provider of targetProviders) {
    const { changed, next } = normalizeQwenPortalProvider(provider, nowIso);
    if (changed) {
      await deps.saveProvider(next);
      normalizedProviders += 1;
    }

    const apiKey = await deps.getApiKey(provider.id);
    if (apiKey?.trim()) {
      deps.saveProviderKeyToOpenClaw(MODELSTUDIO_PROVIDER_TYPE, apiKey.trim());
      deps.saveProviderKeyToOpenClaw(MODELSTUDIO_PROVIDER_TYPE, apiKey.trim(), LAWCLAW_AGENT_ID);
      syncedKeys += 1;
    }
  }

  const defaultProviderId = await deps.getDefaultProvider();
  if (defaultProviderId) {
    const defaultProvider = providers.find((provider) => provider.id === defaultProviderId);
    const currentPrimary = deps.getOpenClawAgentModelPrimary(LAWCLAW_AGENT_ID);
    if (
      defaultProvider?.type === LEGACY_QWEN_PROVIDER_TYPE
      && (
        !currentPrimary
        || currentPrimary === 'coder-model'
        || currentPrimary.startsWith('qwen-portal/')
      )
    ) {
      deps.setOpenClawAgentModel(
        LAWCLAW_AGENT_ID,
        MODELSTUDIO_PROVIDER_TYPE,
        MODELSTUDIO_DEFAULT_MODEL
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
    removedStaleProviderEntries: deps.cleanupOpenClawProviderEntries(LEGACY_QWEN_PROVIDER_TYPE),
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

    const qwenResult = await migrateQwenPortalProvider();
    if (
      qwenResult.touchedProviders > 0
      || qwenResult.rewroteDefaultModel
      || qwenResult.removedStaleProviderEntries
    ) {
      logger.info('Qwen Portal provider migration completed:', qwenResult);
    } else {
      logger.debug('Qwen Portal provider migration skipped (no legacy data found).');
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
