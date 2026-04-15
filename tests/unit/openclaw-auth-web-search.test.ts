import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const mockHomeState = vi.hoisted(() => ({
  value: process.env.HOME || process.env.USERPROFILE || '/tmp',
}));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  const mocked = {
    ...actual,
    homedir: () => mockHomeState.value,
  };
  return {
    ...mocked,
    default: mocked,
  };
});

const tempHomes: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const TEST_TMPDIR = process.env.TMPDIR || '/tmp';

async function loadOpenClawAuthWithHome(homeDir: string) {
  vi.resetModules();
  mockHomeState.value = homeDir;
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  return import('@electron/utils/openclaw-auth');
}

afterEach(() => {
  vi.resetModules();
  mockHomeState.value = originalHome || originalUserProfile || '/tmp';
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
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-web-search-'));
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
          'jurismind-doubao'?: {
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
    expect(next.plugins?.entries?.['jurismind-doubao']?.enabled).toBe(true);
    expect(next.plugins?.entries?.['jurismind-doubao']?.config?.webSearch?.apiKey).toBe('sk-jurismind');
    expect(next.plugins?.entries?.['jurismind-doubao']?.config?.webSearch?.baseUrl).toBe('http://101.132.245.215:3001/v1');
    expect(next.plugins?.entries?.['jurismind-doubao']?.config?.webSearch?.model).toBe('doubao');
  });

  it('syncJurismindWebSearchConfig migrates the legacy perplexity compatibility config', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-web-search-'));
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
          'jurismind-doubao'?: {
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
    expect(next.plugins?.entries?.['jurismind-doubao']?.config?.webSearch?.apiKey).toBe('sk-jurismind');
    expect(next.plugins?.entries?.['jurismind-doubao']?.config?.webSearch?.baseUrl).toBe('http://101.132.245.215:3001/v1');
    expect(next.plugins?.entries?.['jurismind-doubao']?.config?.webSearch?.model).toBe('doubao');
  });

  it('clearJurismindWebSearchConfig removes managed doubao transport config and disables search', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-web-search-'));
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
          'jurismind-doubao'?: {
            enabled?: boolean;
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
    expect(next.plugins?.entries?.['jurismind-doubao']?.enabled).toBe(true);
    expect(next.plugins?.entries?.['jurismind-doubao']?.config?.webSearch).toBeUndefined();
  });

  it('sanitizeOpenClawConfig migrates legacy jurismind doubao search config into plugin config', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-web-search-'));
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
                provider: 'doubao',
                maxResults: 5,
                doubao: {
                  apiKey: 'sk-legacy-jurismind',
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
    mod.sanitizeOpenClawConfig();

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
          'jurismind-doubao'?: {
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
    expect(next.tools?.web?.search?.maxResults).toBe(5);
    expect(next.tools?.web?.search?.doubao).toBeUndefined();
    expect(next.plugins?.entries?.['jurismind-doubao']?.enabled).toBe(true);
    expect(next.plugins?.entries?.['jurismind-doubao']?.config?.webSearch?.apiKey).toBe('sk-legacy-jurismind');
    expect(next.plugins?.entries?.['jurismind-doubao']?.config?.webSearch?.baseUrl).toBe('http://101.132.245.215:3001/v1');
    expect(next.plugins?.entries?.['jurismind-doubao']?.config?.webSearch?.model).toBe('doubao');
  });

  it('sanitizeOpenClawConfig removes deprecated dingtalk and qqbot channel remnants', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-web-search-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          channels: {
            qqbot: {
              enabled: true,
              appId: 'legacy-qq',
            },
            dingtalk: {
              enabled: true,
              appSecret: 'legacy-ding',
            },
            telegram: {
              enabled: true,
              token: 'keep-me',
            },
          },
          bindings: [
            {
              agentId: 'lawclaw-main',
              match: { channel: 'qqbot', accountId: '*' },
            },
            {
              agentId: 'lawclaw-main',
              match: { channel: 'dingtalk', accountId: '*' },
            },
            {
              agentId: 'lawclaw-main',
              match: { channel: 'telegram', accountId: '*' },
            },
          ],
          plugins: {
            allow: ['qqbot', 'openclaw-qqbot', 'dingtalk', 'custom-plugin'],
            entries: {
              qqbot: { enabled: true },
              'openclaw-qqbot': { enabled: true },
              dingtalk: { enabled: true },
              'custom-plugin': { enabled: true },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await loadOpenClawAuthWithHome(homeDir);
    mod.sanitizeOpenClawConfig();

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      channels?: Record<string, { enabled?: boolean; token?: string }>;
      bindings?: Array<{
        agentId?: string;
        match?: {
          channel?: string;
          accountId?: string;
        };
      }>;
      plugins?: {
        allow?: string[];
        entries?: Record<string, { enabled?: boolean }>;
      };
    };

    expect(next.channels?.qqbot).toBeUndefined();
    expect(next.channels?.dingtalk).toBeUndefined();
    expect(next.channels?.telegram?.token).toBe('keep-me');
    expect(next.bindings?.map((binding) => binding.match?.channel)).toEqual(['telegram']);
    expect(next.plugins?.entries?.qqbot).toBeUndefined();
    expect(next.plugins?.entries?.['openclaw-qqbot']).toBeUndefined();
    expect(next.plugins?.entries?.dingtalk).toBeUndefined();
    expect(next.plugins?.entries?.['custom-plugin']?.enabled).toBe(true);
    expect(next.plugins?.allow).not.toContain('qqbot');
    expect(next.plugins?.allow).not.toContain('openclaw-qqbot');
    expect(next.plugins?.allow).not.toContain('dingtalk');
    expect(next.plugins?.allow).toContain('custom-plugin');
  });

  it('sanitizeOpenClawConfig removes stale openclaw-lark config when the plugin is not installed', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-feishu-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          channels: {
            feishu: {
              enabled: true,
              appId: 'cli_xxx',
              appSecret: 'secret',
            },
          },
          plugins: {
            allow: ['openclaw-lark', 'custom-plugin'],
            entries: {
              feishu: { enabled: true },
              'openclaw-lark': { enabled: true },
              'custom-plugin': { enabled: true },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await loadOpenClawAuthWithHome(homeDir);
    mod.sanitizeOpenClawConfig();

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      plugins?: {
        allow?: string[];
        entries?: Record<string, { enabled?: boolean }>;
      };
    };

    expect(next.plugins?.allow).not.toContain('openclaw-lark');
    expect(next.plugins?.allow).toContain('custom-plugin');
    expect(next.plugins?.entries?.['openclaw-lark']).toBeUndefined();
    expect(next.plugins?.entries?.feishu?.enabled).toBe(false);
    expect(next.plugins?.entries?.['custom-plugin']?.enabled).toBe(true);
  });

  it('sanitizeOpenClawConfig removes legacy weixin channel config and stale plugin entries', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-weixin-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          channels: {
            'openclaw-weixin': {
              enabled: true,
              baseUrl: 'https://weixin.example/base',
              cdnBaseUrl: 'https://weixin.example/cdn',
              routeTag: 7,
              defaultAccount: 'bot-alpha',
              token: 'top-level-token',
              userId: 'top-user',
              accounts: {
                'bot-alpha': {
                  token: 'account-token',
                  userId: 'account-user',
                },
                'Account Beta': {
                  userId: 'beta-user',
                },
              },
            },
          },
          plugins: {
            allow: ['openclaw-weixin', 'custom-plugin'],
            entries: {
              'openclaw-weixin': { enabled: true },
              'custom-plugin': { enabled: true },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await loadOpenClawAuthWithHome(homeDir);
    mod.sanitizeOpenClawConfig();

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      channels?: Record<string, unknown>;
      bindings?: Array<{
        agentId?: string;
        match?: {
          channel?: string;
          accountId?: string;
        };
      }>;
      plugins?: {
        allow?: string[];
        entries?: Record<string, { enabled?: boolean }>;
      };
    };

    expect(next.channels?.['openclaw-weixin']).toBeUndefined();
    expect(next.plugins?.allow).not.toContain('openclaw-weixin');
    expect(next.plugins?.allow).toContain('custom-plugin');
    expect(next.plugins?.entries?.['openclaw-weixin']).toBeUndefined();
    expect(next.plugins?.entries?.['custom-plugin']?.enabled).toBe(true);
    expect(next.bindings).toBeUndefined();
    expect(existsSync(join(openclawDir, 'openclaw-weixin'))).toBe(false);
  });

  it('sanitizeOpenClawConfig does not create weixin migration state for fresh installs', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-weixin-clean-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          channels: {
            telegram: {
              enabled: true,
              token: 'keep-me',
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await loadOpenClawAuthWithHome(homeDir);
    mod.sanitizeOpenClawConfig();
    expect(existsSync(join(openclawDir, 'openclaw-weixin'))).toBe(false);
  });

  it('sanitizeOpenClawConfig preserves managed weixin channel config written by LawClaw onboarding', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-weixin-managed-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          channels: {
            'openclaw-weixin': {
              enabled: true,
              defaultAccount: 'bot-alpha',
              baseUrl: 'https://weixin.example/base',
              accounts: {
                'bot-alpha': {
                  enabled: true,
                  baseUrl: 'https://weixin.example/base',
                },
              },
            },
          },
          bindings: [
            {
              agentId: 'lawclaw-main',
              match: {
                channel: 'openclaw-weixin',
                accountId: '*',
              },
            },
          ],
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await loadOpenClawAuthWithHome(homeDir);
    mod.sanitizeOpenClawConfig();

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      channels?: Record<string, unknown>;
      bindings?: Array<{
        agentId?: string;
        match?: {
          channel?: string;
          accountId?: string;
        };
      }>;
    };

    expect(next.channels?.['openclaw-weixin']).toMatchObject({
      enabled: true,
      defaultAccount: 'bot-alpha',
      baseUrl: 'https://weixin.example/base',
      accounts: {
        'bot-alpha': {
          enabled: true,
          baseUrl: 'https://weixin.example/base',
        },
      },
    });
    expect(next.bindings).toEqual([
      {
        agentId: 'lawclaw-main',
        match: {
          channel: 'openclaw-weixin',
          accountId: '*',
        },
      },
    ]);
  });

  it('sanitizeOpenClawConfig prunes legacy feishu-only keys before gateway startup', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-feishu-shape-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          channels: {
            feishu: {
              enabled: true,
              defaultAccount: 'default',
              legacyTopLevel: true,
              footer: {
                status: true,
                staleFooterFlag: true,
              },
              accounts: {
                default: {
                  appId: 'cli_account',
                  appSecret: 'secret',
                  staleAccountFlag: true,
                  groups: {
                    team: {
                      enabled: true,
                      requireMention: true,
                      legacyGroupFlag: 'remove-me',
                    },
                  },
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
    mod.sanitizeOpenClawConfig();

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      channels?: {
        feishu?: {
          appId?: string;
          appSecret?: string;
          defaultAccount?: string;
          legacyTopLevel?: boolean;
          footer?: {
            status?: boolean;
            staleFooterFlag?: boolean;
          };
          accounts?: {
            default?: {
              staleAccountFlag?: boolean;
              groups?: {
                team?: {
                  legacyGroupFlag?: string;
                };
              };
            };
          };
        };
      };
    };

    expect(next.channels?.feishu?.appId).toBe('cli_account');
    expect(next.channels?.feishu?.appSecret).toBe('secret');
    expect(next.channels?.feishu?.defaultAccount).toBeUndefined();
    expect(next.channels?.feishu?.legacyTopLevel).toBeUndefined();
    expect(next.channels?.feishu?.footer).toEqual({ status: true });
    expect(next.channels?.feishu?.accounts).toBeUndefined();
  });

  it('sanitizeOpenClawConfig migrates legacy moonshot kimi search config into plugin config', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-web-search-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          models: {
            providers: {
              moonshot: {
                baseUrl: 'https://api.moonshot.cn/v1',
                api: 'openai-completions',
              },
            },
          },
          tools: {
            web: {
              search: {
                kimi: {
                  apiKey: 'stale-inline-key',
                  baseUrl: 'https://api.moonshot.cn/v1',
                  model: 'kimi-k2.5',
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
    mod.sanitizeOpenClawConfig();

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      tools?: {
        web?: {
          search?: {
            kimi?: unknown;
          };
        };
      };
      plugins?: {
        entries?: {
          moonshot?: {
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

    expect(next.tools?.web?.search?.kimi).toBeUndefined();
    expect(next.plugins?.entries?.moonshot?.config?.webSearch?.apiKey).toBeUndefined();
    expect(next.plugins?.entries?.moonshot?.config?.webSearch?.baseUrl).toBe('https://api.moonshot.cn/v1');
    expect(next.plugins?.entries?.moonshot?.config?.webSearch?.model).toBe('kimi-k2.5');
  });

  it('syncProviderConfigToOpenClaw keeps moonshot web search config under plugins.entries', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-openclaw-web-search-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          plugins: ['/tmp/custom-plugin.js'],
          models: {
            providers: {},
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await loadOpenClawAuthWithHome(homeDir);
    await mod.syncProviderConfigToOpenClaw('moonshot', 'kimi-k2.5', {
      baseUrl: 'https://api.moonshot.cn/v1',
      api: 'openai-completions',
      apiKeyEnv: 'MOONSHOT_API_KEY',
    });

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      tools?: {
        web?: {
          search?: {
            kimi?: unknown;
          };
        };
      };
      plugins?: {
        load?: string[];
        entries?: {
          moonshot?: {
            config?: {
              webSearch?: {
                baseUrl?: string;
              };
            };
          };
        };
      };
    };

    expect(next.tools?.web?.search?.kimi).toBeUndefined();
    expect(next.plugins?.load).toEqual(['/tmp/custom-plugin.js']);
    expect(next.plugins?.entries?.moonshot?.config?.webSearch?.baseUrl).toBe('https://api.moonshot.cn/v1');
  });
});
