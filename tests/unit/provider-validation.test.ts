import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyChatCompletionsProbeResponse,
  classifyAuthResponse,
  getValidationProfile,
  shouldFallbackToChatCompletions,
  validateApiKeyWithProvider,
} from '@electron/utils/provider-validation';

function mockFetchWithStatuses(statuses: number[], body: unknown = {}): void {
  const queue = [...statuses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const status = queue.shift() ?? statuses[statuses.length - 1];
      return {
        status,
        json: async () => body,
        headers: {
          get: (headerName: string) =>
            headerName.toLowerCase() === 'content-type' ? 'application/json' : null,
        },
      } as Response;
    })
  );
}

describe('provider validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes moonshot_code_plan to kimi-coding validation profile', () => {
    expect(getValidationProfile('moonshot_code_plan')).toBe('kimi-coding');
  });

  it('accepts 2xx and 429 as valid for kimi-coding validation', async () => {
    mockFetchWithStatuses([200]);
    await expect(
      validateApiKeyWithProvider('moonshot_code_plan', 'sk-test', {
        baseUrl: 'https://api.kimi.com/coding/v1',
      })
    ).resolves.toEqual({ valid: true });

    mockFetchWithStatuses([429]);
    await expect(
      validateApiKeyWithProvider('moonshot_code_plan', 'sk-test', {
        baseUrl: 'https://api.kimi.com/coding/v1',
      })
    ).resolves.toEqual({ valid: true });
  });

  it('treats 401/403 as invalid for kimi-coding validation', async () => {
    mockFetchWithStatuses([401, 401]);
    await expect(
      validateApiKeyWithProvider('moonshot_code_plan', 'sk-test')
    ).resolves.toEqual({ valid: false, error: 'Invalid API key' });

    mockFetchWithStatuses([403, 403]);
    await expect(
      validateApiKeyWithProvider('moonshot_code_plan', 'sk-test')
    ).resolves.toEqual({ valid: false, error: 'Invalid API key' });
  });

  it('does not misclassify 400 as valid for kimi-coding validation', async () => {
    mockFetchWithStatuses([400], { error: { message: 'bad request' } });
    await expect(
      validateApiKeyWithProvider('moonshot_code_plan', 'sk-test')
    ).resolves.toEqual({ valid: false, error: 'bad request' });
  });

  it('classifies generic auth response statuses consistently', () => {
    expect(classifyAuthResponse(200, {})).toEqual({ valid: true });
    expect(classifyAuthResponse(429, {})).toEqual({ valid: true });
    expect(classifyAuthResponse(401, {})).toEqual({ valid: false, error: 'Invalid API key' });
    expect(classifyAuthResponse(403, {})).toEqual({ valid: false, error: 'Invalid API key' });
  });

  it('rejects 2xx non-json success when strict JSON response is required', () => {
    const result = classifyAuthResponse(200, {}, {
      contentType: 'text/html; charset=utf-8',
      requireJsonBodyOnSuccess: true,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('/v1');
  });

  it('keeps 2xx json success valid when strict JSON response is required', () => {
    expect(
      classifyAuthResponse(200, {}, {
        contentType: 'application/json; charset=utf-8',
        requireJsonBodyOnSuccess: true,
      })
    ).toEqual({ valid: true });
  });

  it('falls back to /chat/completions when /models returns 404', () => {
    const modelsResult = classifyAuthResponse(404, {});
    expect(shouldFallbackToChatCompletions(modelsResult)).toBe(true);
  });

  it('classifies chat probe status 400 and 429 as valid', () => {
    expect(
      classifyChatCompletionsProbeResponse(400, {}, {
        contentType: 'application/json',
        requireJsonBodyOnSuccess: true,
      })
    ).toEqual({ valid: true });
    expect(
      classifyChatCompletionsProbeResponse(429, {}, {
        contentType: 'application/json',
        requireJsonBodyOnSuccess: true,
      })
    ).toEqual({ valid: true });
  });

  it('rejects openai-compatible 200 html responses as invalid endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        json: async () => ({}),
        headers: {
          get: (headerName: string) =>
            headerName.toLowerCase() === 'content-type'
              ? 'text/html; charset=utf-8'
              : null,
        },
      })) as unknown as typeof fetch
    );

    const result = await validateApiKeyWithProvider('jurismind', 'sk-test', {
      baseUrl: 'http://example.com/v1',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('/v1');
  });

  it('falls back from /models 404 to /chat/completions and accepts 400/429', async () => {
    mockFetchWithStatuses([404, 400], {});
    await expect(
      validateApiKeyWithProvider('jurismind', 'sk-test', {
        baseUrl: 'http://example.com/v1',
      })
    ).resolves.toEqual({ valid: true });

    mockFetchWithStatuses([404, 429], {});
    await expect(
      validateApiKeyWithProvider('jurismind', 'sk-test', {
        baseUrl: 'http://example.com/v1',
      })
    ).resolves.toEqual({ valid: true });
  });
});
