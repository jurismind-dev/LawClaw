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

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.trunc(value);
  if (normalized <= 0) {
    return undefined;
  }

  return normalized;
}

function sanitizeEnumString(
  value: unknown,
  allowedValues: readonly string[],
  mappings: Record<string, string | undefined> = {}
): SanitizedFieldResult<string> {
  if (value === undefined) {
    return {
      value: undefined,
      changed: false,
    };
  }

  if (typeof value !== 'string') {
    return {
      value: undefined,
      changed: true,
    };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return {
      value: undefined,
      changed: true,
    };
  }

  const mapped = Object.prototype.hasOwnProperty.call(mappings, trimmed)
    ? mappings[trimmed]
    : trimmed;
  if (!mapped || !allowedValues.includes(mapped)) {
    return {
      value: undefined,
      changed: true,
    };
  }

  return {
    value: mapped,
    changed: mapped !== trimmed,
  };
}

const FEISHU_CONNECTION_MODE_VALUES = ['websocket', 'webhook'] as const;
const FEISHU_DM_POLICY_VALUES = ['open', 'pairing', 'allowlist'] as const;
const FEISHU_GROUP_POLICY_VALUES = ['open', 'allowlist', 'disabled'] as const;
const FEISHU_CHUNK_MODE_VALUES = ['length', 'newline'] as const;
const FEISHU_RENDER_MODE_VALUES = ['auto', 'raw', 'card'] as const;
const FEISHU_REPLY_IN_THREAD_VALUES = ['disabled', 'enabled'] as const;
const FEISHU_REACTION_NOTIFICATION_VALUES = ['off', 'own', 'all'] as const;
const FEISHU_GROUP_SESSION_SCOPE_VALUES = [
  'group',
  'group_sender',
  'group_topic',
  'group_topic_sender',
] as const;
const FEISHU_TOPIC_SESSION_MODE_VALUES = ['disabled', 'enabled'] as const;
const FEISHU_MARKDOWN_MODE_VALUES = ['native', 'escape', 'strip'] as const;
const FEISHU_MARKDOWN_TABLE_MODE_VALUES = ['native', 'ascii', 'simple'] as const;
const FEISHU_HEARTBEAT_VISIBILITY_VALUES = ['visible', 'hidden'] as const;

const FEISHU_GROUP_ALLOWED_KEYS = new Set([
  'requireMention',
  'tools',
  'skills',
  'enabled',
  'allowFrom',
  'systemPrompt',
  'groupSessionScope',
  'topicSessionMode',
  'replyInThread',
]);
const FEISHU_TOOL_POLICY_ALLOWED_KEYS = new Set(['allow', 'deny']);
const FEISHU_TOOLS_ALLOWED_KEYS = new Set(['doc', 'chat', 'wiki', 'drive', 'perm', 'scopes']);
const FEISHU_ACTIONS_ALLOWED_KEYS = new Set(['reactions']);
const FEISHU_BLOCK_STREAMING_COALESCE_ALLOWED_KEYS = new Set(['enabled', 'minDelayMs', 'maxDelayMs']);
const FEISHU_MARKDOWN_ALLOWED_KEYS = new Set(['mode', 'tableMode']);
const FEISHU_HEARTBEAT_ALLOWED_KEYS = new Set(['visibility', 'intervalMs']);
const FEISHU_DMS_ALLOWED_KEYS = new Set(['enabled', 'systemPrompt']);
const FEISHU_DYNAMIC_AGENT_CREATION_ALLOWED_KEYS = new Set([
  'enabled',
  'workspaceTemplate',
  'agentDirTemplate',
  'maxAgents',
]);
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
  'webhookHost',
  'webhookPort',
  'dmPolicy',
  'allowFrom',
  'groupPolicy',
  'groupAllowFrom',
  'groupSenderAllowFrom',
  'requireMention',
  'groups',
  'historyLimit',
  'dmHistoryLimit',
  'dms',
  'textChunkLimit',
  'chunkMode',
  'blockStreamingCoalesce',
  'mediaMaxMb',
  'httpTimeoutMs',
  'heartbeat',
  'renderMode',
  'streaming',
  'tools',
  'actions',
  'replyInThread',
  'markdown',
  'configWrites',
  'capabilities',
  'reactionNotifications',
  'typingIndicator',
  'resolveSenderNames',
  'groupSessionScope',
  'topicSessionMode',
]);
const FEISHU_CHANNEL_ALLOWED_KEYS = new Set([
  ...FEISHU_ACCOUNT_ALLOWED_KEYS,
  'defaultAccount',
  'dynamicAgentCreation',
  'accounts',
]);

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

