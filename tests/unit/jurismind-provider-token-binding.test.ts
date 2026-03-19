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

  it('keeps a reusable jurismind token when chat probe succeeds', async () => {
    const { validateJurismindReusableToken } = await import(
      '@electron/utils/jurismind-provider-token-binding'
    );

    mockFetchWithStatuses([401, 400], {});

    await expect(validateJurismindReusableToken('sk-valid')).resolves.toEqual({
      valid: true,
      authInvalid: false,
      error: undefined,
    });
  });

  it('validates an existing bound token before reuse and validates fresh bind results too', () => {
    const source = readBindingSource();

    expect(source).toContain("resolveUsableJurismindToken(existing, '复用已绑定')");
    expect(source).toContain("resolveUsableJurismindToken(bindResult.token, '新绑定返回')");
    expect(source).toContain('token_key 校验失败，准备重新绑定');
  });
});
