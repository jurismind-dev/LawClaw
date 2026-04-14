export type JsonObject = Record<string, unknown>;

const FEISHU_OFFICIAL_PLUGIN_ID = 'openclaw-lark';
const FEISHU_CONFLICT_PLUGIN_IDS = [
  'feishu',
  'feishu-openclaw-plugin',
  'openclaw-lark',
  '@larksuite/openclaw-lark',
];

export interface ApplyFeishuChannelDefaultsOptions {
  fallbackConfig?: JsonObject;
  seedDisabledWhenEmpty?: boolean;
}

interface SanitizedFieldResult<T = unknown> {
  value: T | undefined;
  changed: boolean;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function readBooleanWithFallback(
  value: unknown,
  fallbackValue: unknown,
  defaultValue: boolean
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof fallbackValue === 'boolean') {
    return fallbackValue;
  }
  return defaultValue;
}

function readStringWithFallback(value: unknown, fallbackValue: unknown, defaultValue: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof fallbackValue === 'string' && fallbackValue.trim()) {
    return fallbackValue.trim();
  }
  return defaultValue;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const FEISHU_GROUP_ALLOWED_KEYS = new Set([
  'groupPolicy',
  'requireMention',
  'tools',
  'skills',
  'enabled',
  'allowFrom',
  'systemPrompt',
]);
const FEISHU_TOOL_POLICY_ALLOWED_KEYS = new Set(['allow', 'deny']);
const FEISHU_TOOLS_ALLOWED_KEYS = new Set(['doc', 'wiki', 'drive', 'perm', 'scopes']);
const FEISHU_FOOTER_ALLOWED_KEYS = new Set(['status', 'elapsed']);
const FEISHU_BLOCK_STREAMING_COALESCE_ALLOWED_KEYS = new Set(['minChars', 'maxChars', 'idleMs']);
const FEISHU_MARKDOWN_ALLOWED_KEYS = new Set(['tables']);
const FEISHU_HEARTBEAT_ALLOWED_KEYS = new Set([
  'every',
  'activeHours',
  'target',
  'to',
  'prompt',
  'accountId',
]);
const FEISHU_HEARTBEAT_ACTIVE_HOURS_ALLOWED_KEYS = new Set(['start', 'end', 'timezone']);
const FEISHU_CAPABILITIES_ALLOWED_KEYS = new Set(['image', 'audio', 'video']);
const FEISHU_DEDUP_ALLOWED_KEYS = new Set(['ttlMs', 'maxEntries']);
const FEISHU_UAT_ALLOWED_KEYS = new Set(['enabled', 'allowedScopes', 'blockedScopes']);
const FEISHU_DMS_ALLOWED_KEYS = new Set(['historyLimit']);
const FEISHU_REPLY_MODE_ALLOWED_KEYS = new Set(['default', 'group', 'direct']);
const FEISHU_ACCOUNT_ALLOWED_KEYS = new Set([
  'appId',
  'appSecret',
  'encryptKey',
  'verificationToken',
  'name',
  'enabled',
  'domain',
  'connectionMode',
  'webhookPath',
  'webhookPort',
  'dmPolicy',
  'allowFrom',
  'groupPolicy',
  'groupAllowFrom',
  'requireMention',
  'groups',
  'historyLimit',
  'dmHistoryLimit',
  'dms',
  'textChunkLimit',
  'chunkMode',
  'blockStreamingCoalesce',
  'mediaMaxMb',
  'heartbeat',
  'replyMode',
  'streaming',
  'blockStreaming',
  'tools',
  'footer',
  'markdown',
  'configWrites',
  'capabilities',
  'dedup',
  'reactionNotifications',
  'threadSession',
  'uat',
]);
const FEISHU_CHANNEL_ALLOWED_KEYS = new Set([...FEISHU_ACCOUNT_ALLOWED_KEYS, 'accounts']);

function sanitizeJsonObjectShape(
  value: unknown,
  allowedKeys: Set<string>,
  nestedSanitizers: Record<string, (value: unknown) => SanitizedFieldResult<unknown>> = {}
): SanitizedFieldResult<JsonObject> {
  const source = asObject(value);
  if (!source) {
    return {
      value: undefined,
      changed: value !== undefined,
    };
  }

  let changed = false;
  const next: JsonObject = {};

  for (const [key, rawValue] of Object.entries(source)) {
    if (!allowedKeys.has(key)) {
      changed = true;
      continue;
    }

    const sanitizeNestedValue = nestedSanitizers[key];
    if (!sanitizeNestedValue) {
      next[key] = rawValue;
      continue;
    }

    const sanitized = sanitizeNestedValue(rawValue);
    if (sanitized.changed) {
      changed = true;
    }
    if (sanitized.value !== undefined) {
      next[key] = sanitized.value;
    } else {
      changed = true;
    }
  }

  return {
    value: next,
    changed,
  };
}