function sanitizeFeishuBlockStreamingCoalesceConfig(
  value: unknown
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

  if (typeof source.enabled === 'boolean') {
    next.enabled = source.enabled;
  }
  const minDelayMs = readPositiveInteger(source.minDelayMs);
  if (minDelayMs !== undefined) {
    next.minDelayMs = minDelayMs;
    if (minDelayMs !== source.minDelayMs) {
      changed = true;
    }
  }
  const maxDelayMs = readPositiveInteger(source.maxDelayMs);
  if (maxDelayMs !== undefined) {
    next.maxDelayMs = maxDelayMs;
    if (maxDelayMs !== source.maxDelayMs) {
      changed = true;
    }
  }

  if (Object.keys(next).length === 0) {
    const legacyIdleMs = readPositiveInteger(source.idleMs);
    if (legacyIdleMs !== undefined) {
      return {
        value: {
          enabled: true,
          minDelayMs: legacyIdleMs,
          maxDelayMs: legacyIdleMs,
        },
        changed: true,
      };
    }
  }

  for (const key of Object.keys(source)) {
    if (!FEISHU_BLOCK_STREAMING_COALESCE_ALLOWED_KEYS.has(key)) {
      changed = true;
    }
  }

  return {
    value: Object.keys(next).length > 0 ? next : undefined,
    changed,
  };
}

function sanitizeFeishuMarkdownConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  const source = asObject(value);
  if (!source) {
    return {
      value: undefined,
      changed: value !== undefined,
    };
  }

  let changed = false;
  const next: JsonObject = {};

  const mode = sanitizeEnumString(source.mode, FEISHU_MARKDOWN_MODE_VALUES);
  if (mode.changed) {
    changed = true;
  }
  if (mode.value !== undefined) {
    next.mode = mode.value;
  }

  const tableMode = sanitizeEnumString(source.tableMode, FEISHU_MARKDOWN_TABLE_MODE_VALUES);
  if (tableMode.changed) {
    changed = true;
  }
  if (tableMode.value !== undefined) {
    next.tableMode = tableMode.value;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'tables')) {
    const mappedTableMode = sanitizeEnumString(
      typeof source.tables === 'string'
        ? ({
            off: 'native',
            bullets: 'simple',
            code: 'ascii',
          } as Record<string, string | undefined>)[source.tables.trim()]
        : undefined,
      FEISHU_MARKDOWN_TABLE_MODE_VALUES
    );
    changed = true;
    if (mappedTableMode.value !== undefined && next.tableMode === undefined) {
      next.tableMode = mappedTableMode.value;
    }
  }

  for (const key of Object.keys(source)) {
    if (key !== 'tables' && !FEISHU_MARKDOWN_ALLOWED_KEYS.has(key)) {
      changed = true;
    }
  }

  return {
    value: Object.keys(next).length > 0 ? next : undefined,
    changed,
  };
}

function sanitizeFeishuHeartbeatConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  const source = asObject(value);
  if (!source) {
    return {
      value: undefined,
      changed: value !== undefined,
    };
  }

  let changed = false;
  const next: JsonObject = {};

  const visibility = sanitizeEnumString(source.visibility, FEISHU_HEARTBEAT_VISIBILITY_VALUES);
  if (visibility.changed) {
    changed = true;
  }
  if (visibility.value !== undefined) {
    next.visibility = visibility.value;
  }

  const intervalMs = readPositiveInteger(source.intervalMs);
  if (intervalMs !== undefined) {
    next.intervalMs = intervalMs;
    if (intervalMs !== source.intervalMs) {
      changed = true;
    }
  } else if (Object.keys(next).length === 0) {
    const legacyEvery =
      typeof source.every === 'number'
        ? readPositiveInteger(source.every)
        : typeof source.every === 'string' && /^\d+$/.test(source.every.trim())
          ? readPositiveInteger(Number.parseInt(source.every.trim(), 10))
          : undefined;
    if (legacyEvery !== undefined) {
      next.intervalMs = legacyEvery;
      changed = true;
    }
  }

  for (const key of Object.keys(source)) {
    if (!FEISHU_HEARTBEAT_ALLOWED_KEYS.has(key)) {
      changed = true;
    }
  }

  return {
    value: Object.keys(next).length > 0 ? next : undefined,
    changed,
  };
}

