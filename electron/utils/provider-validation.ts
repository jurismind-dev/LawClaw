export type ValidationProfile =
  | 'openai-compatible'
  | 'google-query-key'
  | 'anthropic-header'
  | 'openrouter'
  | 'kimi-coding'
  | 'none';

const KIMI_CODING_DEFAULT_BASE_URL = 'https://api.kimi.com/coding/v1';
const NON_JSON_SUCCESS_ERROR =
  'Base URL may not be an API endpoint (possibly missing "/v1").';

interface AuthResponseClassifyOptions {
  contentType?: string | null;
  requireJsonBodyOnSuccess?: boolean;
}

/**
 * Validate API key using lightweight model-listing endpoints (zero token cost).
 * Providers are grouped by auth style.
 */
export async function validateApiKeyWithProvider(
  providerType: string,
  apiKey: string,
  options?: { baseUrl?: string }
): Promise<{ valid: boolean; error?: string }> {
  const profile = getValidationProfile(providerType);
  if (profile === 'none') {
    return { valid: true };
  }

  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return { valid: false, error: 'API key is required' };
  }

  try {
    switch (profile) {
      case 'openai-compatible':
        return await validateOpenAiCompatibleKey(providerType, trimmedKey, options?.baseUrl);
      case 'google-query-key':
        return await validateGoogleQueryKey(providerType, trimmedKey, options?.baseUrl);
      case 'anthropic-header':
        return await validateAnthropicHeaderKey(providerType, trimmedKey, options?.baseUrl);
      case 'openrouter':
        return await validateOpenRouterKey(providerType, trimmedKey);
      case 'kimi-coding':
        return await validateKimiCodingKey(providerType, trimmedKey, options?.baseUrl);
      default:
        return { valid: false, error: `Unsupported validation profile for provider: ${providerType}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { valid: false, error: errorMessage };
  }
}

function logValidationStatus(provider: string, status: number): void {
  console.log(`[clawx-validate] ${provider} HTTP ${status}`);
}

function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return `${secret.slice(0, 2)}***`;
  return `${secret.slice(0, 4)}***${secret.slice(-4)}`;
}

function sanitizeValidationUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const key = url.searchParams.get('key');
    if (key) url.searchParams.set('key', maskSecret(key));
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const next = { ...headers };
  if (next.Authorization?.startsWith('Bearer ')) {
    const token = next.Authorization.slice('Bearer '.length);
    next.Authorization = `Bearer ${maskSecret(token)}`;
  }
  if (next['x-api-key']) {
    next['x-api-key'] = maskSecret(next['x-api-key']);
  }
  return next;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function buildOpenAiModelsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/models?limit=1`;
}

function logValidationRequest(
  provider: string,
  method: string,
  url: string,
  headers: Record<string, string>
): void {
  console.log(
    `[clawx-validate] ${provider} request ${method} ${sanitizeValidationUrl(url)} headers=${JSON.stringify(sanitizeHeaders(headers))}`
  );
}

export function getValidationProfile(providerType: string): ValidationProfile {
  switch (providerType) {
    case 'anthropic':
      return 'anthropic-header';
    case 'google':
      return 'google-query-key';
    case 'openrouter':
      return 'openrouter';
    case 'ollama':
      return 'none';
    case 'moonshot_code_plan':
      return 'kimi-coding';
    default:
      return 'openai-compatible';
  }
}

async function performProviderValidationRequest(
  providerLabel: string,
  url: string,
  headers: Record<string, string>,
  options?: AuthResponseClassifyOptions
): Promise<{ valid: boolean; error?: string }> {
  try {
    logValidationRequest(providerLabel, 'GET', url, headers);
    const response = await fetch(url, { headers });
    logValidationStatus(providerLabel, response.status);
    const data = await response.json().catch(() => ({}));
    return classifyAuthResponse(response.status, data, {
      contentType: response.headers.get('content-type'),
      requireJsonBodyOnSuccess: options?.requireJsonBodyOnSuccess,
    });
  } catch (error) {
    return {
      valid: false,
      error: `Connection error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Helper: classify an HTTP response as valid / invalid / error.
 * 2xx / 429 -> valid.
 * 401 / 403 -> invalid.
 * Everything else -> provider error.
 */
export function classifyAuthResponse(
  status: number,
  data: unknown,
  options?: AuthResponseClassifyOptions
): { valid: boolean; error?: string } {
  if (status >= 200 && status < 300) {
    if (options?.requireJsonBodyOnSuccess && !isJsonContentType(options.contentType)) {
      return { valid: false, error: NON_JSON_SUCCESS_ERROR };
    }
    return { valid: true };
  }
  if (status === 429) return { valid: true };
  if (status === 401 || status === 403) return { valid: false, error: 'Invalid API key' };

  const obj = data as { error?: { message?: string }; message?: string } | null;
  const msg = obj?.error?.message || obj?.message || `API error: ${status}`;
  return { valid: false, error: msg };
}

export function isJsonContentType(contentType?: string | null): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase();
  return normalized.includes('/json') || normalized.includes('+json');
}

export function shouldFallbackToChatCompletions(result: {
  valid: boolean;
  error?: string;
}): boolean {
  return result.valid === false && Boolean(result.error?.includes('API error: 404'));
}

export function classifyChatCompletionsProbeResponse(
  status: number,
  data: unknown,
  options?: AuthResponseClassifyOptions
): { valid: boolean; error?: string } {
  if (status === 401 || status === 403) {
    return { valid: false, error: 'Invalid API key' };
  }

  if (status === 400 || status === 429) {
    return { valid: true };
  }

  return classifyAuthResponse(status, data, options);
}

async function validateOpenAiCompatibleKey(
  providerType: string,
  apiKey: string,
  baseUrl?: string
): Promise<{ valid: boolean; error?: string }> {
  const trimmedBaseUrl = baseUrl?.trim();
  if (!trimmedBaseUrl) {
    return { valid: false, error: `Base URL is required for provider "${providerType}" validation` };
  }

  const headers = { Authorization: `Bearer ${apiKey}` };

  const modelsUrl = buildOpenAiModelsUrl(trimmedBaseUrl);
  try {
    logValidationRequest(providerType, 'GET', modelsUrl, headers);
    const response = await fetch(modelsUrl, { headers });
    logValidationStatus(providerType, response.status);
    const data = await response.json().catch(() => ({}));
    const modelsResult = classifyAuthResponse(response.status, data, {
      contentType: response.headers.get('content-type'),
      requireJsonBodyOnSuccess: true,
    });

    // Some OpenAI-compatible services do not implement /models.
    // Jurismind may also reject /models while accepting /chat/completions.
    if (
      shouldFallbackToChatCompletions(modelsResult)
      || shouldFallbackToChatCompletionsForProvider(providerType, response.status, modelsResult.error)
    ) {
      console.log(
        `[clawx-validate] ${providerType} /models returned ${response.status}, falling back to /chat/completions probe`
      );
      const base = normalizeBaseUrl(trimmedBaseUrl);
      const chatUrl = `${base}/chat/completions`;
      return await performChatCompletionsProbe(providerType, chatUrl, headers);
    }

    return modelsResult;
  } catch (error) {
    return {
      valid: false,
      error: `Connection error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function shouldFallbackToChatCompletionsForProvider(
  providerType: string,
  status: number,
  error?: string
): boolean {
  if (providerType === 'jurismind') {
    return status === 401 || status === 403 || status === 405 || error === NON_JSON_SUCCESS_ERROR;
  }
  return false;
}

/**
 * Fallback validation: send a minimal /chat/completions request.
 * 200/400/429 -> valid, 401/403 -> invalid.
 */
async function performChatCompletionsProbe(
  providerLabel: string,
  url: string,
  headers: Record<string, string>
): Promise<{ valid: boolean; error?: string }> {
  try {
    logValidationRequest(providerLabel, 'POST', url, headers);
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'validation-probe',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    });

    logValidationStatus(providerLabel, response.status);
    const data = await response.json().catch(() => ({}));
    return classifyChatCompletionsProbeResponse(response.status, data, {
      contentType: response.headers.get('content-type'),
      requireJsonBodyOnSuccess: true,
    });
  } catch (error) {
    return {
      valid: false,
      error: `Connection error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function validateGoogleQueryKey(
  providerType: string,
  apiKey: string,
  baseUrl?: string
): Promise<{ valid: boolean; error?: string }> {
  const base = normalizeBaseUrl(baseUrl || 'https://generativelanguage.googleapis.com/v1beta');
  const url = `${base}/models?pageSize=1&key=${encodeURIComponent(apiKey)}`;
  return await performProviderValidationRequest(providerType, url, {});
}

async function validateAnthropicHeaderKey(
  providerType: string,
  apiKey: string,
  baseUrl?: string
): Promise<{ valid: boolean; error?: string }> {
  const base = normalizeBaseUrl(baseUrl || 'https://api.anthropic.com/v1');
  const url = `${base}/models?limit=1`;
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  return await performProviderValidationRequest(providerType, url, headers);
}

async function validateOpenRouterKey(
  providerType: string,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  const url = 'https://openrouter.ai/api/v1/auth/key';
  const headers = { Authorization: `Bearer ${apiKey}` };
  return await performProviderValidationRequest(providerType, url, headers);
}

/**
 * Kimi Coding validation uses dedicated models endpoint and strict status mapping.
 * 2xx / 429 -> valid, 401/403 -> invalid, others -> error.
 */
async function validateKimiCodingKey(
  providerType: string,
  apiKey: string,
  baseUrl?: string
): Promise<{ valid: boolean; error?: string }> {
  const base = normalizeBaseUrl(baseUrl || KIMI_CODING_DEFAULT_BASE_URL);
  const url = `${base}/models`;

  const headerVariants: Array<Record<string, string>> = [
    { Authorization: `Bearer ${apiKey}` },
    { 'x-api-key': apiKey },
  ];

  let sawAuthFailure = false;

  for (const headers of headerVariants) {
    try {
      logValidationRequest(providerType, 'GET', url, headers);
      const response = await fetch(url, { headers });
      logValidationStatus(providerType, response.status);
      const data = await response.json().catch(() => ({}));

      if ((response.status >= 200 && response.status < 300) || response.status === 429) {
        return { valid: true };
      }

      if (response.status === 401 || response.status === 403) {
        sawAuthFailure = true;
        continue;
      }

      return classifyAuthResponse(response.status, data);
    } catch (error) {
      return {
        valid: false,
        error: `Connection error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (sawAuthFailure) {
    return { valid: false, error: 'Invalid API key' };
  }

  return { valid: false, error: 'Kimi Coding key validation failed' };
}
