import { describe, expect, it } from 'vitest';
import { CHANNEL_META, getChannelIconUrl, getPrimaryChannels } from '@/types/channel';

describe('channel metadata', () => {
  it('uses domestic-friendly primary channels', () => {
    const primaryChannels = getPrimaryChannels();
    expect(primaryChannels).toEqual(['feishu', 'openclaw-weixin', 'jurismind']);
    expect(primaryChannels).not.toContain('telegram');
    expect(primaryChannels).not.toContain('discord');
    expect(primaryChannels).not.toContain('whatsapp');
    expect(Object.prototype.hasOwnProperty.call(CHANNEL_META, 'qqbot')).toBe(false);
  });

  it('marks Jurismind channel as coming soon placeholder', () => {
    expect(CHANNEL_META.jurismind).toMatchObject({
      id: 'jurismind',
      connectionType: 'token',
      comingSoon: true,
      configFields: [],
    });
  });

  it('defines Feishu as QR onboarding with no manual credential fields', () => {
    expect(CHANNEL_META.feishu).toMatchObject({
      id: 'feishu',
      name: '飞书',
      connectionType: 'qr',
      docsUrl: 'channels:meta.feishu.docsUrl',
      isPlugin: true,
      configFields: [],
    });
  });

  it('defines Weixin as QR onboarding with no manual credential fields', () => {
    expect(CHANNEL_META['openclaw-weixin']).toMatchObject({
      id: 'openclaw-weixin',
      name: '微信',
      connectionType: 'qr',
      docsUrl: 'channels:meta.openclaw-weixin.docsUrl',
      isPlugin: true,
      configFields: [],
    });
  });

  it('uses branded icon assets for the primary domestic channels', () => {
    expect(getChannelIconUrl('jurismind')).toBeTruthy();
    expect(getChannelIconUrl('feishu')).toBeTruthy();
    expect(getChannelIconUrl('openclaw-weixin')).toBeTruthy();
  });
});
