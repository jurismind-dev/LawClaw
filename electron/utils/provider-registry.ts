/**
 * Provider Registry - single source of truth for backend provider metadata.
 * Centralizes env var mappings, default models, and OpenClaw provider configs.
 *
 * NOTE: When adding a new provider type, also update src/lib/providers.ts
 */

export const BUILTIN_PROVIDER_TYPES = [
  'jurismind',
  'moonshot_code_plan',
  'glm_code_plan',
  'anthropic',
  'openai',
  'google',
  'openrouter',
  'moonshot',
  'siliconflow',
  'ollama',
] as const;
export type BuiltinProviderType = (typeof BUILTIN_PROVIDER_TYPES)[number];
export type ProviderType = BuiltinProviderType | 'custom';

interface ProviderModelEntry extends Record<string, unknown> {
  id: string;
  name: string;
}

interface ProviderBackendMeta {
  canonicalProviderId?: string;
  envVar?: string;
  defaultModel?: string;
  /** OpenClaw models.providers config (omit for built-in providers like anthropic) */
  providerConfig?: {
    baseUrl: string;
    api: string;
    apiKeyEnv: string;
    models?: ProviderModelEntry[];
  };
}

const REGISTRY: Record<string, ProviderBackendMeta> = {
  jurismind: {
    envVar: 'JURISMIND_API_KEY',
    defaultModel: 'jurismind/kimi-k2.5',
    providerConfig: {
      baseUrl: 'http://101.132.245.215:3001/v1',
      api: 'openai-completions',
      apiKeyEnv: 'JURISMIND_API_KEY',
    },
  },
  moonshot_code_plan: {
    canonicalProviderId: 'kimi-coding',
    envVar: 'KIMI_API_KEY',
    defaultModel: 'kimi-coding/k2p5',
    // kimi-coding is built-in to OpenClaw; do not write models.providers for it.
  },
  glm_code_plan: {
    envVar: 'GLM_CODE_PLAN_API_KEY',
    defaultModel: 'glm-4.7',
    providerConfig: {
      baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
      api: 'openai-completions',
      apiKeyEnv: 'GLM_CODE_PLAN_API_KEY',
    },
  },
  anthropic: {
    envVar: 'ANTHROPIC_API_KEY',
    defaultModel: 'anthropic/claude-opus-4-6',
    // anthropic is built-in to OpenClaw's model registry, no provider config needed
  },
  openai: {
    envVar: 'OPENAI_API_KEY',
    defaultModel: 'openai/gpt-5.2',
    providerConfig: {
      baseUrl: 'https://api.openai.com/v1',
      api: 'openai-responses',
      apiKeyEnv: 'OPENAI_API_KEY',
    },
  },
  google: {
    envVar: 'GEMINI_API_KEY',
    defaultModel: 'google/gemini-3-pro-preview',
    // google is built-in to OpenClaw's pi-ai catalog, no providerConfig needed.
    // Adding models.providers.google overrides the built-in and can break Gemini.
  },
  openrouter: {
    envVar: 'OPENROUTER_API_KEY',
    defaultModel: 'openrouter/anthropic/claude-opus-4.6',
    providerConfig: {
      baseUrl: 'https://openrouter.ai/api/v1',
      api: 'openai-completions',
      apiKeyEnv: 'OPENROUTER_API_KEY',
    },
  },
  moonshot: {
    envVar: 'MOONSHOT_API_KEY',
    defaultModel: 'moonshot/kimi-k2.5',
    providerConfig: {
      baseUrl: 'https://api.moonshot.cn/v1',
      api: 'openai-completions',
      apiKeyEnv: 'MOONSHOT_API_KEY',
      models: [
        {
          id: 'kimi-k2.5',
          name: 'Kimi K2.5',
          reasoning: false,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 256000,
          maxTokens: 8192,
        },
      ],
    },
  },
  siliconflow: {
    envVar: 'SILICONFLOW_API_KEY',
    defaultModel: 'siliconflow/deepseek-ai/DeepSeek-V3',
    providerConfig: {
      baseUrl: 'https://api.siliconflow.cn/v1',
      api: 'openai-completions',
      apiKeyEnv: 'SILICONFLOW_API_KEY',
    },
  },
  // Additional providers with env var mappings but no default model
  groq: { envVar: 'GROQ_API_KEY' },
  deepgram: { envVar: 'DEEPGRAM_API_KEY' },
  cerebras: { envVar: 'CEREBRAS_API_KEY' },
  xai: { envVar: 'XAI_API_KEY' },
  mistral: { envVar: 'MISTRAL_API_KEY' },
};

const PROVIDER_ALIASES: Record<string, string[]> = {
  'kimi-coding': ['moonshot_code_plan'],
  moonshot_code_plan: ['kimi-coding'],
};

/** Get the environment variable name for a provider type */
export function getProviderEnvVar(type: string): string | undefined {
  return REGISTRY[type]?.envVar;
}

/** Get the default model string for a provider type */
export function getProviderDefaultModel(type: string): string | undefined {
  return REGISTRY[type]?.defaultModel;
}

/** Get the OpenClaw provider config (baseUrl, api, apiKeyEnv, models) */
export function getProviderConfig(
  type: string
): { baseUrl: string; api: string; apiKeyEnv: string; models?: ProviderModelEntry[] } | undefined {
  return REGISTRY[type]?.providerConfig;
}

/** Resolve application provider type to OpenClaw canonical provider ID. */
export function getCanonicalProviderId(type: string): string {
  return REGISTRY[type]?.canonicalProviderId || type;
}

/** Return all alias IDs that should be treated as the same provider. */
export function getProviderAliasIds(type: string): string[] {
  const canonical = getCanonicalProviderId(type);
  return Array.from(
    new Set<string>([
      type,
      canonical,
      ...(PROVIDER_ALIASES[type] || []),
      ...(PROVIDER_ALIASES[canonical] || []),
    ])
  );
}

/**
 * All provider types that have env var mappings.
 * Used by GatewayManager to inject API keys as env vars.
 */
export function getKeyableProviderTypes(): string[] {
  return Object.entries(REGISTRY)
    .filter(([, meta]) => meta.envVar)
    .map(([type]) => type);
}
