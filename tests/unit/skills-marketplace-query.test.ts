import { describe, expect, it } from 'vitest';
import { shouldAutoRefreshMarketplaceOnClear } from '@/pages/Skills/marketplace-query';

describe('skills marketplace query helper', () => {
  it('returns true only when query transitions from non-empty to empty', () => {
    expect(shouldAutoRefreshMarketplaceOnClear('legal', '')).toBe(true);
    expect(shouldAutoRefreshMarketplaceOnClear(' legal ', '   ')).toBe(true);
    expect(shouldAutoRefreshMarketplaceOnClear('', '')).toBe(false);
    expect(shouldAutoRefreshMarketplaceOnClear('', 'legal')).toBe(false);
    expect(shouldAutoRefreshMarketplaceOnClear('legal', 'law')).toBe(false);
  });
});