function sanitizeNamedObjectMap(
  value: unknown,
  itemSanitizer: (value: unknown) => SanitizedFieldResult<JsonObject>
): SanitizedFieldResult<JsonObject> {
  const source = asObject(value);
  if (!source) {
    return {
      value: undefined,
      changed: value !== undefined,
    };
  }

  let changed = false;
  const next: JsonObject = {};

  for (const [key, entry] of Object.entries(source)) {
    const sanitized = itemSanitizer(entry);
    if (sanitized.changed) {
      changed = true;
    }
    if (sanitized.value !== undefined) {
      next[key] = sanitized.value;
    } else {
      changed = true;
    }
  }

  return {
    value: next,
    changed,
  };
}

function sanitizeFeishuToolPolicyConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_TOOL_POLICY_ALLOWED_KEYS);
}

function sanitizeFeishuFooterConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_FOOTER_ALLOWED_KEYS);
}

function sanitizeFeishuBlockStreamingCoalesceConfig(
  value: unknown
): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_BLOCK_STREAMING_COALESCE_ALLOWED_KEYS);
}

function sanitizeFeishuMarkdownConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_MARKDOWN_ALLOWED_KEYS);
}

function sanitizeFeishuHeartbeatActiveHoursConfig(
  value: unknown
): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_HEARTBEAT_ACTIVE_HOURS_ALLOWED_KEYS);
}

function sanitizeFeishuHeartbeatConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_HEARTBEAT_ALLOWED_KEYS, {
    activeHours: sanitizeFeishuHeartbeatActiveHoursConfig,
  });
}

function sanitizeFeishuCapabilitiesConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_CAPABILITIES_ALLOWED_KEYS);
}

function sanitizeFeishuDedupConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_DEDUP_ALLOWED_KEYS);
}

function sanitizeFeishuUatConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_UAT_ALLOWED_KEYS);
}

function sanitizeFeishuDmsConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_DMS_ALLOWED_KEYS);
}

function sanitizeFeishuReplyModeConfig(value: unknown): SanitizedFieldResult<unknown> {
  if (typeof value === 'string') {
    return {
      value,
      changed: false,
    };
  }

  return sanitizeJsonObjectShape(value, FEISHU_REPLY_MODE_ALLOWED_KEYS);
}

function sanitizeFeishuToolsConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_TOOLS_ALLOWED_KEYS);
}

function sanitizeFeishuGroupConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_GROUP_ALLOWED_KEYS, {
    tools: sanitizeFeishuToolPolicyConfig,
  });
}

function sanitizeFeishuAccountConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_ACCOUNT_ALLOWED_KEYS, {
    groups: (entry) => sanitizeNamedObjectMap(entry, sanitizeFeishuGroupConfig),
    dms: sanitizeFeishuDmsConfig,
    blockStreamingCoalesce: sanitizeFeishuBlockStreamingCoalesceConfig,
    heartbeat: sanitizeFeishuHeartbeatConfig,
    replyMode: sanitizeFeishuReplyModeConfig,
    tools: sanitizeFeishuToolsConfig,
    footer: sanitizeFeishuFooterConfig,
    markdown: sanitizeFeishuMarkdownConfig,
    capabilities: sanitizeFeishuCapabilitiesConfig,
    dedup: sanitizeFeishuDedupConfig,
    uat: sanitizeFeishuUatConfig,
  });
}

export function sanitizeFeishuChannelConfigShape(
  channelConfig: JsonObject | undefined
): { config: JsonObject; changed: boolean } {
  const sanitized = sanitizeJsonObjectShape(channelConfig, FEISHU_CHANNEL_ALLOWED_KEYS, {
    groups: (entry) => sanitizeNamedObjectMap(entry, sanitizeFeishuGroupConfig),
    dms: sanitizeFeishuDmsConfig,
    blockStreamingCoalesce: sanitizeFeishuBlockStreamingCoalesceConfig,
    heartbeat: sanitizeFeishuHeartbeatConfig,
    replyMode: sanitizeFeishuReplyModeConfig,
    tools: sanitizeFeishuToolsConfig,
    footer: sanitizeFeishuFooterConfig,
    markdown: sanitizeFeishuMarkdownConfig,
    capabilities: sanitizeFeishuCapabilitiesConfig,
    dedup: sanitizeFeishuDedupConfig,
    uat: sanitizeFeishuUatConfig,
    accounts: (entry) => sanitizeNamedObjectMap(entry, sanitizeFeishuAccountConfig),
  });

  return {
    config: sanitized.value || {},
    changed: sanitized.changed,
  };
}

