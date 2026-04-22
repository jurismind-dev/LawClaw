/**
 * Provider Storage
 * Manages provider configurations and API keys.
 * Keys are stored in plain text alongside provider configs in a single electron-store.
 */

import { app } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

import { BUILTIN_PROVIDER_TYPES } from './provider-registry';
import { getActiveOpenClawProviders } from './openclaw-auth';
import { parseJsonText } from './text-encoding';

// Lazy-load electron-store (ESM module)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let providerStore: any = null;

const PROVIDER_STORE_NAME = 'clawx-providers';
const LEGACY_PROVIDER_STORE_FILENAMES = [`${PROVIDER_STORE_NAME}.json`, 'providers.json'];
const LEGACY_PROVIDER_USER_DATA_DIRS = ['ClawX', 'OpenClaw'];

const providerStoreDefaults = {
  providers: {} as Record<string, ProviderConfig>,
  apiKeys: {} as Record<string, string>,
  defaultProvider: null as string | null,
  jurismindSsoBinding: null as JurismindSsoBinding | null,
};

interface ProviderStoreSnapshot {
  providers: Record<string, ProviderConfig>;
  apiKeys: Record<string, string>;
  defaultProvider: string | null;
  jurismindSsoBinding: JurismindSsoBinding | null;
}

export interface JurismindSsoBinding {
  openId: string;
  token?: string;
  tokenKey?: string;
  tokenId?: number | null;
  avatar?: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeJurismindSsoBinding(value: unknown): JurismindSsoBinding | null {
  if (!isRecord(value)) {
    return null;
  }

  const openId = typeof value.openId === 'string' ? value.openId.trim() : '';
  if (!openId) {
    return null;
  }

  const token = typeof value.token === 'string' ? value.token.trim() : '';
  const tokenKey = typeof value.tokenKey === 'string' ? value.tokenKey.trim() : '';
  const avatar = typeof value.avatar === 'string' ? value.avatar.trim() : '';
  const tokenIdRaw = value.tokenId;
  const tokenId = Number.isFinite(Number(tokenIdRaw)) ? Number(tokenIdRaw) : null;
  const updatedAt = typeof value.updatedAt === 'string' && value.updatedAt.trim()
    ? value.updatedAt.trim()
    : new Date(0).toISOString();

  return {
    openId,
    token: token || undefined,
    tokenKey: tokenKey || undefined,
    tokenId,
    avatar: avatar || undefined,
    updatedAt,
  };
}

function normalizeProviderStoreSnapshot(value: unknown): ProviderStoreSnapshot {
  const source = isRecord(value) ? value : {};
  return {
    providers: isRecord(source.providers)
      ? (source.providers as Record<string, ProviderConfig>)
      : {},
    apiKeys: isRecord(source.apiKeys)
      ? Object.fromEntries(
          Object.entries(source.apiKeys).filter((entry): entry is [string, string] => {
            return typeof entry[0] === 'string' && typeof entry[1] === 'string';
          })
        )
      : {},
    defaultProvider:
      typeof source.defaultProvider === 'string' && source.defaultProvider.trim().length > 0
        ? source.defaultProvider.trim()
        : null,
    jurismindSsoBinding: normalizeJurismindSsoBinding(source.jurismindSsoBinding),
  };
}

function hasProviderStoreData(snapshot: ProviderStoreSnapshot): boolean {
  return (
    Object.keys(snapshot.providers).length > 0
    || Object.keys(snapshot.apiKeys).length > 0
    || typeof snapshot.defaultProvider === 'string'
    || snapshot.jurismindSsoBinding !== null
  );
}

function readLegacyProviderStoreSnapshot(legacyUserDataDir: string): ProviderStoreSnapshot | null {
  for (const filename of LEGACY_PROVIDER_STORE_FILENAMES) {
    const filePath = join(legacyUserDataDir, filename);
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      return normalizeProviderStoreSnapshot(parseJsonText(readFileSync(filePath, 'utf-8')));
    } catch (error) {
      console.warn(`Failed to read legacy provider store at ${filePath}:`, error);
    }
  }

  return null;
}

function loadLegacyProviderStoreSnapshot(currentUserDataDir: string): ProviderStoreSnapshot | null {
  const userDataParentDir = dirname(currentUserDataDir);

  for (const legacyDirName of LEGACY_PROVIDER_USER_DATA_DIRS) {
    const legacyUserDataDir = join(userDataParentDir, legacyDirName);
    if (legacyUserDataDir === currentUserDataDir) {
      continue;
    }

    const snapshot = readLegacyProviderStoreSnapshot(legacyUserDataDir);
    if (snapshot && hasProviderStoreData(snapshot)) {
      return snapshot;
    }
  }

  return null;
}

