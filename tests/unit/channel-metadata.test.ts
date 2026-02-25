import { describe, expect, it } from 'vitest';
import { CHANNEL_META, getPrimaryChannels } from '@/types/channel';

describe('channel metadata', () => {
  it('prioritizes Jurismind and Feishu in primary channels', () => {
    const primaryChannels = getPrimaryChannels();
    expect(primaryChannels.slice(0, 2)).toEqual(['jurismind', 'feishu']);
  });

  it('marks Jurismind channel as coming soon placeholder', () => {
    expect(CHANNEL_META.jurismind).toMatchObject({
      id: 'jurismind',
      connectionType: 'token',
      comingSoon: true,
      configFields: [],
    });
  });
});
