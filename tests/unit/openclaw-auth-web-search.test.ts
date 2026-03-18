import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tempHomes: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

async function loadOpenClawAuthWithHome(homeDir: string) {
  vi.resetModules();
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  return import('@electron/utils/openclaw-auth');
}

afterEach(() => {
  vi.resetModules();
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;

  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('openclaw auth - jurismind web search sync', () => {
  it('syncJurismindWebSearchConfig writes native doubao search config', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-web-search-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          tools: {
            web: {
              search: {
                maxResults: 8,
              },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await loadOpenClawAuthWithHome(homeDir);
    mod.syncJurismindWebSearchConfig('sk-jurismind');

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      tools?: {
        web?: {
          search?: {
            enabled?: boolean;
            provider?: string;
            maxResults?: number;
            doubao?: {
              apiKey?: string;
              baseUrl?: string;
              model?: string;
            };
          };
        };
      };
    };

    expect(next.tools?.web?.search?.enabled).toBe(true);
    expect(next.tools?.web?.search?.provider).toBe('doubao');
    expect(next.tools?.web?.search?.maxResults).toBe(8);
    expect(next.tools?.web?.search?.doubao?.apiKey).toBe('sk-jurismind');
    expect(next.tools?.web?.search?.doubao?.baseUrl).toBe('http://101.132.245.215:3001/v1');
    expect(next.tools?.web?.search?.doubao?.model).toBe('doubao');
  });

  it('syncJurismindWebSearchConfig migrates the legacy perplexity compatibility config', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-web-search-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          tools: {
            web: {
              search: {
                enabled: true,
                provider: 'perplexity',
                maxResults: 4,
                perplexity: {
                  apiKey: 'sk-legacy',
                  baseUrl: 'http://101.132.245.215:3001/v1',
                  model: 'doubao',
                },
              },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await loadOpenClawAuthWithHome(homeDir);
    mod.syncJurismindWebSearchConfig('sk-jurismind');

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      tools?: {
        web?: {
          search?: {
            enabled?: boolean;
            provider?: string;
            maxResults?: number;
            perplexity?: unknown;
            doubao?: {
              apiKey?: string;
              baseUrl?: string;
              model?: string;
            };
          };
        };
      };
    };

    expect(next.tools?.web?.search?.enabled).toBe(true);
    expect(next.tools?.web?.search?.provider).toBe('doubao');
    expect(next.tools?.web?.search?.maxResults).toBe(4);
    expect(next.tools?.web?.search?.perplexity).toBeUndefined();
    expect(next.tools?.web?.search?.doubao?.apiKey).toBe('sk-jurismind');
    expect(next.tools?.web?.search?.doubao?.baseUrl).toBe('http://101.132.245.215:3001/v1');
    expect(next.tools?.web?.search?.doubao?.model).toBe('doubao');
  });

  it('clearJurismindWebSearchConfig removes managed doubao transport config and disables search', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-web-search-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          tools: {
            web: {
              search: {
                enabled: true,
                maxResults: 6,
                gemini: {
                  model: 'gemini-2.5-flash',
                },
              },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await loadOpenClawAuthWithHome(homeDir);
    mod.syncJurismindWebSearchConfig('sk-jurismind');
    const changed = mod.clearJurismindWebSearchConfig();

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      tools?: {
        web?: {
          search?: {
            enabled?: boolean;
            provider?: string;
            maxResults?: number;
            doubao?: unknown;
            gemini?: {
              model?: string;
            };
          };
        };
      };
    };

    expect(changed).toBe(true);
    expect(next.tools?.web?.search?.enabled).toBe(false);
    expect(next.tools?.web?.search?.provider).toBeUndefined();
    expect(next.tools?.web?.search?.maxResults).toBe(6);
    expect(next.tools?.web?.search?.doubao).toBeUndefined();
    expect(next.tools?.web?.search?.gemini?.model).toBe('gemini-2.5-flash');
  });
});
