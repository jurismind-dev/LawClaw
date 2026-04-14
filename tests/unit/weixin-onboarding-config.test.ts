import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('weixin onboarding config writes', () => {
  it('stores onboarding state privately and leaves openclaw.json valid for gateway startup', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-weixin-onboarding-'));
    tempHomes.push(homeDir);
    mockHomeState.value = homeDir;
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    writeFileSync(
      join(openclawDir, 'openclaw.json'),
      JSON.stringify(
        {
          channels: {
            'openclaw-weixin': {
              enabled: true,
              baseUrl: 'https://legacy.example/base',
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

    const { weixinOnboardingManager } = await import('@electron/utils/weixin-onboarding');
    const manager = weixinOnboardingManager as unknown as {
      applySuccessfulOnboarding: (payload: {
        accountId: string;
        botToken: string;
        baseUrl: string;
        userId?: string;
      }) => Promise<void>;
    };

    await manager.applySuccessfulOnboarding({
      accountId: 'Bot Alpha',
      botToken: 'fresh-token',
      baseUrl: 'https://weixin.example/base',
      userId: 'user-1',
    });

    const next = JSON.parse(readFileSync(join(openclawDir, 'openclaw.json'), 'utf-8')) as {
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
    expect(next.plugins?.allow).toEqual(['custom-plugin']);
    expect(next.plugins?.entries?.['openclaw-weixin']).toBeUndefined();
    expect(next.plugins?.entries?.['custom-plugin']?.enabled).toBe(true);
    expect(next.bindings).toEqual([
      {
        agentId: 'lawclaw-main',
        match: {
          channel: 'openclaw-weixin',
          accountId: '*',
        },
      },
    ]);
    expect(
      JSON.parse(readFileSync(join(openclawDir, 'openclaw-weixin', 'settings.json'), 'utf-8'))
    ).toMatchObject({
      baseUrl: 'https://weixin.example/base',
    });
    expect(
      JSON.parse(
        readFileSync(join(openclawDir, 'openclaw-weixin', 'accounts', 'bot-alpha.json'), 'utf-8')
      )
    ).toMatchObject({
      token: 'fresh-token',
      baseUrl: 'https://weixin.example/base',
      userId: 'user-1',
    });
  });
});
