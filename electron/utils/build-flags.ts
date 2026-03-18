import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

export interface LawClawBuildFlags {
  macUnsigned?: boolean;
}

interface LawClawPackageJson {
  lawclawBuild?: LawClawBuildFlags;
}

export function parseLawClawBuildFlags(pkg: unknown): LawClawBuildFlags {
  if (!pkg || typeof pkg !== 'object') return {};

  const maybeFlags = (pkg as LawClawPackageJson).lawclawBuild;
  if (!maybeFlags || typeof maybeFlags !== 'object') return {};

  return {
    macUnsigned: maybeFlags.macUnsigned === true,
  };
}

export function getLawClawBuildFlags(): LawClawBuildFlags {
  try {
    const packageJsonPath = join(app.getAppPath(), 'package.json');
    if (!existsSync(packageJsonPath)) return {};

    const raw = readFileSync(packageJsonPath, 'utf8');
    return parseLawClawBuildFlags(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function isUnsignedMacBuild(
  flags: LawClawBuildFlags = getLawClawBuildFlags(),
  platform: NodeJS.Platform = process.platform
): boolean {
  return platform === 'darwin' && flags.macUnsigned === true;
}
