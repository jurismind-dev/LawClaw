import { describe, expect, it } from 'vitest';
import { CHANNEL_META, getPrimaryChannels } from '@/types/channel';

describe('channel metadata', () => {
  it('uses domestic-friendly primary channels', () => {
    const primaryChannels = getPrimaryChannels();
    expect(primaryChannels).toEqual(['jurismind', 'feishu', 'qqbot']);
    expect(primaryChannels).not.toContain('telegram');
    expect(primaryChannels).not.toContain('discord');
    expect(primaryChannels).not.toContain('whatsapp');
  });

  it('marks Jurismind channel as coming soon placeholder', () => {
    expect(CHANNEL_META.jurismind).toMatchObject({
      id: 'jurismind',
      connectionType: 'token',
      comingSoon: true,
      configFields: [],
    });
  });

  it('defines qqbot metadata with required advanced fields', () => {
    expect(CHANNEL_META.qqbot).toMatchObject({
      id: 'qqbot',
      name: 'QQ',
      connectionType: 'token',
      docsUrl: 'channels:meta.qqbot.docsUrl',
      isPlugin: true,
    });

    const qqFieldKeys = CHANNEL_META.qqbot.configFields.map((field) => field.key);
    expect(qqFieldKeys).toEqual(['appId', 'clientSecret']);
  });

  it('defines Feishu as QR onboarding with no manual credential fields', () => {
    expect(CHANNEL_META.feishu).toMatchObject({
      id: 'feishu',
      name: 'Feishu / Lark',
      connectionType: 'qr',
      docsUrl: 'channels:meta.feishu.docsUrl',
      isPlugin: true,
      configFields: [],
    });
  });
});
