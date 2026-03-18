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
  const source = asObject(channelConfig) || {};
  const fallback = asObject(options.fallbackConfig) || {};

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
    changed: JSON.stringify(source) !== JSON.stringify(nextConfig),
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
  const existingChannel = asObject(channels.feishu) || {};
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

  const nextConfig: JsonObject = {
    ...source,
    channels: {
      ...channels,
      feishu: channelDefaults.config,
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