function sanitizeFeishuCapabilitiesConfig(value: unknown): SanitizedFieldResult<string[]> {
  if (Array.isArray(value)) {
    const next = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return {
      value: next,
      changed: next.length !== value.length || next.some((item, index) => item !== value[index]),
    };
  }

  const source = asObject(value);
  if (!source) {
    return {
      value: undefined,
      changed: value !== undefined,
    };
  }

  const next = Object.entries(source)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key.trim())
    .filter((key) => key.length > 0);

  return {
    value: next.length > 0 ? next : undefined,
    changed: true,
  };
}

function sanitizeFeishuDmConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_DMS_ALLOWED_KEYS);
}

function sanitizeFeishuDmsConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  const source = asObject(value);
  if (!source) {
    return {
      value: undefined,
      changed: value !== undefined,
    };
  }

  const looksLikeLegacySingleDmConfig = Object.keys(source).every((key) => FEISHU_DMS_ALLOWED_KEYS.has(key));
  if (looksLikeLegacySingleDmConfig) {
    return {
      value: undefined,
      changed: true,
    };
  }

  const sanitized = sanitizeNamedObjectMap(source, sanitizeFeishuDmConfig);
  const nextValue = sanitized.value && Object.keys(sanitized.value).length > 0
    ? sanitized.value
    : undefined;

  return {
    value: nextValue,
    changed: sanitized.changed || nextValue === undefined,
  };
}

function sanitizeFeishuToolsConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_TOOLS_ALLOWED_KEYS);
}

function sanitizeFeishuActionsConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_ACTIONS_ALLOWED_KEYS);
}

function sanitizeFeishuDynamicAgentCreationConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_DYNAMIC_AGENT_CREATION_ALLOWED_KEYS);
}

function sanitizeFeishuConnectionModeConfig(value: unknown): SanitizedFieldResult<string> {
  return sanitizeEnumString(value, FEISHU_CONNECTION_MODE_VALUES);
}

function sanitizeFeishuDmPolicyConfig(value: unknown): SanitizedFieldResult<string> {
  return sanitizeEnumString(value, FEISHU_DM_POLICY_VALUES, {
    disabled: 'allowlist',
  });
}

function sanitizeFeishuGroupPolicyConfig(value: unknown): SanitizedFieldResult<string> {
  return sanitizeEnumString(value, FEISHU_GROUP_POLICY_VALUES, {
    allowall: 'open',
  });
}

function sanitizeFeishuChunkModeConfig(value: unknown): SanitizedFieldResult<string> {
  return sanitizeEnumString(value, FEISHU_CHUNK_MODE_VALUES, {
    paragraph: 'newline',
  });
}

function sanitizeFeishuRenderModeConfig(value: unknown): SanitizedFieldResult<string> {
  return sanitizeEnumString(value, FEISHU_RENDER_MODE_VALUES);
}

function sanitizeFeishuReplyInThreadConfig(value: unknown): SanitizedFieldResult<string> {
  return sanitizeEnumString(value, FEISHU_REPLY_IN_THREAD_VALUES);
}

function sanitizeFeishuReactionNotificationsConfig(value: unknown): SanitizedFieldResult<string> {
  return sanitizeEnumString(value, FEISHU_REACTION_NOTIFICATION_VALUES);
}

function sanitizeFeishuGroupSessionScopeConfig(value: unknown): SanitizedFieldResult<string> {
  return sanitizeEnumString(value, FEISHU_GROUP_SESSION_SCOPE_VALUES);
}

function sanitizeFeishuTopicSessionModeConfig(value: unknown): SanitizedFieldResult<string> {
  return sanitizeEnumString(value, FEISHU_TOPIC_SESSION_MODE_VALUES);
}

function sanitizeFeishuGroupConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_GROUP_ALLOWED_KEYS, {
    tools: sanitizeFeishuToolPolicyConfig,
    groupSessionScope: sanitizeFeishuGroupSessionScopeConfig,
    topicSessionMode: sanitizeFeishuTopicSessionModeConfig,
    replyInThread: sanitizeFeishuReplyInThreadConfig,
  });
}