function hasConfiguredFeishuCredentials(config: JsonObject): boolean {
  return hasNonEmptyString(config.appId) && hasNonEmptyString(config.appSecret);
}

function resolvePrimaryFeishuAccountId(rawConfig: JsonObject, accounts: JsonObject): string | undefined {
  const preferredAccountId = hasNonEmptyString(rawConfig.defaultAccount) ? rawConfig.defaultAccount.trim() : '';
  if (preferredAccountId && asObject(accounts[preferredAccountId])) {
    return preferredAccountId;
  }

  if (asObject(accounts.default)) {
    return 'default';
  }

  for (const [accountId, rawAccount] of Object.entries(accounts)) {
    const account = asObject(rawAccount);
    if (account && hasConfiguredFeishuCredentials(account)) {
      return accountId;
    }
  }

  return Object.keys(accounts)[0];
}

export function stabilizeFeishuChannelConfig(
  channelConfig: JsonObject | undefined
): { config: JsonObject; changed: boolean } {
  const rawConfig = asObject(channelConfig) || {};
  const sanitized = sanitizeFeishuChannelConfigShape(rawConfig);
  const nextConfig: JsonObject = { ...sanitized.config };
  const accounts = asObject(nextConfig.accounts) || {};
  const hasLegacyDefaultAccount = Object.prototype.hasOwnProperty.call(rawConfig, 'defaultAccount');
  const shouldCollapseAccounts =
    hasLegacyDefaultAccount
    || (!hasConfiguredFeishuCredentials(nextConfig) && Object.keys(accounts).length > 0);

  if (!shouldCollapseAccounts || Object.keys(accounts).length === 0) {
    return {
      config: nextConfig,
      changed: sanitized.changed,
    };
  }

  const primaryAccountId = resolvePrimaryFeishuAccountId(rawConfig, accounts);
  const primaryAccount = primaryAccountId ? asObject(accounts[primaryAccountId]) : null;
  if (primaryAccount) {
    for (const [key, value] of Object.entries(primaryAccount)) {
      if (nextConfig[key] === undefined) {
        nextConfig[key] = value;
      }
    }
  }

  delete nextConfig.accounts;

  return {
    config: nextConfig,
    changed: true,
  };
}

export interface FeishuOfficialCredentials {
  appId: string;
  appSecret: string;
  openId?: string | null;
}

export interface FinalizeFeishuOfficialPluginConfigOptions {
  credentials?: FeishuOfficialCredentials;
  seedDisabledWhenEmpty?: boolean;
}

export function applyFeishuChannelDefaults(
  channelConfig: JsonObject | undefined,
  options: ApplyFeishuChannelDefaultsOptions = {}
): { config: JsonObject; changed: boolean } {
  const sourceSanitized = stabilizeFeishuChannelConfig(asObject(channelConfig) || {});
  const fallbackSanitized = stabilizeFeishuChannelConfig(asObject(options.fallbackConfig) || {});
  const source = sourceSanitized.config;
  const fallback = fallbackSanitized.config;

  const sourceFooter = asObject(source.footer) || {};
  const fallbackFooter = asObject(fallback.footer) || {};

  const nextConfig: JsonObject = {
    ...source,
    streaming: readBooleanWithFallback(source.streaming, fallback.streaming, true),
    footer: {
      ...fallbackFooter,
      ...sourceFooter,
      elapsed: readBooleanWithFallback(sourceFooter.elapsed, fallbackFooter.elapsed, true),
      status: readBooleanWithFallback(sourceFooter.status, fallbackFooter.status, true),
    },
    threadSession: readBooleanWithFallback(source.threadSession, fallback.threadSession, true),
    requireMention: readBooleanWithFallback(source.requireMention, fallback.requireMention, true),
  };

  if (
    options.seedDisabledWhenEmpty
    && typeof source.enabled !== 'boolean'
    && Object.keys(source).length === 0
  ) {
    nextConfig.enabled = false;
  }

  return {
    config: nextConfig,
    changed:
      sourceSanitized.changed
      || fallbackSanitized.changed
      || JSON.stringify(source) !== JSON.stringify(nextConfig),
  };
}

