import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({ homeDir: '' }));

vi.mock('os', async () => {
  const mockOs = {
    homedir: () => mockEnv.homeDir,
  };
  return {
    ...mockOs,
    default: mockOs,
  };
});

async function readConfig(homeDir: string): Promise<Record<string, unknown>> {
  const configPath = join(homeDir, '.openclaw', 'openclaw.json');
  const raw = await readFile(configPath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('channel config lawclaw binding io', () => {
  let homeDir = '';

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'lawclaw-channel-config-'));
    mockEnv.homeDir = homeDir;
    vi.resetModules();
  });

  afterEach(async () => {
    if (homeDir) {
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it('enforceLawClawChannelBinding writes a single lawclaw-main binding for managed channel', async () => {
    const configPath = join(homeDir, '.openclaw', 'openclaw.json');
    await mkdir(join(homeDir, '.openclaw'), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify(
        {
          bindings: [
            { agentId: 'main', match: { channel: 'telegram' } },
            { agentId: 'lawclaw-main', match: { channel: 'discord', accountId: '*' } },
            { agentId: 'other', match: { channel: 'telegram', accountId: 'biz' } },
          ],
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await import('@electron/utils/channel-config');
    const changed = await mod.enforceLawClawChannelBinding('telegram');
    expect(changed).toBe(true);

    const next = await readConfig(homeDir);
    expect(next.bindings).toEqual([
      { agentId: 'lawclaw-main', match: { channel: 'discord', accountId: '*' } },
      { agentId: 'lawclaw-main', match: { channel: 'telegram', accountId: '*' } },
    ]);
  });

  it('clearLawClawChannelBinding only removes lawclaw-main target binding', async () => {
    const configPath = join(homeDir, '.openclaw', 'openclaw.json');
    await mkdir(join(homeDir, '.openclaw'), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify(
        {
          bindings: [
            { agentId: 'lawclaw-main', match: { channel: 'telegram', accountId: '*' } },
            { agentId: 'main', match: { channel: 'telegram' } },
            { agentId: 'lawclaw-main', match: { channel: 'discord', accountId: '*' } },
          ],
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await import('@electron/utils/channel-config');
    const changed = await mod.clearLawClawChannelBinding('telegram');
    expect(changed).toBe(true);

    const next = await readConfig(homeDir);
    expect(next.bindings).toEqual([
      { agentId: 'main', match: { channel: 'telegram' } },
      { agentId: 'lawclaw-main', match: { channel: 'discord', accountId: '*' } },
    ]);
  });

  it('saveChannelConfig applies feishu defaults while enabling the configured channel', async () => {
    const mod = await import('@electron/utils/channel-config');

    await mod.saveChannelConfig('feishu', {
      appId: 'cli_test',
      appSecret: 'secret_test',
    });

    const next = await readConfig(homeDir);
    expect(next.channels).toMatchObject({
      feishu: {
        appId: 'cli_test',
        appSecret: 'secret_test',
        enabled: true,
        dmPolicy: 'open',
        allowFrom: ['*'],
        streaming: true,
        threadSession: true,
        requireMention: true,
        footer: {
          elapsed: true,
          status: true,
        },
      },
    });
  });

  it('saveChannelConfig preserves explicit feishu toggles while filling missing defaults', async () => {
    const configPath = join(homeDir, '.openclaw', 'openclaw.json');
    await mkdir(join(homeDir, '.openclaw'), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify(
        {
          channels: {
            feishu: {
              enabled: false,
              streaming: false,
              footer: {
                elapsed: false,
              },
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await import('@electron/utils/channel-config');
    await mod.saveChannelConfig('feishu', {
      appId: 'cli_test',
      appSecret: 'secret_test',
    });

    const next = await readConfig(homeDir);
    expect(next.channels).toMatchObject({
      feishu: {
        appId: 'cli_test',
        appSecret: 'secret_test',
        enabled: true,
        streaming: false,
        threadSession: true,
        requireMention: true,
        footer: {
          elapsed: false,
          status: true,
        },
      },
    });
  });
});
