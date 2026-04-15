import { describe, expect, it } from 'vitest';
import {
  finalizeFeishuOfficialPluginConfig,
  sanitizeFeishuChannelConfigShape,
  stabilizeFeishuChannelConfig,
} from '../../electron/utils/feishu-channel-defaults';

describe('finalizeFeishuOfficialPluginConfig', () => {
  it('writes official plugin config and channel credentials after QR onboarding', () => {
    const input = {
      plugins: {
        allow: ['feishu', 'openclaw-lark', 'other-plugin'],
        entries: {
          feishu: { enabled: true },
          'openclaw-lark': { enabled: true },
          'feishu-openclaw-plugin': { enabled: false, package: '@larksuite/openclaw-lark' },
        },
      },
    };

    const result = finalizeFeishuOfficialPluginConfig(input, {
      credentials: {
        appId: 'cli_test',
        appSecret: 'secret_test',
        openId: 'ou_123',
      },
    });

    expect(result.changed).toBe(true);
    expect(result.config).toMatchObject({
      channels: {
        feishu: {
          enabled: true,
          appId: 'cli_test',
          appSecret: 'secret_test',
          domain: 'feishu',
          connectionMode: 'websocket',
          dmPolicy: 'allowlist',
          allowFrom: ['ou_123'],
          groupAllowFrom: [],
          streaming: true,
          requireMention: true,
          typingIndicator: true,
          resolveSenderNames: true,
        },
      },
      plugins: {
        allow: ['other-plugin', 'openclaw-lark'],
        entries: {
          feishu: { enabled: false },
          'openclaw-lark': { enabled: true },
        },
      },
    });

    const entries = (result.config.plugins as { entries: Record<string, unknown> }).entries;
    expect(entries).not.toHaveProperty('feishu-openclaw-plugin');
  });

  it('clears stale app-scoped allowlist data when rebinding to another existing app', () => {
    const input = {
      channels: {
        feishu: {
          appId: 'cli_old_app',
          appSecret: 'old_secret',
          dmPolicy: 'allowlist',
          allowFrom: ['ou_old_app_scoped_owner'],
          groupAllowFrom: ['ou_old_group_sender'],
        },
      },
    };

    const result = finalizeFeishuOfficialPluginConfig(input, {
      credentials: {
        appId: 'cli_new_app',
        appSecret: 'new_secret',
      },
    });

    expect(result.config).toMatchObject({
      channels: {
        feishu: {
          appId: 'cli_new_app',
          appSecret: 'new_secret',
          dmPolicy: 'open',
          allowFrom: ['*'],
          groupAllowFrom: [],
        },
      },
    });
  });

  it('forces open DM policy for manual existing-app binding even when appId stays the same', () => {
    const input = {
      channels: {
        feishu: {
          appId: 'cli_existing_app',
          appSecret: 'old_secret',
          dmPolicy: 'allowlist',
          allowFrom: ['ou_old_owner'],
          groupAllowFrom: ['ou_group_sender'],
        },
      },
    };

    const result = finalizeFeishuOfficialPluginConfig(input, {
      credentials: {
        appId: 'cli_existing_app',
        appSecret: 'new_secret',
      },
    });

    expect(result.config).toMatchObject({
      channels: {
        feishu: {
          appId: 'cli_existing_app',
          appSecret: 'new_secret',
          dmPolicy: 'open',
          allowFrom: ['*'],
          groupAllowFrom: ['ou_group_sender'],
        },
      },
    });
  });

  it('preserves multi-account config while projecting the default account onto top-level fields', () => {
    const result = stabilizeFeishuChannelConfig({
      defaultAccount: 'work',
      accounts: {
        work: {
          appId: 'cli_work',
          appSecret: 'secret_work',
          groupPolicy: 'open',
        },
      },
    });

    expect(result.changed).toBe(true);
    expect(result.config).toMatchObject({
      defaultAccount: 'work',
      appId: 'cli_work',
      appSecret: 'secret_work',
      groupPolicy: 'open',
      accounts: {
        work: {
          appId: 'cli_work',
          appSecret: 'secret_work',
          groupPolicy: 'open',
        },
      },
    });
  });

  it('drops or rewrites legacy feishu keys to the current OpenClaw schema', () => {
    const result = sanitizeFeishuChannelConfigShape({
      enabled: true,
      defaultAccount: 'default',
      threadSession: true,
      footer: {
        status: true,
      },
      markdown: {
        tables: 'code',
        legacyMode: true,
      },
      capabilities: {
        image: true,
        audio: false,
        video: true,
      },
      dms: {
        historyLimit: 20,
      },
      tools: {
        doc: true,
        chat: true,
        legacyTool: true,
      },
      accounts: {
        default: {
          appId: 'cli_app',
          appSecret: 'secret',
          threadSession: true,
          staleKey: true,
          groups: {
            litigation: {
              enabled: true,
              requireMention: true,
              obsolete: 'remove-me',
            },
          },
        },
      },
    });

    expect(result.changed).toBe(true);
    expect(result.config).toMatchObject({
      enabled: true,
      defaultAccount: 'default',
      markdown: {
        tableMode: 'ascii',
      },
      capabilities: ['image', 'video'],
      tools: {
        doc: true,
        chat: true,
      },
      accounts: {
        default: {
          appId: 'cli_app',
          appSecret: 'secret',
          groups: {
            litigation: {
              enabled: true,
              requireMention: true,
            },
          },
        },
      },
    });
    expect(result.config).not.toHaveProperty('footer');
    expect(result.config).not.toHaveProperty('threadSession');
    expect(result.config).not.toHaveProperty('dms');
    expect(result.config.tools).not.toHaveProperty('legacyTool');
    expect((result.config.accounts as Record<string, unknown>).default).not.toHaveProperty('staleKey');
    expect((result.config.accounts as Record<string, unknown>).default).not.toHaveProperty('threadSession');
  });
});
