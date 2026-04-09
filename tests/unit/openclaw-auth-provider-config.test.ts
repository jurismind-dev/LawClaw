import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tempHomes: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalPlatform = process.platform;

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
  Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });

  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('openclaw auth - provider config apiKey markers', () => {
  it('writes OpenClaw auth-profiles.json without a UTF-8 BOM on Windows', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-provider-config-'));
    tempHomes.push(homeDir);
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

    const mod = await loadOpenClawAuthWithHome(homeDir);
    mod.saveProviderKeyToOpenClaw('jurismind', 'sk-jurismind', 'lawclaw-main');

    const authPath = join(
      homeDir,
      '.openclaw',
      'agents',
      'lawclaw-main',
      'agent',
      'auth-profiles.json'
    );
    const raw = readFileSync(authPath, 'utf-8');

    expect(raw.startsWith('\uFEFF')).toBe(false);
    expect(JSON.parse(raw)).toMatchObject({
      profiles: {
        'jurismind:default': {
          provider: 'jurismind',
          key: 'sk-jurismind',
        },
      },
    });
  });

  it('cleanupOpenClawAuthProfilesEncoding strips a Windows UTF-8 BOM without losing keys', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-provider-config-'));
    tempHomes.push(homeDir);

    const authDir = join(homeDir, '.openclaw', 'agents', 'lawclaw-main', 'agent');
    mkdirSync(authDir, { recursive: true });
    const authPath = join(authDir, 'auth-profiles.json');
    writeFileSync(
      authPath,
      '\uFEFF{\n  "version": 1,\n  "profiles": {\n    "jurismind:default": {\n      "type": "api_key",\n      "provider": "jurismind",\n      "key": "sk-jurismind"\n    }\n  },\n  "order": {\n    "jurismind": [\n      "jurismind:default"\n    ]\n  },\n  "lastGood": {\n    "jurismind": "jurismind:default"\n  }\n}\n',
      'utf-8'
    );

    const mod = await loadOpenClawAuthWithHome(homeDir);
    const changed = mod.cleanupOpenClawAuthProfilesEncoding('lawclaw-main');
    const raw = readFileSync(authPath, 'utf-8');

    expect(changed).toBe(true);
    expect(raw.startsWith('\uFEFF')).toBe(false);
    expect(JSON.parse(raw)).toMatchObject({
      profiles: {
        'jurismind:default': {
          provider: 'jurismind',
          key: 'sk-jurismind',
        },
      },
    });
  });

  it('does not persist unsupported jurismind env markers into models.providers', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-provider-config-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(configPath, JSON.stringify({}, null, 2), 'utf-8');

    const mod = await loadOpenClawAuthWithHome(homeDir);
    await mod.syncProviderConfigToOpenClaw('jurismind', 'jurismind', {
      baseUrl: 'http://101.132.245.215:3001/v1',
      api: 'openai-completions',
      apiKeyEnv: 'JURISMIND_API_KEY',
    });

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      models?: {
        providers?: {
          jurismind?: {
            apiKey?: string;
            baseUrl?: string;
            api?: string;
          };
        };
      };
    };

    expect(next.models?.providers?.jurismind?.baseUrl).toBe('http://101.132.245.215:3001/v1');
    expect(next.models?.providers?.jurismind?.api).toBe('openai-completions');
    expect(next.models?.providers?.jurismind?.apiKey).toBeUndefined();
  });

  it('keeps supported openai env markers in models.providers', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-provider-config-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(configPath, JSON.stringify({}, null, 2), 'utf-8');

    const mod = await loadOpenClawAuthWithHome(homeDir);
    await mod.syncProviderConfigToOpenClaw('openai', 'gpt-5.2', {
      baseUrl: 'https://api.openai.com/v1',
      api: 'openai-responses',
      apiKeyEnv: 'OPENAI_API_KEY',
    });

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      models?: {
        providers?: {
          openai?: {
            apiKey?: string;
          };
        };
      };
    };

    expect(next.models?.providers?.openai?.apiKey).toBe('OPENAI_API_KEY');
  });

  it('canonicalizes legacy qwen provider entries when syncing provider config', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-provider-config-'));
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
              'qwen-portal': {
                baseUrl: 'https://portal.qwen.ai/v1',
                api: 'openai-completions',
                models: [{ id: 'coder-model', name: 'coder-model' }],
              },
            },
          },
          plugins: {
            entries: {
              'qwen-portal-auth': {
                enabled: true,
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
    await mod.syncProviderConfigToOpenClaw('qwen', 'qwen3.5-plus', {
      baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
      api: 'openai-completions',
      apiKeyEnv: 'QWEN_API_KEY',
    });

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      models?: {
        providers?: Record<string, { baseUrl?: string; models?: Array<{ id?: string }> }>;
      };
      plugins?: {
        entries?: Record<string, unknown>;
      };
    };

    expect(next.models?.providers?.qwen?.baseUrl).toBe('https://coding-intl.dashscope.aliyuncs.com/v1');
    expect(next.models?.providers?.qwen?.models).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'qwen3.5-plus' })])
    );
    expect(next.models?.providers?.['qwen-portal']).toBeUndefined();
    expect(next.plugins?.entries?.['qwen-portal-auth']).toBeUndefined();
  });

  it('uses minimax-portal-auth for minimax cn provider sync', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-provider-config-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(configPath, JSON.stringify({}, null, 2), 'utf-8');

    const mod = await loadOpenClawAuthWithHome(homeDir);
    await mod.syncProviderConfigToOpenClaw('minimax-portal-cn', 'MiniMax-M2.7', {
      baseUrl: 'https://api.minimaxi.com/anthropic',
      api: 'anthropic-messages',
      apiKeyEnv: 'MINIMAX_CN_API_KEY',
    });

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      plugins?: {
        entries?: Record<string, { enabled?: boolean }>;
      };
    };

    expect(next.plugins?.entries?.['minimax-portal-auth']).toMatchObject({
      enabled: true,
    });
    expect(next.plugins?.entries?.['minimax-portal-cn-auth']).toBeUndefined();
  });

  it('removes stale jurismind env markers when refreshing agent model config', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-provider-config-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          agents: {
            list: [{ id: 'lawclaw-main' }],
          },
          models: {
            providers: {
              jurismind: {
                baseUrl: 'http://101.132.245.215:3001/v1',
                api: 'openai-completions',
                apiKey: 'JURISMIND_API_KEY',
                models: [{ id: 'jurismind', name: 'jurismind' }],
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
    mod.setOpenClawAgentModel('lawclaw-main', 'jurismind');

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      models?: {
        providers?: {
          jurismind?: {
            apiKey?: string;
          };
        };
      };
    };

    expect(next.models?.providers?.jurismind?.apiKey).toBeUndefined();
  });

  it('cleanupOpenClawProviderApiKeyConfig removes stale jurismind env markers from existing config', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-provider-config-'));
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
              jurismind: {
                baseUrl: 'http://101.132.245.215:3001/v1',
                api: 'openai-completions',
                apiKey: 'JURISMIND_API_KEY',
                models: [{ id: 'jurismind', name: 'jurismind' }],
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
    const changed = mod.cleanupOpenClawProviderApiKeyConfig('jurismind');

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      models?: {
        providers?: {
          jurismind?: {
            apiKey?: string;
          };
        };
      };
    };

    expect(changed).toBe(true);
    expect(next.models?.providers?.jurismind?.apiKey).toBeUndefined();
  });
});
