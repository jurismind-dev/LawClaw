import { describe, expect, it } from 'vitest';
import type { ChannelType } from '../../src/types/channel';
import {
  shouldInstallQqPluginForSetupSession,
  shouldRestartGatewayAfterQqPluginInstall,
} from '../../src/pages/Setup/qq-plugin-install';

describe('shouldInstallQqPluginForSetupSession', () => {
  it('returns false when qqbot is not configured in this setup session', () => {
    expect(shouldInstallQqPluginForSetupSession(new Set<ChannelType>(['feishu']))).toBe(false);
  });

  it('returns true when qqbot has been configured in this setup session', () => {
    expect(
      shouldInstallQqPluginForSetupSession(new Set<ChannelType>(['feishu', 'qqbot']))
    ).toBe(true);
  });
});

describe('shouldRestartGatewayAfterQqPluginInstall', () => {
  it('returns false when qq plugin is already installed before setup install flow', () => {
    expect(shouldRestartGatewayAfterQqPluginInstall(true, null)).toBe(false);
  });

  it('returns false when install API reports already-installed skip', () => {
    expect(
      shouldRestartGatewayAfterQqPluginInstall(false, {
        skipped: true,
        reason: 'already-installed',
      })
    ).toBe(false);
  });

  it('returns true when qq plugin was newly installed', () => {
    expect(
      shouldRestartGatewayAfterQqPluginInstall(false, {
        skipped: false,
      })
    ).toBe(true);
  });
});