function sanitizeFeishuAccountConfig(value: unknown): SanitizedFieldResult<JsonObject> {
  return sanitizeJsonObjectShape(value, FEISHU_ACCOUNT_ALLOWED_KEYS, {
    connectionMode: sanitizeFeishuConnectionModeConfig,
    dmPolicy: sanitizeFeishuDmPolicyConfig,
    groupPolicy: sanitizeFeishuGroupPolicyConfig,
    groups: (entry) => sanitizeNamedObjectMap(entry, sanitizeFeishuGroupConfig),
    dms: sanitizeFeishuDmsConfig,
    blockStreamingCoalesce: sanitizeFeishuBlockStreamingCoalesceConfig,
    heartbeat: sanitizeFeishuHeartbeatConfig,
    chunkMode: sanitizeFeishuChunkModeConfig,
    renderMode: sanitizeFeishuRenderModeConfig,
    tools: sanitizeFeishuToolsConfig,
    actions: sanitizeFeishuActionsConfig,
    replyInThread: sanitizeFeishuReplyInThreadConfig,
    markdown: sanitizeFeishuMarkdownConfig,
    capabilities: sanitizeFeishuCapabilitiesConfig,
    reactionNotifications: sanitizeFeishuReactionNotificationsConfig,
    groupSessionScope: sanitizeFeishuGroupSessionScopeConfig,
    topicSessionMode: sanitizeFeishuTopicSessionModeConfig,
  });
}

export function sanitizeFeishuChannelConfigShape(
  channelConfig: JsonObject | undefined
): { config: JsonObject; changed: boolean } {
  const sanitized = sanitizeJsonObjectShape(channelConfig, FEISHU_CHANNEL_ALLOWED_KEYS, {
    connectionMode: sanitizeFeishuConnectionModeConfig,
    dmPolicy: sanitizeFeishuDmPolicyConfig,
    groupPolicy: sanitizeFeishuGroupPolicyConfig,
    groups: (entry) => sanitizeNamedObjectMap(entry, sanitizeFeishuGroupConfig),
    dms: sanitizeFeishuDmsConfig,
    blockStreamingCoalesce: sanitizeFeishuBlockStreamingCoalesceConfig,
    heartbeat: sanitizeFeishuHeartbeatConfig,
    chunkMode: sanitizeFeishuChunkModeConfig,
    renderMode: sanitizeFeishuRenderModeConfig,
    tools: sanitizeFeishuToolsConfig,
    actions: sanitizeFeishuActionsConfig,
    replyInThread: sanitizeFeishuReplyInThreadConfig,
    markdown: sanitizeFeishuMarkdownConfig,
    capabilities: sanitizeFeishuCapabilitiesConfig,
    reactionNotifications: sanitizeFeishuReactionNotificationsConfig,
    groupSessionScope: sanitizeFeishuGroupSessionScopeConfig,
    topicSessionMode: sanitizeFeishuTopicSessionModeConfig,
    dynamicAgentCreation: sanitizeFeishuDynamicAgentCreationConfig,
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
  if (Object.keys(accounts).length === 0) {
    return {
      config: nextConfig,
      changed: sanitized.changed,
    };
  }

  let changed = sanitized.changed;
  const primaryAccountId = resolvePrimaryFeishuAccountId(rawConfig, accounts);
  const primaryAccount = primaryAccountId ? asObject(accounts[primaryAccountId]) : null;
  if (primaryAccount) {
    for (const [key, value] of Object.entries(primaryAccount)) {
      if (nextConfig[key] === undefined) {
        nextConfig[key] = value;
        changed = true;
      }
    }
  }

  return {
    config: nextConfig,
    changed,
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

  const nextConfig: JsonObject = {
    ...source,
    streaming: readBooleanWithFallback(source.streaming, fallback.streaming, true),
    requireMention: readBooleanWithFallback(source.requireMention, fallback.requireMention, true),
    typingIndicator: readBooleanWithFallback(source.typingIndicator, fallback.typingIndicator, true),
    resolveSenderNames: readBooleanWithFallback(
      source.resolveSenderNames,
      fallback.resolveSenderNames,
      true
    ),
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
  } else if (isManualCredentialBinding) {
    // Feishu open_id values are app-scoped. Reusing an allowlist from a
    // previously bound app would silently block all DMs after switching apps.
    // LawClaw's "bind existing app" flow should always land on an open DM
    // policy, because the user has not completed an in-channel pairing step.
    dmPolicy = 'open';
    allowFrom = ['*'];
    if (appChanged) {
      groupAllowFrom = [];
    }
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
