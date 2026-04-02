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

  it('adds sk- when missing and preserves an existing sk- prefixed token_key', async () => {
    const { normalizeJurismindProviderToken } = await import(
      '@electron/utils/jurismind-provider-token-binding'
    );

    expect(normalizeJurismindProviderToken('4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3')).toBe(
      'sk-4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3'
    );
    expect(normalizeJurismindProviderToken('Bearer 4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3')).toBe(
      'sk-4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3'
    );
    expect(normalizeJurismindProviderToken('sk-4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3')).toBe(
      'sk-4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3'
    );
    expect(normalizeJurismindProviderToken('Bearer sk-4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3')).toBe(
      'sk-4jqxaK9QL7haFr0PuGAtF64kofLxAY6j3m7D69DQG1G94Id3'
    );
  });

  it('extracts a token from bind messages and auto-adds sk- when missing', async () => {
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

  it('uses a normalized sk- prefixed token_key during jurismind validation probe', async () => {
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

  it('uses the token_key returned by SSO directly instead of querying new-api bind endpoints', () => {
    const source = readBindingSource();

    expect(source).toContain("const token = extractTokenFromPayload(body);");
    expect(source).toContain("resolveUsableJurismindToken(auth.token, 'SSO 返回', {");
    expect(source).toContain('allowUnverified: true');
    expect(source).toContain('SSO 登录成功，但返回的 token_key 不可用');
    expect(source).toContain('SSO 登录成功，但未返回可用的 token_key');
    expect(source).not.toContain('queryBoundToken(');
    expect(source).not.toContain('bindTokenByOpenId(');
    expect(source).not.toContain('queryBoundTokenWithRetry(');
  });

  it('renders callback pages with manual return guidance instead of auto-switch messaging', () => {
    const source = readBindingSource();

    expect(source).toContain("title: '授权登录成功'");
    expect(source).toContain("join(process.resourcesPath, 'resources', 'sso-logo.png')");
    expect(source).toContain("join(__dirname, '../../resources/sso-logo.png')");
    expect(source).toContain('class="brand-logo"');
    expect(source).toContain("summaryLines: [");
    expect(source).toContain('您已成功通过 Jurismind 账号验证。');
    expect(source).toContain("statusText: ''");
    expect(source).not.toContain('登录结果已同步回 LawClaw 桌面端，请手动返回应用查看绑定结果。');
    expect(source).not.toContain('当前不会自动跳转，请手动切回 LawClaw 桌面端');
  });
});
