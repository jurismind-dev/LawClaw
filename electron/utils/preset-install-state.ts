import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { getClawXConfigDir, getResourcesDir } from './paths';

export type PresetInstallItemKind = 'skill' | 'plugin';
export type PresetInstallMode = 'dir' | 'tgz' | 'market';
export type PresetInstallSkillMarket = 'jurismindhub';

interface PresetInstallBaseItem {
  kind: PresetInstallItemKind;
  id: string;
  displayName?: string;
  targetVersion: string;
}

export interface PresetInstallSkillItem {
  kind: 'skill';
  id: string;
  displayName?: string;
  targetVersion: string;
  market?: PresetInstallSkillMarket;
  installMode?: 'dir' | 'tgz';
  artifactPath: string;
  sha256: string;
}

export interface PresetInstallRemoteSkillItem {
  kind: 'skill';
  id: string;
  displayName?: string;
  targetVersion: string;
  installMode: 'market';
  market: PresetInstallSkillMarket;
  selection?: 'official-highlighted';
}

export interface PresetInstallPluginItem {
  kind: 'plugin';
  id: string;
  displayName?: string;
  targetVersion: string;
  artifactPath: string;
  sha256: string;
  installMode?: 'dir' | 'tgz';
}

export type PresetInstallItem =
  | PresetInstallSkillItem
  | PresetInstallRemoteSkillItem
  | PresetInstallPluginItem;

export interface PresetInstallManifest {
  schemaVersion: number;
  presetVersion: string;
  items: PresetInstallItem[];
}

export interface ManagedPresetInstallItemState {
  kind: PresetInstallItemKind;
  id: string;
  targetVersion: string;
  manifestHash: string;
  installedAt: string;
}

export interface PresetInstallState {
  schemaVersion: number;
  currentManifestHash?: string;
  managedItems: Record<string, ManagedPresetInstallItemState>;
  skipHashes: string[];
  lastResult?: {
    status: 'success' | 'failed' | 'skipped';
    manifestHash: string;
    message?: string;
    updatedAt: string;
  };
  updatedAt: string;
}

const PRESET_INSTALL_ROOT_DIR = 'preset-installs';
const PRESET_INSTALL_MANIFEST_FILE = 'manifest.json';
const PRESET_INSTALL_STATE_FILE = 'state.json';

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function normalizePresetInstallState(
  state: Partial<PresetInstallState> | undefined
): PresetInstallState {
  const nowIso = new Date().toISOString();
  return {
    schemaVersion: 1,
    currentManifestHash:
      typeof state?.currentManifestHash === 'string' ? state.currentManifestHash : undefined,
    managedItems:
      state?.managedItems && typeof state.managedItems === 'object' ? state.managedItems : {},
    skipHashes: Array.isArray(state?.skipHashes)
      ? state.skipHashes.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [],
    lastResult:
      state?.lastResult &&
      typeof state.lastResult === 'object' &&
      typeof state.lastResult.manifestHash === 'string' &&
      typeof state.lastResult.updatedAt === 'string'
        ? {
            status:
              state.lastResult.status === 'failed' || state.lastResult.status === 'skipped'
                ? state.lastResult.status
                : 'success',
            manifestHash: state.lastResult.manifestHash,
            message:
              typeof state.lastResult.message === 'string' ? state.lastResult.message : undefined,
            updatedAt: state.lastResult.updatedAt,
          }
        : undefined,
    updatedAt: typeof state?.updatedAt === 'string' ? state.updatedAt : nowIso,
  };
}

function assertManifestItem(item: unknown, index: number): PresetInstallItem {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`Invalid preset install item at index ${String(index)}: expected object`);
  }
  const raw = item as Record<string, unknown>;
  const kind = raw.kind;
  if (kind !== 'skill' && kind !== 'plugin') {
    throw new Error(`Invalid preset install item kind at index ${String(index)}`);
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const targetVersion = typeof raw.targetVersion === 'string' ? raw.targetVersion.trim() : '';
  const installMode =
    raw.installMode === 'dir' || raw.installMode === 'tgz' || raw.installMode === 'market'
      ? raw.installMode
      : undefined;
  const market = raw.market === 'jurismindhub' ? raw.market : undefined;
  const selection = raw.selection === 'official-highlighted' ? raw.selection : undefined;
  const artifactPath = typeof raw.artifactPath === 'string' ? raw.artifactPath.trim() : '';
  const sha256 = typeof raw.sha256 === 'string' ? raw.sha256.trim().toLowerCase() : '';
  const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : undefined;

  if (!id || !targetVersion) {
    throw new Error(`Invalid preset install item at index ${String(index)}: missing required fields`);
  }

  if (installMode === 'market') {
    if (kind !== 'skill') {
      throw new Error(
        `Invalid preset install item at index ${String(index)}: installMode=market only supports skill kind`
      );
    }
    if (market !== 'jurismindhub') {
      throw new Error(
        `Invalid preset install item at index ${String(index)}: installMode=market requires market=jurismindhub`
      );
    }
    if (raw.selection !== undefined && selection !== 'official-highlighted') {
      throw new Error(
        `Invalid preset install item at index ${String(index)}: installMode=market selection must be official-highlighted`
      );
    }
    return {
      kind: 'skill',
      id,
      targetVersion,
      displayName: displayName && displayName.length > 0 ? displayName : undefined,
      installMode: 'market',
      market,
      selection,
    };
  }

  if (!artifactPath || !sha256) {
    throw new Error(`Invalid preset install item at index ${String(index)}: missing artifact fields`);
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`Invalid preset install item at index ${String(index)}: sha256 must be 64 hex chars`);
  }

  const base: PresetInstallBaseItem = {
    kind,
    id,
    targetVersion,
    displayName: displayName && displayName.length > 0 ? displayName : undefined,
  };

  if (kind === 'skill') {
    return {
      ...base,
      kind: 'skill',
      artifactPath,
      sha256,
      installMode: installMode === 'dir' || installMode === 'tgz' ? installMode : undefined,
    };
  }

  return {
    ...base,
    kind: 'plugin',
    artifactPath,
    sha256,
    installMode: installMode === 'dir' || installMode === 'tgz' ? installMode : undefined,
  };
}

