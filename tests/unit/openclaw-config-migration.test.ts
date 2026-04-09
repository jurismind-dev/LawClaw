import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '0.0.0-test'),
  },
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { cleanupRetiredChannelEntriesInConfig } from '@electron/utils/openclaw-config-migration';

describe('openclaw config migration', () => {
  it('removes retired dingtalk and qq channel/plugin state from openclaw config', () => {
    const result = cleanupRetiredChannelEntriesInConfig({
      channels: {
        dingtalk: { enabled: true },
        qqbot: { enabled: true },
        telegram: { enabled: true },
      },
      bindings: [
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
        allow: ['openclaw-dingtalk', 'qqbot', 'openclaw-weixin'],
        entries: {
          'openclaw-dingtalk': { enabled: true },
          qqbot: { enabled: true },
          'openclaw-weixin': { enabled: true },
        },
        installs: {
          'openclaw-dingtalk': { version: '1.0.0' },
          qqbot: { version: '1.0.0' },
        },
        load: {
          paths: [
            '/Users/demo/.openclaw/extensions/openclaw-dingtalk',
            '/Users/demo/.openclaw/extensions/openclaw-weixin',
            { id: 'qqbot', path: '/Users/demo/.openclaw/extensions/qqbot' },
          ],
        },
      },
    });

    expect(result.changed).toBe(true);
    expect(result.summary).toMatchObject({
      removedChannels: expect.arrayContaining(['dingtalk', 'qqbot']),
      removedBindings: 1,
      removedPluginEntries: expect.arrayContaining(['openclaw-dingtalk', 'qqbot']),
      removedPluginAllow: expect.arrayContaining(['openclaw-dingtalk', 'qqbot']),
      removedPluginInstalls: expect.arrayContaining(['openclaw-dingtalk', 'qqbot']),
      removedPluginLoadPaths: 2,
    });
    expect(result.config.channels).toEqual({
      telegram: { enabled: true },
    });
    expect(result.config.bindings).toEqual([
      {
        agentId: 'lawclaw-main',
        match: { channel: 'telegram', accountId: '*' },
      },
    ]);
    expect(result.config.plugins).toMatchObject({
      allow: ['openclaw-weixin'],
      entries: {
        'openclaw-weixin': { enabled: true },
      },
      load: {
        paths: ['/Users/demo/.openclaw/extensions/openclaw-weixin'],
      },
    });
  });

  it('is a no-op when openclaw config no longer contains retired channels', () => {
    const result = cleanupRetiredChannelEntriesInConfig({
      channels: {
        telegram: { enabled: true },
      },
      plugins: {
        allow: ['openclaw-weixin'],
      },
    });

    expect(result.changed).toBe(false);
    expect(result.summary).toEqual({
      removedChannels: [],
      removedBindings: 0,
      removedPluginEntries: [],
      removedPluginAllow: [],
      removedPluginInstalls: [],
      removedPluginLoadPaths: 0,
    });
  });
});
