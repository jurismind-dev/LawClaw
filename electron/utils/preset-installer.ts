import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { logger } from './logger';
import { sanitizePluginPackageManifestForLocalInstall } from './openclaw-plugin-install';
import { getOpenClawConfigDir } from './paths';
import {
  computePresetInstallManifestHash,
  getPresetInstallRootPath,
  PresetInstallItem,
  PresetInstallManifest,
  PresetInstallState,
  readPresetInstallManifest,
  readPresetInstallState,
  resolvePresetInstallArtifactPath,
  writePresetInstallState,
} from './preset-install-state';

export type PresetInstallPhase = 'setup' | 'upgrade';

export interface PresetInstallProgressEvent {
  runId: string;
  phase: PresetInstallPhase;
  itemId: string;
  kind: 'skill' | 'plugin';
  displayName: string;
  targetVersion: string;
  status: 'pending' | 'verifying' | 'installing' | 'completed' | 'skipped' | 'failed';
  progress: number;
  message?: string;
}

export interface PresetInstallStatusResult {
  pending: boolean;
  running: boolean;
  forceSync: boolean;
  manifestHash: string;
  presetVersion: string;
  hasState: boolean;
  blockedReason?: 'needs-run' | 'last-failed';
  plannedItems: Array<{
    id: string;
    kind: 'skill' | 'plugin';
    displayName: string;
    targetVersion: string;
  }>;
  lastResult?: {
    status: 'success' | 'failed' | 'skipped';
    manifestHash: string;
    message?: string;
    updatedAt: string;
  };
}

export interface PresetInstallRunResult {
  success: boolean;
  skipped?: boolean;
  message?: string;
  installed: string[];
  skippedItems: string[];
  failedItem?: string;
  error?: string;
}

interface PluginInstallResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

interface SkillMarketInstallResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

interface SkillMarketListResult {
  success: boolean;
  skills: Array<{
    id: string;
    displayName?: string;
    version?: string;
    isOfficial?: boolean;
    isFeatured?: boolean;
  }>;
  error?: string;
}

interface PluginUninstallResult {
  success: boolean;
  error?: string;
}

export interface PresetInstallerOptions {
  resourcesDir?: string;
  clawXConfigDir?: string;
  openClawConfigDir?: string;
  openClawSkillsDir?: string;
  installSkillFromMarket?: (params: {
    market: 'jurismindhub';
    skillId: string;
    version?: string;
  }) => Promise<SkillMarketInstallResult>;
  listMarketSkills?: (params: {
    market: 'jurismindhub';
    selection: 'official-highlighted';
  }) => Promise<SkillMarketListResult>;
  installPluginFromLocalPath: (pluginId: string, installPath: string) => Promise<PluginInstallResult>;
  uninstallPlugin: (pluginId: string) => Promise<PluginUninstallResult>;
  onProgress?: (event: PresetInstallProgressEvent) => void;
  onStatusChange?: (status: PresetInstallStatusResult) => void;
}

interface LoadedContext {
  manifest: PresetInstallManifest;
  manifestHash: string;
  state: PresetInstallState;
  pending: boolean;
  blockedReason?: 'needs-run' | 'last-failed';
}

function ensureDirSafe(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function compareVersionPart(a: string, b: string): number {
  const aNum = Number.parseInt(a, 10);
  const bNum = Number.parseInt(b, 10);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
    if (aNum > bNum) return 1;
    if (aNum < bNum) return -1;
    return 0;
  }
  return a.localeCompare(b);
}

/**
 * Basic semver-like comparison that is tolerant of non-standard suffixes.
 */
export function compareVersions(a: string, b: string): number {
  const aParts = a.split(/[^0-9A-Za-z]+/).filter(Boolean);
  const bParts = b.split(/[^0-9A-Za-z]+/).filter(Boolean);
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i += 1) {
    const aPart = aParts[i] ?? '0';
    const bPart = bParts[i] ?? '0';
    const partCmp = compareVersionPart(aPart, bPart);
    if (partCmp !== 0) {
      return partCmp;
    }
  }
  return 0;
}

