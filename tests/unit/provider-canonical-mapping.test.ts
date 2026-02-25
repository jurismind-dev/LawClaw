import { describe, expect, it } from 'vitest';
import { getCanonicalProviderId, getProviderAliasIds } from '@electron/utils/provider-registry';

describe('provider canonical mapping', () => {
  it('maps moonshot_code_plan to kimi-coding', () => {
    expect(getCanonicalProviderId('moonshot_code_plan')).toBe('kimi-coding');
    expect(getProviderAliasIds('moonshot_code_plan')).toEqual(
      expect.arrayContaining(['moonshot_code_plan', 'kimi-coding'])
    );
  });

  it('keeps non-aliased providers unchanged', () => {
    expect(getCanonicalProviderId('jurismind')).toBe('jurismind');
    expect(getCanonicalProviderId('anthropic')).toBe('anthropic');
    expect(getProviderAliasIds('jurismind')).toEqual(['jurismind']);
  });
});
