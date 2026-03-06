import { describe, expect, it } from 'vitest';

describe('lawclaw provider ui context', () => {
  it('auto-selects provider in setup context only', async () => {
    const mod = await import('@/lib/lawclaw-provider-ui-context');

    expect(mod.shouldAutoSelectLawClawProvider('setup')).toBe(true);
    expect(mod.shouldAutoSelectLawClawProvider('settings')).toBe(false);
  });
});
