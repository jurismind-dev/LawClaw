export const SETUP_BUNDLED_FEISHU_PLUGIN_ID = 'feishu-openclaw-plugin';

export interface BundledPluginInstallResult {
  skipped?: boolean;
  reason?: string;
}

export function shouldRestartGatewayAfterBundledPluginInstall(
  installResult: BundledPluginInstallResult | null
): boolean {
  if (!installResult) {
    return false;
  }

  return !(installResult.skipped === true && installResult.reason === 'already-installed');
}
