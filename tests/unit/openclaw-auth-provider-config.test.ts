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

describe('openclaw auth - provider config apiKey markers', () => {
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
});
