import type { ChannelType } from '@/types/channel';

export interface QqPluginInstallResult {
  skipped?: boolean;
  reason?: string;
}

export function shouldInstallQqPluginForSetupSession(
  configuredChannelsInSession: ReadonlySet<ChannelType>
): boolean {
  return configuredChannelsInSession.has('qqbot');
}

export function shouldRestartGatewayAfterQqPluginInstall(
  installedBefore: boolean,
  installResult: QqPluginInstallResult | null
): boolean {
  if (installedBefore) {
    return false;
  }

  if (!installResult) {
    return false;
  }

  return !(installResult.skipped === true && installResult.reason === 'already-installed');
}