async function computeFileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  hash.update(await readFile(filePath));
  return hash.digest('hex');
}

function collectFilesRecursively(rootDir: string, currentDir = rootDir, files: string[] = []): string[] {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(rootDir, fullPath, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function computeDirectorySha256(dirPath: string): Promise<string> {
  const files = collectFilesRecursively(dirPath).sort((a, b) => a.localeCompare(b));
  const hash = createHash('sha256');
  for (const filePath of files) {
    const rel = relative(dirPath, filePath).replaceAll('\\', '/');
    hash.update(rel, 'utf-8');
    hash.update('\n', 'utf-8');
    hash.update(await readFile(filePath));
    hash.update('\n', 'utf-8');
  }
  return hash.digest('hex');
}

async function computeArtifactSha256(path: string): Promise<string> {
  const stat = statSync(path);
  if (stat.isFile()) {
    return computeFileSha256(path);
  }
  if (stat.isDirectory()) {
    return computeDirectorySha256(path);
  }
  throw new Error(`Unsupported artifact type: ${path}`);
}

function readVersionFromPackageJson(packageDir: string): string | undefined {
  const pkgPath = join(packageDir, 'package.json');
  if (!existsSync(pkgPath)) {
    return undefined;
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: unknown };
    if (typeof pkg.version === 'string' && pkg.version.trim().length > 0) {
      return pkg.version.trim();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function extractTarGzArchive(archivePath: string): Promise<{ tempDir: string; packageDir: string }> {
  const tempDir = mkdtempSync(join(tmpdir(), 'lawclaw-preset-artifact-'));
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('tar', ['-xzf', archivePath, '-C', tempDir], { shell: false });
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      rejectPromise(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(stderr.trim() || `tar exited with code ${String(code)}`));
      }
    });
  });

  const npmPackedDir = join(tempDir, 'package');
  if (existsSync(npmPackedDir)) {
    return { tempDir, packageDir: npmPackedDir };
  }

  const firstDir = readdirSync(tempDir, { withFileTypes: true }).find((entry) => entry.isDirectory());
  if (firstDir) {
    return { tempDir, packageDir: join(tempDir, firstDir.name) };
  }
  return { tempDir, packageDir: tempDir };
}

function isForcePresetSyncEnabled(): boolean {
  const envValue = process.env.FORCE_PRESET_SYNC?.trim().toLowerCase();
  const envEnabled = envValue === 'true' || envValue === '1' || envValue === 'yes';
  return process.argv.includes('--force-preset-sync') || envEnabled;
}

function getManagedItemKey(kind: 'skill' | 'plugin', id: string): string {
  return `${kind}:${id}`;
}

const JURISMINDHUB_REGISTRY_URL = 'https://lawhub.jurismind.com';
const CLAWHUB_LOCKFILE_VERSION = 1;

interface ClawHubLockSkillEntry {
  version: string | null;
  installedAt: number;
}

