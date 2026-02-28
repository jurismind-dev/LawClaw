import { describe, expect, it } from 'vitest';
import {
  removeLawClawChannelBinding,
  upsertLawClawChannelBinding,
  type OpenClawConfig,
} from '@electron/utils/channel-config';

describe('channel config lawclaw binding helpers', () => {
  it('upsertLawClawChannelBinding 会清理目标 channel 的旧规则并写入唯一 lawclaw 绑定', () => {
    const config: OpenClawConfig = {
      bindings: [
        { agentId: 'main', match: { channel: 'telegram' } },
        { agentId: 'other', match: { channel: 'telegram', accountId: 'biz' } },
        { agentId: 'lawclaw-main', match: { channel: 'discord', accountId: '*' } },
      ],
    };

    const changed = upsertLawClawChannelBinding(config, 'telegram');
    expect(changed).toBe(true);
    expect(config.bindings).toEqual([
      { agentId: 'lawclaw-main', match: { channel: 'discord', accountId: '*' } },
      { agentId: 'lawclaw-main', match: { channel: 'telegram', accountId: '*' } },
    ]);
  });

  it('upsertLawClawChannelBinding 在已是目标状态时返回 false', () => {
    const config: OpenClawConfig = {
      bindings: [{ agentId: 'lawclaw-main', match: { channel: 'telegram', accountId: '*' } }],
    };

    const changed = upsertLawClawChannelBinding(config, 'telegram');
    expect(changed).toBe(false);
    expect(config.bindings).toEqual([
      { agentId: 'lawclaw-main', match: { channel: 'telegram', accountId: '*' } },
    ]);
  });

  it('removeLawClawChannelBinding 仅删除 lawclaw-main 的目标 channel 规则', () => {
    const config: OpenClawConfig = {
      bindings: [
        { agentId: 'lawclaw-main', match: { channel: 'telegram', accountId: '*' } },
        { agentId: 'main', match: { channel: 'telegram' } },
        { agentId: 'lawclaw-main', match: { channel: 'discord', accountId: '*' } },
      ],
    };

    const changed = removeLawClawChannelBinding(config, 'telegram');
    expect(changed).toBe(true);
    expect(config.bindings).toEqual([
      { agentId: 'main', match: { channel: 'telegram' } },
      { agentId: 'lawclaw-main', match: { channel: 'discord', accountId: '*' } },
    ]);
  });
});
