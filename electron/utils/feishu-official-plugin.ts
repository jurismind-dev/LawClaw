import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FEISHU_OFFICIAL_PLUGIN_ID = 'openclaw-lark';
export const FEISHU_OFFICIAL_PLUGIN_PACKAGE = '@larksuite/openclaw-lark';
export const FEISHU_OFFICIAL_PLUGIN_VERSION = '2026.4.7';
export const FEISHU_OFFICIAL_PLUGIN_NPM_SPEC =
  `${FEISHU_OFFICIAL_PLUGIN_PACKAGE}@${FEISHU_OFFICIAL_PLUGIN_VERSION}`;

export function getBundledFeishuOfficialPluginDirCandidates(options: {
  resourcesDir: string;
  isPackaged: boolean;
  resourcesPath?: string;
}): string[] {
  return Array.from(new Set([
    join(options.resourcesDir, 'plugins', FEISHU_OFFICIAL_PLUGIN_ID),
    ...(options.isPackaged && options.resourcesPath
      ? [join(options.resourcesPath, 'openclaw-plugins', FEISHU_OFFICIAL_PLUGIN_ID)]
      : []),
  ]));
}

export function findBundledFeishuOfficialPluginDir(options: {
  resourcesDir: string;
  isPackaged: boolean;
  resourcesPath?: string;
  pathExists?: (candidate: string) => boolean;
}): string | undefined {
  const pathExists = options.pathExists ?? ((candidate: string) => existsSync(join(candidate, 'package.json')));

  return getBundledFeishuOfficialPluginDirCandidates(options)
    .find((candidate) => pathExists(candidate));
}

export function getFeishuOfficialPluginVersionFromDir(packageDir: string): string | null {
  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version.trim()
      ? parsed.version.trim()
      : null;
  } catch {
    return null;
  }
}

export function getInstalledFeishuOfficialPluginVersion(openClawConfigDir: string): string | null {
  return getFeishuOfficialPluginVersionFromDir(join(openClawConfigDir, 'extensions', FEISHU_OFFICIAL_PLUGIN_ID));
}
