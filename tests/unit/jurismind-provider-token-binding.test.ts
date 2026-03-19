import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
}));

function readBindingSource(): string {
  return readFileSync(
    join(process.cwd(), 'electron/utils/jurismind-provider-token-binding.ts'),
    'utf-8'
  );
}

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

describe('jurismind provider token binding', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes bare jurismind tokens with sk- prefix', async () => {
    const { normalizeJurismindProviderToken } = await import(
      '@electron/utils/jurismind-provider-token-binding'
    );

    expect(normalizeJurismindProviderToken('4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3')).toBe(
      'sk-4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3'
    );
    expect(normalizeJurismindProviderToken('Bearer 4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3')).toBe(
      'sk-4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3'
    );
  });

  it('extracts a token from bind messages and adds sk- prefix', async () => {
    const { extractTokenFromPayload } = await import(
      '@electron/utils/jurismind-provider-token-binding'
    );

    const result = extractTokenFromPayload({
      token_id: 42,
      data: ['绑定成功', '用户已绑定token: 4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3'],
    });

    expect(result).toEqual({
      tokenKey: 'sk-4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3',
      tokenId: 42,
    });
  });

  it('treats a 401 jurismind token as non-reusable', async () => {
    const { validateJurismindReusableToken } = await import(
      '@electron/utils/jurismind-provider-token-binding'
    );

    mockFetchWithStatuses([401, 401], {});

    await expect(validateJurismindReusableToken('sk-invalid')).resolves.toEqual({
      valid: false,
      authInvalid: true,
      error: 'Invalid API key',
    });
  });

  it('keeps a reusable jurismind token only when strict chat probe succeeds', async () => {
    const { validateJurismindReusableToken } = await import(
      '@electron/utils/jurismind-provider-token-binding'
    );

    mockFetchWithStatuses([200], {});

    await expect(validateJurismindReusableToken('sk-valid')).resolves.toEqual({
      valid: true,
      authInvalid: false,
      error: undefined,
    });
  });

  it('does not treat a 400 jurismind chat probe as reusable', async () => {
    const { validateJurismindReusableToken } = await import(
      '@electron/utils/jurismind-provider-token-binding'
    );

    mockFetchWithStatuses([400], { message: 'bad request' });

    await expect(validateJurismindReusableToken('sk-unknown')).resolves.toEqual({
      valid: false,
      authInvalid: false,
      error: 'bad request',
    });
  });

  it('adds sk- prefix before jurismind validation probe', async () => {
    const { validateJurismindReusableToken } = await import(
      '@electron/utils/jurismind-provider-token-binding'
    );

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)?.Authorization).toBe(
        'Bearer sk-4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3'
      );
      return {
        status: 200,
        json: async () => ({}),
        headers: {
          get: (headerName: string) =>
            headerName.toLowerCase() === 'content-type' ? 'application/json' : null,
        },
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      validateJurismindReusableToken('4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3')
    ).resolves.toEqual({
      valid: true,
      authInvalid: false,
      error: undefined,
    });
  });

  it('validates an existing bound token before reuse and validates fresh bind results too', () => {
    const source = readBindingSource();

    expect(source).toContain("resolveUsableJurismindToken(existing, '复用已绑定')");
    expect(source).toContain("resolveUsableJurismindToken(bindResult.token, '新绑定返回', {");
    expect(source).toContain('allowUnverified: true');
    expect(source).toContain('token_key 校验失败，准备重新绑定');
    expect(source).toContain('token_key 无法确认可用，继续尝试重新绑定');
    expect(source).toContain('token_key 校验未通过，但接受绑定接口返回值');
  });
});
