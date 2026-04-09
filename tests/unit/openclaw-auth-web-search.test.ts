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
  it('migrateLegacyOpenClawWebToolConfig moves legacy web tool config into plugin entries', async () => {
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
                provider: 'grok',
                maxResults: 5,
                grok: {
                  apiKey: 'xai-legacy',
                  baseUrl: 'https://api.x.ai/v1',
                },
                doubao: {
                  apiKey: 'sk-jurismind',
                  baseUrl: 'http://101.132.245.215:3001/v1',
                  model: 'doubao',
                },
              },
              x_search: {
                enabled: true,
                model: 'grok-4.1-mini',
                inlineCitations: true,
              },
              fetch: {
                provider: 'firecrawl',
                firecrawl: {
                  apiKey: 'fc-legacy',
                  baseUrl: 'https://api.firecrawl.dev',
                  timeoutSeconds: 45,
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
    const changed = mod.migrateLegacyOpenClawWebToolConfig();

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      tools?: {
        web?: {
          x_search?: unknown;
          search?: {
            enabled?: boolean;
            provider?: string;
            maxResults?: number;
            grok?: unknown;
            doubao?: unknown;
          };
          fetch?: {
            provider?: string;
            firecrawl?: unknown;
          };
        };
      };
      plugins?: {
        entries?: {
          xai?: {
            config?: {
              xSearch?: {
                enabled?: boolean;
                model?: string;
                inlineCitations?: boolean;
              };
              webSearch?: {
                apiKey?: string;
                baseUrl?: string;
              };
            };
          };
          jurismind?: {
            config?: {
              webSearch?: {
                apiKey?: string;
                baseUrl?: string;
                model?: string;
              };
            };
          };
          firecrawl?: {
            enabled?: boolean;
            config?: {
              webFetch?: {
                apiKey?: string;
                baseUrl?: string;
                timeoutSeconds?: number;
              };
            };
          };
        };
      };
    };

    expect(changed).toBe(true);
    expect(next.tools?.web?.search?.enabled).toBe(true);
    expect(next.tools?.web?.search?.provider).toBe('grok');
    expect(next.tools?.web?.search?.maxResults).toBe(5);
    expect(next.tools?.web?.search?.grok).toBeUndefined();
    expect(next.tools?.web?.search?.doubao).toBeUndefined();
    expect(next.tools?.web?.x_search).toBeUndefined();
    expect(next.tools?.web?.fetch?.provider).toBe('firecrawl');
    expect(next.tools?.web?.fetch?.firecrawl).toBeUndefined();
    expect(next.plugins?.entries?.xai?.config?.webSearch?.apiKey).toBe('xai-legacy');
    expect(next.plugins?.entries?.xai?.config?.webSearch?.baseUrl).toBe('https://api.x.ai/v1');
    expect(next.plugins?.entries?.xai?.config?.xSearch?.enabled).toBe(true);
    expect(next.plugins?.entries?.xai?.config?.xSearch?.model).toBe('grok-4.1-mini');
    expect(next.plugins?.entries?.xai?.config?.xSearch?.inlineCitations).toBe(true);
    expect(next.plugins?.entries?.jurismind?.config?.webSearch?.apiKey).toBe('sk-jurismind');
    expect(next.plugins?.entries?.jurismind?.config?.webSearch?.baseUrl).toBe('http://101.132.245.215:3001/v1');
    expect(next.plugins?.entries?.jurismind?.config?.webSearch?.model).toBe('doubao');
    expect(next.plugins?.entries?.firecrawl?.enabled).toBe(true);
    expect(next.plugins?.entries?.firecrawl?.config?.webFetch?.apiKey).toBe('fc-legacy');
    expect(next.plugins?.entries?.firecrawl?.config?.webFetch?.baseUrl).toBe('https://api.firecrawl.dev');
    expect(next.plugins?.entries?.firecrawl?.config?.webFetch?.timeoutSeconds).toBe(45);
  });

  it('migrateLegacyOpenClawWebToolConfig keeps jurismind perplexity compatibility config in place', async () => {
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
    const changed = mod.migrateLegacyOpenClawWebToolConfig();

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      tools?: {
        web?: {
          search?: {
            perplexity?: {
              apiKey?: string;
              baseUrl?: string;
              model?: string;
            };
          };
        };
      };
      plugins?: {
        entries?: {
          perplexity?: unknown;
        };
      };
    };

    expect(changed).toBe(false);
    expect(next.tools?.web?.search?.perplexity?.apiKey).toBe('sk-legacy');
    expect(next.plugins?.entries?.perplexity).toBeUndefined();
  });

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
            doubao?: unknown;
          };
        };
      };
      plugins?: {
        entries?: {
          jurismind?: {
            enabled?: boolean;
            config?: {
              webSearch?: {
                apiKey?: string;
                baseUrl?: string;
                model?: string;
              };
            };
          };
        };
      };
    };

    expect(next.tools?.web?.search?.enabled).toBe(true);
    expect(next.tools?.web?.search?.provider).toBe('doubao');
    expect(next.tools?.web?.search?.maxResults).toBe(8);
    expect(next.tools?.web?.search?.doubao).toBeUndefined();
    expect(next.plugins?.entries?.jurismind?.enabled).toBe(true);
    expect(next.plugins?.entries?.jurismind?.config?.webSearch?.apiKey).toBe('sk-jurismind');
    expect(next.plugins?.entries?.jurismind?.config?.webSearch?.baseUrl).toBe('http://101.132.245.215:3001/v1');
    expect(next.plugins?.entries?.jurismind?.config?.webSearch?.model).toBe('doubao');
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
            doubao?: unknown;
          };
        };
      };
      plugins?: {
        entries?: {
          jurismind?: {
            enabled?: boolean;
            config?: {
              webSearch?: {
                apiKey?: string;
                baseUrl?: string;
                model?: string;
              };
            };
          };
        };
      };
    };

    expect(next.tools?.web?.search?.enabled).toBe(true);
    expect(next.tools?.web?.search?.provider).toBe('doubao');
    expect(next.tools?.web?.search?.maxResults).toBe(4);
    expect(next.tools?.web?.search?.perplexity).toBeUndefined();
    expect(next.tools?.web?.search?.doubao).toBeUndefined();
    expect(next.plugins?.entries?.jurismind?.enabled).toBe(true);
    expect(next.plugins?.entries?.jurismind?.config?.webSearch?.apiKey).toBe('sk-jurismind');
    expect(next.plugins?.entries?.jurismind?.config?.webSearch?.baseUrl).toBe('http://101.132.245.215:3001/v1');
    expect(next.plugins?.entries?.jurismind?.config?.webSearch?.model).toBe('doubao');
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
      plugins?: {
        entries?: {
          jurismind?: {
            config?: {
              webSearch?: unknown;
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
    expect(next.plugins?.entries?.jurismind?.config?.webSearch).toBeUndefined();
  });
});