interface ClawHubLockFile {
  version: number;
  skills: Record<string, ClawHubLockSkillEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class PresetInstaller {
  private readonly options: PresetInstallerOptions;
  private readonly openClawConfigDir: string;
  private readonly openClawSkillsDir: string;
  private running = false;
  private currentRunPromise: Promise<PresetInstallRunResult> | null = null;

  constructor(options: PresetInstallerOptions) {
    this.options = options;
    this.openClawConfigDir = options.openClawConfigDir ?? getOpenClawConfigDir();
    this.openClawSkillsDir = options.openClawSkillsDir ?? join(this.openClawConfigDir, 'skills');
  }

  private loadContext(): LoadedContext {
    const manifest = readPresetInstallManifest(this.options.resourcesDir);
    const manifestHash = computePresetInstallManifestHash(manifest);
    const state = readPresetInstallState(this.options.clawXConfigDir);
    const hasState = Boolean(state.currentManifestHash || state.lastResult || Object.keys(state.managedItems).length > 0);
    const forceSync = isForcePresetSyncEnabled();
    if (manifest.items.length === 0) {
      return { manifest, manifestHash, state, pending: false };
    }
    if (state.skipHashes.includes(manifestHash) && !forceSync) {
      return { manifest, manifestHash, state, pending: false };
    }
    if (state.currentManifestHash !== manifestHash) {
      return { manifest, manifestHash, state, pending: true, blockedReason: 'needs-run' };
    }
    if (state.lastResult?.manifestHash === manifestHash && state.lastResult.status === 'failed') {
      return { manifest, manifestHash, state, pending: true, blockedReason: 'last-failed' };
    }
    if (this.hasManagedItemDrift(state, manifestHash)) {
      return { manifest, manifestHash, state, pending: true, blockedReason: 'needs-run' };
    }
    if (!hasState && manifest.items.length > 0) {
      return { manifest, manifestHash, state, pending: true, blockedReason: 'needs-run' };
    }
    return { manifest, manifestHash, state, pending: forceSync };
  }

  private buildStatus(context: LoadedContext): PresetInstallStatusResult {
    return {
      pending: context.pending,
      running: this.running,
      forceSync: isForcePresetSyncEnabled(),
      manifestHash: context.manifestHash,
      presetVersion: context.manifest.presetVersion,
      hasState: Boolean(
        context.state.currentManifestHash ||
          context.state.lastResult ||
          Object.keys(context.state.managedItems).length > 0
      ),
      blockedReason: context.blockedReason,
      plannedItems: context.manifest.items
        .filter(
          (item) =>
            !(
              item.kind === 'skill' &&
              item.installMode === 'market' &&
              item.selection === 'official-highlighted'
            )
        )
        .map((item) => ({
          id: item.id,
          kind: item.kind,
          displayName: item.displayName || item.id,
          targetVersion: item.targetVersion,
        })),
      lastResult: context.state.lastResult,
    };
  }

  private emitStatusChange(context?: LoadedContext): void {
    if (!this.options.onStatusChange) {
      return;
    }
    const nextContext = context ?? this.loadContext();
    this.options.onStatusChange(this.buildStatus(nextContext));
  }

  private emitProgress(event: PresetInstallProgressEvent): void {
    this.options.onProgress?.(event);
  }

  getStatus(): PresetInstallStatusResult {
    return this.buildStatus(this.loadContext());
  }

  skipCurrentVersion(): PresetInstallStatusResult {
    const context = this.loadContext();
    const state = context.state;
    if (!state.skipHashes.includes(context.manifestHash)) {
      state.skipHashes.push(context.manifestHash);
    }
    state.lastResult = {
      status: 'skipped',
      manifestHash: context.manifestHash,
      message: 'skipped by user',
      updatedAt: new Date().toISOString(),
    };
    state.updatedAt = new Date().toISOString();
    writePresetInstallState(state, this.options.clawXConfigDir);
    const nextContext = this.loadContext();
    this.emitStatusChange(nextContext);
    return this.buildStatus(nextContext);
  }

  retry(phase: PresetInstallPhase): Promise<PresetInstallRunResult> {
    return this.run(phase);
  }

  private async expandManifestItems(items: PresetInstallManifest['items']): Promise<PresetInstallItem[]> {
    const expandedItems: PresetInstallItem[] = [];
    const seenKeys = new Set<string>();

    for (const item of items) {
      const isMarketSelection =
        item.kind === 'skill' &&
        item.installMode === 'market' &&
        item.selection === 'official-highlighted';
      if (!isMarketSelection) {
        const key = `${item.kind}:${item.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          expandedItems.push(item);
        }
        continue;
      }

      if (!this.options.listMarketSkills) {
        throw new Error('listMarketSkills bridge is not configured');
      }

      const listResult = await this.options.listMarketSkills({
        market: item.market,
        selection: 'official-highlighted',
      });
      if (!listResult.success) {
        throw new Error(listResult.error || 'failed to load market skills');
      }

      for (const marketSkill of listResult.skills) {
        const id = marketSkill.id?.trim();
        if (!id) {
          continue;
        }
        if (marketSkill.isOfficial === false || marketSkill.isFeatured === false) {
          continue;
        }
        const resolvedVersion = (marketSkill.version || '').trim();
        if (!resolvedVersion) {
          continue;
        }
        const key = `skill:${id}`;
        if (seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);
        expandedItems.push({
          kind: 'skill',
          id,
          displayName: marketSkill.displayName?.trim() || id,
          targetVersion: resolvedVersion,
          installMode: 'market',
          market: item.market,
        });
      }
    }

    return expandedItems;
  }

  private hasManagedItemDrift(state: PresetInstallState, manifestHash: string): boolean {
    const currentManagedItems = Object.values(state.managedItems).filter(
      (item) => item.manifestHash === manifestHash
    );
    if (currentManagedItems.length === 0) {
      return false;
    }

    return currentManagedItems.some((item) => {
      if (item.kind === 'skill') {
        return !existsSync(join(this.openClawSkillsDir, item.id));
      }
      const pluginDir = join(this.openClawConfigDir, 'extensions', item.id);
      return !existsSync(pluginDir);
    });
  }

  private getClawHubLockPath(): string {
    return join(this.openClawConfigDir, '.clawhub', 'lock.json');
  }

  private readClawHubLockFile(): ClawHubLockFile {
    const lockPath = this.getClawHubLockPath();
    if (!existsSync(lockPath)) {
      return { version: CLAWHUB_LOCKFILE_VERSION, skills: {} };
    }

    try {
      const parsed = JSON.parse(readFileSync(lockPath, 'utf-8')) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { version: CLAWHUB_LOCKFILE_VERSION, skills: {} };
      }

      const skills: Record<string, ClawHubLockSkillEntry> = {};
      const rawSkills = parsed.skills;
      if (rawSkills && typeof rawSkills === 'object' && !Array.isArray(rawSkills)) {
        for (const [slug, value] of Object.entries(rawSkills as Record<string, unknown>)) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            continue;
          }
          const rawEntry = value as Record<string, unknown>;
          const version = typeof rawEntry.version === 'string' || rawEntry.version === null
            ? rawEntry.version
            : null;
          const installedAt = typeof rawEntry.installedAt === 'number' && Number.isFinite(rawEntry.installedAt)
            ? rawEntry.installedAt
            : Date.now();
          skills[slug] = { version, installedAt };
        }
      }

      return {
        version:
          typeof parsed.version === 'number' && Number.isFinite(parsed.version)
            ? parsed.version
            : CLAWHUB_LOCKFILE_VERSION,
        skills,
      };
    } catch {
      return { version: CLAWHUB_LOCKFILE_VERSION, skills: {} };
    }
  }

  private writeClawHubLockFile(lock: ClawHubLockFile): void {
    const lockDir = join(this.openClawConfigDir, '.clawhub');
    ensureDirSafe(lockDir);
    const normalizedLock: ClawHubLockFile = {
      version: CLAWHUB_LOCKFILE_VERSION,
      skills: lock.skills,
    };
    writeFileSync(this.getClawHubLockPath(), `${JSON.stringify(normalizedLock, null, 2)}\n`, 'utf-8');
  }

  private upsertSkillInstallMetadata(
    item: Pick<Extract<PresetInstallItem, { kind: 'skill' }>, 'id' | 'targetVersion'>,
    skillDir: string,
    installedVersion = item.targetVersion
  ): void {
    const installedAt = Date.now();
    const skillMetaDir = join(skillDir, '.clawhub');
    ensureDirSafe(skillMetaDir);
    const originPath = join(skillMetaDir, 'origin.json');
    const originPayload = {
      version: 1,
      registry: JURISMINDHUB_REGISTRY_URL,
      slug: item.id,
      installedVersion,
      installedAt,
    };
    writeFileSync(originPath, `${JSON.stringify(originPayload, null, 2)}\n`, 'utf-8');

    const lock = this.readClawHubLockFile();
    lock.skills[item.id] = {
      version: installedVersion,
      installedAt,
    };
    this.writeClawHubLockFile(lock);
    this.ensureSkillEnabled(item.id);
  }

  private ensureSkillEnabled(skillId: string): void {
    const configPath = join(this.openClawConfigDir, 'openclaw.json');
    try {
      let config: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        const raw = readFileSync(configPath, 'utf-8').trim();
        if (raw.length > 0) {
          const parsed = JSON.parse(raw) as unknown;
          if (isRecord(parsed)) {
            config = parsed;
          }
        }
      }

      const skillsNode = isRecord(config.skills) ? config.skills : {};
      const entriesNode = isRecord(skillsNode.entries) ? skillsNode.entries : {};
      const existingEntry = isRecord(entriesNode[skillId]) ? entriesNode[skillId] : {};
      entriesNode[skillId] = { ...existingEntry, enabled: true };
      skillsNode.entries = entriesNode;
      config.skills = skillsNode;

      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    } catch (error) {
      logger.warn(`[PresetInstaller] failed to mark skill enabled: ${skillId}`, error);
    }
  }

  private removeSkillFromClawHubLock(skillId: string): void {
    const lockPath = this.getClawHubLockPath();
    if (!existsSync(lockPath)) {
      return;
    }
    const lock = this.readClawHubLockFile();
    if (!Object.prototype.hasOwnProperty.call(lock.skills, skillId)) {
      return;
    }
    delete lock.skills[skillId];
    this.writeClawHubLockFile(lock);
  }

  async run(phase: PresetInstallPhase): Promise<PresetInstallRunResult> {
    if (this.currentRunPromise) {
      return this.currentRunPromise;
    }

    const runPromise = this.runInternal(phase).finally(() => {
      this.running = false;
      this.currentRunPromise = null;
      this.emitStatusChange();
    });
    this.currentRunPromise = runPromise;
    return runPromise;
  }

  private async runInternal(phase: PresetInstallPhase): Promise<PresetInstallRunResult> {
    this.running = true;
    const runId = randomUUID();
    const context = this.loadContext();
    this.emitStatusChange(context);

    if (!context.pending && !isForcePresetSyncEnabled()) {
      return {
        success: true,
        skipped: true,
        message: 'preset install is already up to date',
        installed: [],
        skippedItems: [],
      };
    }

    const state = context.state;
    const installed: string[] = [];
    const skippedItems: string[] = [];
    let runtimeItems: PresetInstallManifest['items'] = context.manifest.items;
    let total = Math.max(runtimeItems.length, 1);
    let shouldRestartGateway = false;

    try {
      runtimeItems = await this.expandManifestItems(context.manifest.items);
      total = Math.max(runtimeItems.length, 1);
      const runtimeManifest: PresetInstallManifest = {
        ...context.manifest,
        items: runtimeItems,
      };

      if (isForcePresetSyncEnabled()) {
        await this.reconcileManagedItemsStrict(runtimeManifest, state);
      }

      for (let index = 0; index < runtimeItems.length; index += 1) {
        const item = runtimeItems[index];
        const displayName = item.displayName || item.id;
        const baseProgress = Math.round((index / total) * 100);
        const isRemoteMarketSkill = item.kind === 'skill' && item.installMode === 'market';
        this.emitProgress({
          runId,
          phase,
          itemId: item.id,
          kind: item.kind,
          displayName,
          targetVersion: item.targetVersion,
          status: 'pending',
          progress: baseProgress,
        });

        let artifactPath: string | undefined;
        this.emitProgress({
          runId,
          phase,
          itemId: item.id,
          kind: item.kind,
          displayName,
          targetVersion: item.targetVersion,
          status: 'verifying',
          progress: Math.min(baseProgress + 5, 100),
        });

        if (!isRemoteMarketSkill) {
          artifactPath = resolvePresetInstallArtifactPath(item.artifactPath, this.options.resourcesDir);
          if (!existsSync(artifactPath)) {
            throw new Error(`Preset artifact not found for ${item.kind}:${item.id} -> ${artifactPath}`);
          }
          const actualHash = await computeArtifactSha256(artifactPath);
          if (actualHash.toLowerCase() !== item.sha256.toLowerCase()) {
            throw new Error(
              `SHA256 mismatch for ${item.kind}:${item.id}; expected ${item.sha256}, got ${actualHash}`
            );
          }
        }

        this.emitProgress({
          runId,
          phase,
          itemId: item.id,
          kind: item.kind,
          displayName,
          targetVersion: item.targetVersion,
          status: 'installing',
          progress: Math.min(baseProgress + 12, 100),
        });

        const itemResult =
          item.kind === 'skill'
            ? isRemoteMarketSkill
              ? await this.installSkillFromMarket(item)
              : await this.installSkill(item, artifactPath || '')
            : await this.installPlugin(item, artifactPath || '');

        if (itemResult.failed) {
          this.emitProgress({
            runId,
            phase,
            itemId: item.id,
            kind: item.kind,
            displayName,
            targetVersion: item.targetVersion,
            status: 'failed',
            progress: Math.min(Math.round(((index + 1) / total) * 100), 100),
            message: itemResult.message,
          });
          throw new Error(itemResult.message);
        }

        if (itemResult.shouldRestartGateway) {
          shouldRestartGateway = true;
        }

        if (itemResult.skipped) {
          skippedItems.push(`${item.kind}:${item.id}`);
          this.emitProgress({
            runId,
            phase,
            itemId: item.id,
            kind: item.kind,
            displayName,
            targetVersion: item.targetVersion,
            status: 'skipped',
            progress: Math.min(Math.round(((index + 1) / total) * 100), 100),
            message: itemResult.message,
          });
        } else {
          installed.push(`${item.kind}:${item.id}`);
          state.managedItems[getManagedItemKey(item.kind, item.id)] = {
            kind: item.kind,
            id: item.id,
            targetVersion: item.targetVersion,
            manifestHash: context.manifestHash,
            installedAt: new Date().toISOString(),
          };
          this.emitProgress({
            runId,
            phase,
            itemId: item.id,
            kind: item.kind,
            displayName,
            targetVersion: item.targetVersion,
            status: 'completed',
            progress: Math.min(Math.round(((index + 1) / total) * 100), 100),
            message: itemResult.message,
          });
        }
      }

      state.skipHashes = state.skipHashes.filter((hash) => hash !== context.manifestHash);
      state.currentManifestHash = context.manifestHash;
      state.lastResult = {
        status: 'success',
        manifestHash: context.manifestHash,
        message:
          installed.length > 0
            ? `installed ${installed.length} preset items`
            : 'all preset items were already up to date',
        updatedAt: new Date().toISOString(),
      };
      state.updatedAt = new Date().toISOString();
      writePresetInstallState(state, this.options.clawXConfigDir);

      if (shouldRestartGateway && phase === 'setup') {
        logger.info('[PresetInstaller] setup run installed plugin(s); gateway restart may be required');
      }

      return {
        success: true,
        installed,
        skippedItems,
      };
    } catch (error) {
      state.lastResult = {
        status: 'failed',
        manifestHash: context.manifestHash,
        message: String(error),
        updatedAt: new Date().toISOString(),
      };
      state.updatedAt = new Date().toISOString();
      writePresetInstallState(state, this.options.clawXConfigDir);
      return {
        success: false,
        installed,
        skippedItems,
        failedItem: installed.length + skippedItems.length < runtimeItems.length
          ? runtimeItems[installed.length + skippedItems.length]?.id
          : undefined,
        error: String(error),
      };
    }
  }

  private async reconcileManagedItemsStrict(
    manifest: PresetInstallManifest,
    state: PresetInstallState
  ): Promise<void> {
    const targetKeys = new Set(manifest.items.map((item) => getManagedItemKey(item.kind, item.id)));
    const staleItems = Object.entries(state.managedItems).filter(([key]) => !targetKeys.has(key));

    for (const [key, managed] of staleItems) {
      try {
        if (managed.kind === 'skill') {
          const skillDir = join(this.openClawSkillsDir, managed.id);
          if (existsSync(skillDir)) {
            rmSync(skillDir, { recursive: true, force: true });
          }
          this.removeSkillFromClawHubLock(managed.id);
        } else {
          const result = await this.options.uninstallPlugin(managed.id);
          if (!result.success) {
            logger.warn(`[PresetInstaller] strict reconcile failed to uninstall plugin ${managed.id}:`, result.error);
          }
        }
      } catch (error) {
        logger.warn(`[PresetInstaller] strict reconcile cleanup failed for ${managed.kind}:${managed.id}`, error);
      }
      delete state.managedItems[key];
    }
  }

  private async installSkill(
    item: Extract<PresetInstallItem, { kind: 'skill'; installMode?: 'dir' | 'tgz' }>,
    artifactPath: string
  ): Promise<{ skipped: boolean; shouldRestartGateway: boolean; message?: string; failed?: boolean }> {
    ensureDirSafe(this.openClawSkillsDir);
    const skillDir = join(this.openClawSkillsDir, item.id);
    const existingVersion = existsSync(skillDir) ? readVersionFromPackageJson(skillDir) : undefined;
    if (existingVersion && compareVersions(existingVersion, item.targetVersion) >= 0) {
      this.upsertSkillInstallMetadata(item, skillDir, existingVersion);
      return {
        skipped: true,
        shouldRestartGateway: false,
        message: `kept existing skill version ${existingVersion}`,
      };
    }

    const installMode = item.installMode || (artifactPath.endsWith('.tgz') ? 'tgz' : 'dir');
    let tempExtractDir: string | undefined;
    let sourceDir = artifactPath;

    try {
      if (installMode === 'tgz') {
        const extracted = await extractTarGzArchive(artifactPath);
        tempExtractDir = extracted.tempDir;
        sourceDir = extracted.packageDir;
      }

      if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
        return {
          skipped: false,
          shouldRestartGateway: false,
          failed: true,
          message: `Invalid skill artifact directory: ${sourceDir}`,
        };
      }

      const backupsRoot = join(getPresetInstallRootPath(this.options.clawXConfigDir), 'backups', 'skills');
      if (existsSync(skillDir)) {
        ensureDirSafe(backupsRoot);
        const backupPath = join(backupsRoot, `${item.id}-${Date.now()}`);
        renameSync(skillDir, backupPath);
      }
      rmSync(skillDir, { recursive: true, force: true });
      cpSync(sourceDir, skillDir, { recursive: true, dereference: true });
      const installedVersion = readVersionFromPackageJson(skillDir) ?? item.targetVersion;
      this.upsertSkillInstallMetadata(item, skillDir, installedVersion);
      return {
        skipped: false,
        shouldRestartGateway: false,
      };
    } catch (error) {
      return {
        skipped: false,
        shouldRestartGateway: false,
        failed: true,
        message: `Failed to install skill ${item.id}: ${String(error)}`,
      };
    } finally {
      if (tempExtractDir) {
        rmSync(tempExtractDir, { recursive: true, force: true });
      }
    }
  }

  private async installSkillFromMarket(
    item: Extract<PresetInstallItem, { kind: 'skill'; installMode: 'market' }>
  ): Promise<{ skipped: boolean; shouldRestartGateway: boolean; message?: string; failed?: boolean }> {
    if (!this.options.installSkillFromMarket) {
      return {
        skipped: false,
        shouldRestartGateway: false,
        failed: true,
        message: 'installSkillFromMarket bridge is not configured',
      };
    }

    ensureDirSafe(this.openClawSkillsDir);
    const skillDir = join(this.openClawSkillsDir, item.id);
    const existingVersion = existsSync(skillDir) ? readVersionFromPackageJson(skillDir) : undefined;
    if (existingVersion && compareVersions(existingVersion, item.targetVersion) >= 0) {
      this.upsertSkillInstallMetadata(item, skillDir, existingVersion);
      return {
        skipped: true,
        shouldRestartGateway: false,
        message: `kept existing skill version ${existingVersion}`,
      };
    }

    const result = await this.options.installSkillFromMarket({
      market: item.market,
      skillId: item.id,
      version: item.targetVersion,
    });

    if (!result.success) {
      return {
        skipped: false,
        shouldRestartGateway: false,
        failed: true,
        message: result.error || `Failed to install market skill ${item.id}`,
      };
    }

    if (result.skipped) {
      if (existsSync(skillDir)) {
        const installedVersion = readVersionFromPackageJson(skillDir) ?? item.targetVersion;
        this.upsertSkillInstallMetadata(item, skillDir, installedVersion);
      }
      return {
        skipped: true,
        shouldRestartGateway: false,
        message: result.reason || 'already installed',
      };
    }

    if (!existsSync(skillDir)) {
      return {
        skipped: false,
        shouldRestartGateway: false,
        failed: true,
        message: `Market skill ${item.id} installed but skill directory was not found`,
      };
    }

    const installedVersion = readVersionFromPackageJson(skillDir) ?? item.targetVersion;
    this.upsertSkillInstallMetadata(item, skillDir, installedVersion);
    return {
      skipped: false,
      shouldRestartGateway: false,
      message: `installed from ${item.market}`,
    };
  }

  private async installPlugin(
    item: Extract<PresetInstallItem, { kind: 'plugin' }>,
    artifactPath: string
  ): Promise<{ skipped: boolean; shouldRestartGateway: boolean; message?: string; failed?: boolean }> {
    const pluginDir = join(this.openClawConfigDir, 'extensions', item.id);
    const existingVersion = existsSync(pluginDir) ? readVersionFromPackageJson(pluginDir) : undefined;
    if (existingVersion && compareVersions(existingVersion, item.targetVersion) >= 0) {
      return {
        skipped: true,
        shouldRestartGateway: false,
        message: `kept existing plugin version ${existingVersion}`,
      };
    }

    const installMode = item.installMode || (artifactPath.endsWith('.tgz') ? 'tgz' : 'dir');
    let tempExtractDir: string | undefined;
    let installPath = artifactPath;

    try {
      if (installMode === 'tgz') {
        const extracted = await extractTarGzArchive(artifactPath);
        tempExtractDir = extracted.tempDir;
        installPath = extracted.packageDir;
      }

      if (item.id === 'qqbot') {
        try {
          sanitizePluginPackageManifestForLocalInstall(installPath);
        } catch (error) {
          return {
            skipped: false,
            shouldRestartGateway: false,
            failed: true,
            message: `Failed to sanitize plugin ${item.id} at ${installPath}: ${String(error)}`,
          };
        }
      }

      const result = await this.options.installPluginFromLocalPath(item.id, installPath);
      if (!result.success) {
        return {
          skipped: false,
          shouldRestartGateway: false,
          failed: true,
          message: result.error || `Failed to install plugin ${item.id}`,
        };
      }
      if (result.skipped) {
        return {
          skipped: true,
          shouldRestartGateway: false,
          message: result.reason || 'already installed',
        };
      }
      return {
        skipped: false,
        shouldRestartGateway: true,
      };
    } catch (error) {
      return {
        skipped: false,
        shouldRestartGateway: false,
        failed: true,
        message: `Failed to install plugin ${item.id}: ${String(error)}`,
      };
    } finally {
      if (tempExtractDir) {
        rmSync(tempExtractDir, { recursive: true, force: true });
      }
    }
  }
}
