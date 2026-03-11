export type JsonObject = Record<string, unknown>;

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
