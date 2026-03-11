import { describe, expect, it } from 'vitest';
import { shouldRestartGatewayAfterBundledPluginInstall } from '../../src/pages/Setup/feishu-plugin-install';

describe('shouldRestartGatewayAfterBundledPluginInstall', () => {
  it('returns false when install result is unavailable', () => {
    expect(shouldRestartGatewayAfterBundledPluginInstall(null)).toBe(false);
  });

  it('returns false when install API reports already-installed skip', () => {
    expect(
      shouldRestartGatewayAfterBundledPluginInstall({
        skipped: true,
        reason: 'already-installed',
      })
    ).toBe(false);
  });

  it('returns true when bundled plugin was newly installed', () => {
    expect(
      shouldRestartGatewayAfterBundledPluginInstall({
        skipped: false,
      })
    ).toBe(true);
  });
});