async function migrateLegacyProviderStoreIfNeeded(store: {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}) {
  const currentSnapshot = normalizeProviderStoreSnapshot({
    providers: store.get('providers'),
    apiKeys: store.get('apiKeys'),
    defaultProvider: store.get('defaultProvider'),
    jurismindSsoBinding: store.get('jurismindSsoBinding'),
  });
  if (hasProviderStoreData(currentSnapshot)) {
    return;
  }

  const legacySnapshot = loadLegacyProviderStoreSnapshot(app.getPath('userData'));
  if (!legacySnapshot) {
    return;
  }

  store.set('providers', legacySnapshot.providers);
  store.set('apiKeys', legacySnapshot.apiKeys);
  store.set('defaultProvider', legacySnapshot.defaultProvider);
  store.set('jurismindSsoBinding', legacySnapshot.jurismindSsoBinding);
}

async function getProviderStore() {
  if (!providerStore) {
    const Store = (await import('electron-store')).default;
    providerStore = new Store({
      name: PROVIDER_STORE_NAME,
      defaults: providerStoreDefaults,
    });
    await migrateLegacyProviderStoreIfNeeded(providerStore);
  }
  return providerStore;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  id: string;
  name: string;
  type:
    | 'jurismind'
    | 'moonshot_code_plan'
    | 'glm_code_plan'
    | 'anthropic'
    | 'openai'
    | 'google'
    | 'openrouter'
    | 'ark'
    | 'moonshot'
    | 'siliconflow'
    | 'minimax-portal'
    | 'minimax-portal-cn'
    | 'modelstudio'
    | 'qwen-portal'
    | 'ollama'
    | 'custom';
  baseUrl?: string;
  model?: string;
  openId?: string;
  tokenId?: number | null;
  avatar?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ==================== API Key Storage ====================

/**
 * Store an API key
 */
export async function storeApiKey(providerId: string, apiKey: string): Promise<boolean> {
  try {
    const s = await getProviderStore();
    const keys = (s.get('apiKeys') || {}) as Record<string, string>;
    keys[providerId] = apiKey;
    s.set('apiKeys', keys);
    return true;
  } catch (error) {
    console.error('Failed to store API key:', error);
    return false;
  }
}

/**
 * Retrieve an API key
 */
export async function getApiKey(providerId: string): Promise<string | null> {
  try {
    const s = await getProviderStore();
    const keys = (s.get('apiKeys') || {}) as Record<string, string>;
    return keys[providerId] || null;
  } catch (error) {
    console.error('Failed to retrieve API key:', error);
    return null;
  }
}

/**
 * Delete an API key
 */
export async function deleteApiKey(providerId: string): Promise<boolean> {
  try {
    const s = await getProviderStore();
    const keys = (s.get('apiKeys') || {}) as Record<string, string>;
    delete keys[providerId];
    s.set('apiKeys', keys);
    return true;
  } catch (error) {
    console.error('Failed to delete API key:', error);
    return false;
  }
}

/**
 * Check if an API key exists for a provider
 */
export async function hasApiKey(providerId: string): Promise<boolean> {
  const s = await getProviderStore();
  const keys = (s.get('apiKeys') || {}) as Record<string, string>;
  return providerId in keys;
}

/**
 * List all provider IDs that have stored keys
 */
export async function listStoredKeyIds(): Promise<string[]> {
  const s = await getProviderStore();
  const keys = (s.get('apiKeys') || {}) as Record<string, string>;
  return Object.keys(keys);
}

// ==================== Provider Configuration ====================

/**
 * Save a provider configuration
 */
export async function saveProvider(config: ProviderConfig): Promise<void> {
  const s = await getProviderStore();
  const providers = s.get('providers') as Record<string, ProviderConfig>;
  providers[config.id] = config;
  s.set('providers', providers);
}

/**
 * Get a provider configuration
 */
export async function getProvider(providerId: string): Promise<ProviderConfig | null> {
  const s = await getProviderStore();
  const providers = s.get('providers') as Record<string, ProviderConfig>;
  return providers[providerId] || null;
}

/**
 * Get all provider configurations
 */
export async function getAllProviders(): Promise<ProviderConfig[]> {
  const s = await getProviderStore();
  const providers = s.get('providers') as Record<string, ProviderConfig>;
  return Object.values(providers);
}

/**
 * Delete a provider configuration and its API key
 */
export async function deleteProvider(providerId: string): Promise<boolean> {
  try {
    // Delete the API key
    await deleteApiKey(providerId);

    // Delete the provider config
    const s = await getProviderStore();
    const providers = s.get('providers') as Record<string, ProviderConfig>;
    delete providers[providerId];
    s.set('providers', providers);

    // Clear default if this was the default
    if (s.get('defaultProvider') === providerId) {
      s.delete('defaultProvider');
    }

    return true;
  } catch (error) {
    console.error('Failed to delete provider:', error);
    return false;
  }
}

/**
 * Set the default provider
 */
export async function setDefaultProvider(providerId: string): Promise<void> {
  const s = await getProviderStore();
  s.set('defaultProvider', providerId);
}

/**
 * Clear the default provider selection.
 */
export async function clearDefaultProvider(): Promise<void> {
  const s = await getProviderStore();
  s.delete('defaultProvider');
}

/**
 * Get the default provider
 */
export async function getDefaultProvider(): Promise<string | undefined> {
  const s = await getProviderStore();
  return s.get('defaultProvider') as string | undefined;
}

export async function saveJurismindSsoBinding(
  binding: Omit<JurismindSsoBinding, 'updatedAt'> & { updatedAt?: string }
): Promise<void> {
  const s = await getProviderStore();
  s.set('jurismindSsoBinding', normalizeJurismindSsoBinding({
    ...binding,
    updatedAt: binding.updatedAt || new Date().toISOString(),
  }));
}

export async function getJurismindSsoBinding(): Promise<JurismindSsoBinding | null> {
  const s = await getProviderStore();
  return normalizeJurismindSsoBinding(s.get('jurismindSsoBinding'));
}

export async function clearJurismindSsoBinding(): Promise<void> {
  const s = await getProviderStore();
  s.delete('jurismindSsoBinding');
}

/**
 * Get provider with masked key info (for UI display)
 */
export async function getProviderWithKeyInfo(
  providerId: string
): Promise<(ProviderConfig & { hasKey: boolean; keyMasked: string | null }) | null> {
  const provider = await getProvider(providerId);
  if (!provider) return null;

  const apiKey = await getApiKey(providerId);
  let keyMasked: string | null = null;

  if (apiKey) {
    if (apiKey.length > 12) {
      keyMasked = `${apiKey.substring(0, 4)}${'*'.repeat(apiKey.length - 8)}${apiKey.substring(apiKey.length - 4)}`;
    } else {
      keyMasked = '*'.repeat(apiKey.length);
    }
  }

  return {
    ...provider,
    hasKey: !!apiKey,
    keyMasked,
  };
}

/**
 * Get all providers with key info (for UI display)
 * Also synchronizes ClawX local provider list with OpenClaw's actual config.
 */
export async function getAllProvidersWithKeyInfo(): Promise<
  Array<ProviderConfig & { hasKey: boolean; keyMasked: string | null }>
> {
  const providers = await getAllProviders();
  const results: Array<ProviderConfig & { hasKey: boolean; keyMasked: string | null }> = [];
  const activeOpenClawProviders = await getActiveOpenClawProviders();

  for (const provider of providers) {
    // Sync check: If it's a custom/OAuth provider and it no longer exists in OpenClaw config
    // (e.g. wiped by Gateway due to missing plugin, or manually deleted by user)
    // we should remove it from ClawX UI to stay consistent.
    const isBuiltin = BUILTIN_PROVIDER_TYPES.includes(provider.type);
    // For custom/ollama providers, the OpenClaw config key is derived as
    // "<type>-<suffix>" where suffix = first 8 chars of providerId with hyphens stripped.
    // e.g. provider.id "custom-a1b2c3d4-..." → strip hyphens → "customa1b2c3d4..." → slice(0,8) → "customa1"
    // → openClawKey = "custom-customa1"
    // This must match getOpenClawProviderKey() in ipc-handlers.ts exactly.
    const openClawKey = (provider.type === 'custom' || provider.type === 'ollama')
      ? `${provider.type}-${provider.id.replace(/-/g, '').slice(0, 8)}`
      : provider.type === 'minimax-portal-cn' ? 'minimax-portal' : provider.type;
    if (!isBuiltin && !activeOpenClawProviders.has(provider.type) && !activeOpenClawProviders.has(provider.id) && !activeOpenClawProviders.has(openClawKey)) {
      console.log(`[Sync] Provider ${provider.id} (${provider.type}) missing from OpenClaw, dropping from ClawX UI`);
      await deleteProvider(provider.id);
      continue;
    }

    const apiKey = await getApiKey(provider.id);
    let keyMasked: string | null = null;

    if (apiKey) {
      if (apiKey.length > 12) {
        keyMasked = `${apiKey.substring(0, 4)}${'*'.repeat(apiKey.length - 8)}${apiKey.substring(apiKey.length - 4)}`;
      } else {
        keyMasked = '*'.repeat(apiKey.length);
      }
    }

    results.push({
      ...provider,
      hasKey: !!apiKey,
      keyMasked,
    });
  }

  return results;
}
