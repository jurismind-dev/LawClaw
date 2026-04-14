import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isAlreadyInstalledErrorMessage, removeInstalledPluginDir } from './openclaw-plugin-install';
import {
  WEIXIN_CHANNEL_ID,
  WEIXIN_PLUGIN_NPM_SPEC,
  WEIXIN_PLUGIN_VERSION,
  getInstalledWeixinPluginVersion,
} from './weixin-channel-state';

export interface WeixinPluginCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

export type WeixinPluginCommandRunner = (
  args: string[]
) => Promise<WeixinPluginCommandResult>;

export interface RepairInstalledWeixinPluginOptions {
  openClawConfigDir: string;
  runOpenClawCli: WeixinPluginCommandRunner;
}

export interface RepairInstalledWeixinPluginResult {
  repaired: boolean;
  reason: 'not-installed' | 'healthy' | 'repaired' | 'failed';
  pluginDir: string;
  missingPaths: string[];
  error?: string;
  details?: string;
}

const WEIXIN_REQUIRED_RUNTIME_PATHS = [
  'package.json',
  'openclaw.plugin.json',
  'index.ts',
];

function formatMissingRuntimePaths(missingPaths: string[]): string {
  return missingPaths.map((entry) => `"${entry}"`).join(', ');
}

export function getWeixinPluginMissingRuntimePaths(pluginDir: string): string[] {
  return WEIXIN_REQUIRED_RUNTIME_PATHS.filter((relativePath) => !existsSync(join(pluginDir, relativePath)));
}

function collectCommandDetails(result: WeixinPluginCommandResult): string {
  return [result.error, result.stderr, result.stdout]
    .filter(Boolean)
    .join('\n');
}

export async function repairInstalledWeixinPluginIfNeeded(
  options: RepairInstalledWeixinPluginOptions
): Promise<RepairInstalledWeixinPluginResult> {
  const pluginDir = join(options.openClawConfigDir, 'extensions', WEIXIN_CHANNEL_ID);
  if (!existsSync(pluginDir)) {
    return {
      repaired: false,
      reason: 'not-installed',
      pluginDir,
      missingPaths: [],
    };
  }

  const installedVersion = await getInstalledWeixinPluginVersion(options.openClawConfigDir);
  const missingPaths = getWeixinPluginMissingRuntimePaths(pluginDir);
  if (installedVersion === WEIXIN_PLUGIN_VERSION && missingPaths.length === 0) {
    return {
      repaired: false,
      reason: 'healthy',
      pluginDir,
      missingPaths: [],
    };
  }

  const uninstallResult = await options.runOpenClawCli(['plugins', 'uninstall', WEIXIN_CHANNEL_ID]);
  void uninstallResult;
  removeInstalledPluginDir(join(options.openClawConfigDir, 'extensions'), WEIXIN_CHANNEL_ID);

  if (existsSync(pluginDir)) {
    return {
      repaired: false,
      reason: 'failed',
      pluginDir,
      missingPaths,
      error: 'Failed to remove incompatible Weixin plugin install directory',
    };
  }

  let installResult = await options.runOpenClawCli(['plugins', 'install', WEIXIN_PLUGIN_NPM_SPEC]);
  if (!installResult.success) {
    const details = collectCommandDetails(installResult);
    if (isAlreadyInstalledErrorMessage(details)) {
      removeInstalledPluginDir(join(options.openClawConfigDir, 'extensions'), WEIXIN_CHANNEL_ID);
      installResult = await options.runOpenClawCli(['plugins', 'install', WEIXIN_PLUGIN_NPM_SPEC]);
    }
  }

  if (!installResult.success) {
    return {
      repaired: false,
      reason: 'failed',
      pluginDir,
      missingPaths,
      error: installResult.error || 'Failed to install compatible Weixin plugin',
      details: collectCommandDetails(installResult),
    };
  }

  const installedVersionAfterRepair = await getInstalledWeixinPluginVersion(options.openClawConfigDir);
  const missingAfterRepair = getWeixinPluginMissingRuntimePaths(pluginDir);
  if (
    installedVersionAfterRepair !== WEIXIN_PLUGIN_VERSION
    || missingAfterRepair.length > 0
  ) {
    const details = [];
    if (installedVersionAfterRepair !== WEIXIN_PLUGIN_VERSION) {
      details.push(
        `expected version ${WEIXIN_PLUGIN_VERSION}, got ${installedVersionAfterRepair || 'unknown'}`
      );
    }
    if (missingAfterRepair.length > 0) {
      details.push(formatMissingRuntimePaths(missingAfterRepair));
    }

    return {
      repaired: false,
      reason: 'failed',
      pluginDir,
      missingPaths: missingAfterRepair,
      error: 'Weixin plugin repair completed but validation failed',
      details: details.join('\n'),
    };
  }

  return {
    repaired: true,
    reason: 'repaired',
    pluginDir,
    missingPaths,
  };
}
