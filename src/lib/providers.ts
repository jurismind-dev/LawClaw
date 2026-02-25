/**
 * Provider Types & UI Metadata - single source of truth for the frontend.
 *
 * NOTE: When adding a new provider type, also update
 * electron/utils/provider-registry.ts (env vars, models, configs).
 */

export const PROVIDER_TYPES = [
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
  'custom',
] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderWithKeyInfo extends ProviderConfig {
  hasKey: boolean;
  keyMasked: string | null;
}

export interface ProviderTypeInfo {
  id: ProviderType;
  name: string;
  icon: string;
  placeholder: string;
  /** Model brand name for display (e.g. "Claude", "GPT") */
  model?: string;
  requiresApiKey: boolean;
  /** Pre-filled base URL (for proxy/compatible providers like SiliconFlow) */
  defaultBaseUrl?: string;
  /** Whether the user can edit the base URL in setup */
  showBaseUrl?: boolean;
  /** Whether to show a Model ID input field (for providers where user picks the model) */
  showModelId?: boolean;
  /** Default / example model ID placeholder */
  modelIdPlaceholder?: string;
  /** Default model ID to pre-fill */
  defaultModelId?: string;
}

import { providerIcons } from '@/assets/providers';

/** All supported provider types with UI metadata */
export const PROVIDER_TYPE_INFO: ProviderTypeInfo[] = [
  { id: 'jurismind', name: 'Jurismind\uff08\u6cd5\u4e49\u7ecf\u7eac\uff09', icon: '\u2696\ufe0f', placeholder: 'API key...', model: 'Kimi', requiresApiKey: true, defaultBaseUrl: 'http://101.132.245.215:3001/v1', defaultModelId: 'kimi-k2.5' },
  { id: 'moonshot_code_plan', name: 'Kimi Coding\uff08\u5b98\u65b9\uff09', icon: '\ud83c\udf19', placeholder: 'sk-...', model: 'Kimi Coding', requiresApiKey: true, defaultBaseUrl: 'https://api.kimi.com/coding/v1', defaultModelId: 'kimi-coding/k2p5', showBaseUrl: false, showModelId: false },
  { id: 'glm_code_plan', name: 'GLM - Code Plan\uff08\u667a\u8c31-\u7f16\u7a0b\u5305\u6708\uff09', icon: '\ud83e\udde0', placeholder: 'Bearer token...', model: 'GLM Coding', requiresApiKey: true, defaultBaseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', defaultModelId: 'glm-4.7' },
  { id: 'anthropic', name: 'Anthropic', icon: '\ud83e\udd16', placeholder: 'sk-ant-api03-...', model: 'Claude', requiresApiKey: true },
  { id: 'openai', name: 'OpenAI', icon: '\ud83d\udc9a', placeholder: 'sk-proj-...', model: 'GPT', requiresApiKey: true },
  { id: 'google', name: 'Google', icon: '\ud83d\udd37', placeholder: 'AIza...', model: 'Gemini', requiresApiKey: true },
  { id: 'openrouter', name: 'OpenRouter', icon: '\ud83c\udf10', placeholder: 'sk-or-v1-...', model: 'Multi-Model', requiresApiKey: true },
  { id: 'moonshot', name: 'Moonshot (CN)', icon: '\ud83c\udf19', placeholder: 'sk-...', model: 'Kimi', requiresApiKey: true, defaultBaseUrl: 'https://api.moonshot.cn/v1', defaultModelId: 'kimi-k2.5' },
  { id: 'siliconflow', name: 'SiliconFlow (CN)', icon: '\ud83c\udf0a', placeholder: 'sk-...', model: 'Multi-Model', requiresApiKey: true, defaultBaseUrl: 'https://api.siliconflow.cn/v1', defaultModelId: 'Pro/moonshotai/Kimi-K2.5' },
  { id: 'ollama', name: 'Ollama', icon: '\ud83e\udd99', placeholder: 'Not required', requiresApiKey: false, defaultBaseUrl: 'http://localhost:11434', showBaseUrl: true, showModelId: true, modelIdPlaceholder: 'qwen3:latest' },
  { id: 'custom', name: 'Custom', icon: '\u2699\ufe0f', placeholder: 'API key...', requiresApiKey: true, showBaseUrl: true, showModelId: true, modelIdPlaceholder: 'your-provider/model-id' },
];

/** Get the SVG logo URL for a provider type, falls back to undefined */
export function getProviderIconUrl(type: ProviderType | string): string | undefined {
  return providerIcons[type];
}

/** Whether a provider's logo needs CSS invert in dark mode (all logos are monochrome) */
export function shouldInvertInDark(_type: ProviderType | string): boolean {
  return true;
}

/** Provider list shown in the Setup wizard */
export const SETUP_PROVIDERS = PROVIDER_TYPE_INFO;

/** Get type info by provider type id */
export function getProviderTypeInfo(type: ProviderType): ProviderTypeInfo | undefined {
  return PROVIDER_TYPE_INFO.find((t) => t.id === type);
}