export function getPresetInstallManifestPath(resourcesDir = getResourcesDir()): string {
  return join(resourcesDir, PRESET_INSTALL_ROOT_DIR, PRESET_INSTALL_MANIFEST_FILE);
}

export function getPresetInstallRootPath(clawXConfigDir = getClawXConfigDir()): string {
  return join(clawXConfigDir, PRESET_INSTALL_ROOT_DIR);
}

export function getPresetInstallStatePath(clawXConfigDir = getClawXConfigDir()): string {
  return join(getPresetInstallRootPath(clawXConfigDir), PRESET_INSTALL_STATE_FILE);
}

export function readPresetInstallManifest(resourcesDir = getResourcesDir()): PresetInstallManifest {
  const manifestPath = getPresetInstallManifestPath(resourcesDir);
  if (!existsSync(manifestPath)) {
    throw new Error(`Preset install manifest not found: ${manifestPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (error) {
    throw new Error(`Failed to parse preset install manifest: ${String(error)}`, {
      cause: error,
    });
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid preset install manifest: ${manifestPath}`);
  }
  const raw = parsed as Record<string, unknown>;
  if (raw.schemaVersion !== 1) {
    throw new Error(`Unsupported preset install manifest schemaVersion: ${String(raw.schemaVersion)}`);
  }
  if (typeof raw.presetVersion !== 'string' || raw.presetVersion.trim().length === 0) {
    throw new Error(`Invalid preset install manifest presetVersion: ${manifestPath}`);
  }
  if (!Array.isArray(raw.items)) {
    throw new Error(`Invalid preset install manifest items: ${manifestPath}`);
  }

  const items = raw.items.map((item, index) => assertManifestItem(item, index));
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate preset install item id: ${key}`);
    }
    seen.add(key);
  }
  return {
    schemaVersion: 1,
    presetVersion: raw.presetVersion.trim(),
    items,
  };
}

export function computePresetInstallManifestHash(manifest: PresetInstallManifest): string {
  const canonical = JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    presetVersion: manifest.presetVersion,
    items: manifest.items
      .map((item) => ({
        kind: item.kind,
        id: item.id,
        targetVersion: item.targetVersion,
        artifactPath: 'artifactPath' in item ? item.artifactPath : null,
        sha256: 'sha256' in item ? item.sha256 : null,
        installMode: item.installMode,
        market: 'market' in item ? item.market : null,
        selection: 'selection' in item ? item.selection : null,
      }))
      .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
  });
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

export function resolvePresetInstallArtifactPath(
  artifactPath: string,
  resourcesDir = getResourcesDir()
): string {
  const rootDir = join(resourcesDir, PRESET_INSTALL_ROOT_DIR);
  const resolvedPath = resolve(rootDir, artifactPath);
  const rel = relative(rootDir, resolvedPath);
  if (isAbsolute(rel) || rel.startsWith('..')) {
    throw new Error(`Preset install artifact path escapes root directory: ${artifactPath}`);
  }
  return resolvedPath;
}

export function readPresetInstallState(clawXConfigDir = getClawXConfigDir()): PresetInstallState {
  const statePath = getPresetInstallStatePath(clawXConfigDir);
  if (!existsSync(statePath)) {
    return normalizePresetInstallState(undefined);
  }

  try {
    const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as Partial<PresetInstallState>;
    return normalizePresetInstallState(raw);
  } catch {
    return normalizePresetInstallState(undefined);
  }
}

export function writePresetInstallState(
  state: PresetInstallState,
  clawXConfigDir = getClawXConfigDir()
): void {
  const root = getPresetInstallRootPath(clawXConfigDir);
  ensureDir(root);
  const statePath = getPresetInstallStatePath(clawXConfigDir);
  writeFileSync(statePath, JSON.stringify(normalizePresetInstallState(state), null, 2), 'utf-8');
}
