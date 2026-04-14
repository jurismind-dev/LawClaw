import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { runManagedChannelStartupReset } from '@electron/utils/managed-channel-startup-reset';

const tempHomes: string[] = [];
const TEST_TMPDIR = process.env.TMPDIR || '/tmp';

function createTempHome(prefix: string): string {
  const homeDir = mkdtempSync(join(TEST_TMPDIR, prefix));
  tempHomes.push(homeDir);
  return homeDir;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

afterEach(() => {
  vi.restoreAllMocks();

  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('managed channel startup reset', () => {
  it('clears legacy feishu/weixin config while preserving chat history files', async () => {
    const homeDir = createTempHome('lawclaw-managed-channel-reset-');
    const openClawDir = join(homeDir, '.openclaw');
    const configPath = join(openClawDir, 'openclaw.json');
    const historyFile = join(openClawDir, 'history', 'session-1.json');

    mkdirSync(join(openClawDir, 'extensions', 'openclaw-lark'), { recursive: true });
    mkdirSync(join(openClawDir, 'extensions', 'feishu'), { recursive: true });
    mkdirSync(join(openClawDir, 'extensions', 'feishu-openclaw-plugin'), { recursive: true });
    mkdirSync(join(openClawDir, 'extensions', 'openclaw-weixin'), { recursive: true });
    mkdirSync(dirname(historyFile), { recursive: true });
    writeFileSync(historyFile, '{"messages":[{"role":"assistant","content":"keep"}]}\n', 'utf-8');

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
            'openclaw-weixin': {
              enabled: true,
              token: 'wx-token',
            },
            telegram: {
              enabled: true,
              token: 'keep-me',
            },
          },
          bindings: [
            {
              agentId: 'lawclaw-main',
              match: { channel: 'feishu', accountId: '*' },
            },
            {
              agentId: 'lawclaw-main',
              match: { channel: 'openclaw-weixin', accountId: '*' },
            },
            {
              agentId: 'lawclaw-main',
              match: { channel: 'telegram', accountId: '*' },
            },
          ],
          plugins: {
            allow: ['openclaw-lark', 'feishu', 'openclaw-weixin', 'custom-plugin'],
            entries: {
              feishu: { enabled: true },
              'openclaw-lark': { enabled: true },
              'feishu-openclaw-plugin': { enabled: true },
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

    const clearWeixinStoredState = vi.fn().mockResolvedValue({ remainingAccountIds: [] });
    const setManagedChannels = vi.fn().mockResolvedValue(undefined);

    const summary = await runManagedChannelStartupReset({
      appVersion: '4.11.0',
      homeDir,
      now: () => new Date('2026-04-14T00:00:00.000Z'),
      clearWeixinStoredState: clearWeixinStoredState as never,
      getManagedChannels: async () => ['feishu', 'openclaw-weixin', 'telegram'],
      setManagedChannels,
    });

    const next = readJsonFile<{
      channels?: Record<string, { token?: string }>;
      bindings?: Array<{ match?: { channel?: string } }>;
      plugins?: {
        allow?: string[];
        entries?: Record<string, { enabled?: boolean }>;
      };
    }>(configPath);

    expect(summary).toMatchObject({
      status: 'applied',
      configChanged: true,
      updatedManagedChannels: true,
      clearedWeixinState: true,
    });
    expect(next.channels?.feishu).toBeUndefined();
    expect(next.channels?.['openclaw-weixin']).toBeUndefined();
    expect(next.channels?.telegram?.token).toBe('keep-me');
    expect(next.bindings?.map((binding) => binding.match?.channel)).toEqual(['telegram']);
    expect(next.plugins?.allow).toEqual(['custom-plugin']);
    expect(next.plugins?.entries?.feishu).toBeUndefined();
    expect(next.plugins?.entries?.['openclaw-lark']).toBeUndefined();
    expect(next.plugins?.entries?.['feishu-openclaw-plugin']).toBeUndefined();
    expect(next.plugins?.entries?.['openclaw-weixin']).toBeUndefined();
    expect(next.plugins?.entries?.['custom-plugin']?.enabled).toBe(true);
    expect(clearWeixinStoredState).toHaveBeenCalledTimes(1);
    expect(setManagedChannels).toHaveBeenCalledWith(['telegram']);
    expect(existsSync(historyFile)).toBe(true);
    expect(existsSync(join(openClawDir, 'extensions', 'openclaw-lark'))).toBe(false);
    expect(existsSync(join(openClawDir, 'extensions', 'feishu'))).toBe(false);
    expect(existsSync(join(openClawDir, 'extensions', 'feishu-openclaw-plugin'))).toBe(false);
    expect(existsSync(join(openClawDir, 'extensions', 'openclaw-weixin'))).toBe(false);
    expect(existsSync(summary.markerPath)).toBe(true);
  });

  it('skips the reset after the marker has already been written once', async () => {
    const homeDir = createTempHome('lawclaw-managed-channel-reset-skip-');
    const clearWeixinStoredState = vi.fn().mockResolvedValue({ remainingAccountIds: [] });

    const first = await runManagedChannelStartupReset({
      appVersion: '4.11.0',
      homeDir,
      clearWeixinStoredState: clearWeixinStoredState as never,
      getManagedChannels: async () => [],
      setManagedChannels: vi.fn().mockResolvedValue(undefined),
    });

    const secondClear = vi.fn().mockResolvedValue({ remainingAccountIds: [] });
    const second = await runManagedChannelStartupReset({
      appVersion: '4.11.0',
      homeDir,
      clearWeixinStoredState: secondClear as never,
      getManagedChannels: async () => ['feishu'],
      setManagedChannels: vi.fn().mockResolvedValue(undefined),
    });

    expect(first.status).toBe('applied');
    expect(second).toMatchObject({
      status: 'skipped',
      reason: 'already-ran',
    });
    expect(clearWeixinStoredState).toHaveBeenCalledTimes(1);
    expect(secondClear).not.toHaveBeenCalled();
  });
});
