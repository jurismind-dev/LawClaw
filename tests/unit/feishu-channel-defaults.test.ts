import { describe, expect, it } from 'vitest';
import { finalizeFeishuOfficialPluginConfig } from '../../electron/utils/feishu-channel-defaults';

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
          threadSession: true,
          requireMention: true,
          footer: {
            elapsed: true,
            status: true,
          },
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
});