export function finalizeFeishuOfficialPluginConfig(
  config: JsonObject,
  options: FinalizeFeishuOfficialPluginConfigOptions = {}
): { config: JsonObject; changed: boolean } {
  const source = asObject(config) || {};
  const plugins = asObject(source.plugins) || {};
  const channels = asObject(source.channels) || {};
  const entries = asObject(plugins.entries) || {};
  const existingChannel = stabilizeFeishuChannelConfig(asObject(channels.feishu) || {}).config;
  const credentials = options.credentials;

  const allow = Array.isArray(plugins.allow)
    ? plugins.allow.filter((item): item is string => typeof item === 'string')
    : [];

  const nextAllow = allow.filter((item) => !FEISHU_CONFLICT_PLUGIN_IDS.includes(item));
  if (!nextAllow.includes(FEISHU_OFFICIAL_PLUGIN_ID)) {
    nextAllow.push(FEISHU_OFFICIAL_PLUGIN_ID);
  }

  const nextEntries: JsonObject = { ...entries };
  nextEntries[FEISHU_OFFICIAL_PLUGIN_ID] = {
    ...(asObject(entries[FEISHU_OFFICIAL_PLUGIN_ID]) || {}),
    enabled: true,
  };
  nextEntries.feishu = {
    ...(asObject(entries.feishu) || {}),
    enabled: false,
  };
  delete nextEntries['feishu-openclaw-plugin'];
  delete nextEntries['@larksuite/openclaw-lark'];

  let allowFrom = normalizeStringArray(existingChannel.allowFrom);
  let groupAllowFrom = normalizeStringArray(existingChannel.groupAllowFrom);
  let dmPolicy = readStringWithFallback(existingChannel.dmPolicy, undefined, 'pairing');
  const existingAppId = readStringWithFallback(existingChannel.appId, undefined, '');
  const isManualCredentialBinding = Boolean(credentials && !credentials.openId);
  const appChanged = Boolean(
    credentials?.appId.trim()
    && existingAppId
    && existingAppId !== credentials.appId.trim()
  );

  if (credentials?.openId) {
    dmPolicy = 'allowlist';
    allowFrom = allowFrom.filter((item) => item !== '*');
    allowFrom.push(credentials.openId);
  } else if (isManualCredentialBinding && appChanged) {
    // Feishu open_id values are app-scoped. Reusing an allowlist from a
    // previously bound app would silently block all DMs after switching apps.
    dmPolicy = 'open';
    allowFrom = ['*'];
    groupAllowFrom = [];
  } else if (dmPolicy === 'open' && !allowFrom.includes('*')) {
    allowFrom.push('*');
  }

  const seededChannel: JsonObject = {
    ...existingChannel,
    domain: readStringWithFallback(existingChannel.domain, undefined, 'feishu'),
    connectionMode: readStringWithFallback(existingChannel.connectionMode, undefined, 'websocket'),
    dmPolicy,
    groupPolicy: readStringWithFallback(existingChannel.groupPolicy, undefined, 'open'),
    allowFrom: dedupeStrings(allowFrom),
    groupAllowFrom: dedupeStrings(groupAllowFrom),
  };

  if (credentials) {
    seededChannel.appId = credentials.appId;
    seededChannel.appSecret = credentials.appSecret;
    seededChannel.enabled = true;
  } else if (
    options.seedDisabledWhenEmpty &&
    typeof existingChannel.enabled !== 'boolean' &&
    Object.keys(existingChannel).length === 0
  ) {
    seededChannel.enabled = false;
  }

  const channelDefaults = applyFeishuChannelDefaults(seededChannel, {
    fallbackConfig: existingChannel,
    seedDisabledWhenEmpty: options.seedDisabledWhenEmpty,
  });
  const sanitizedChannelDefaults = sanitizeFeishuChannelConfigShape(channelDefaults.config);

  const nextConfig: JsonObject = {
    ...source,
    channels: {
      ...channels,
      feishu: sanitizedChannelDefaults.config,
    },
    plugins: {
      ...plugins,
      allow: nextAllow,
      entries: nextEntries,
    },
  };

  return {
    config: nextConfig,
    changed: JSON.stringify(source) !== JSON.stringify(nextConfig),
  };
}
