import { createHash, randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import { homedir } from 'os';
import { logger } from './logger';
import { getClawXConfigDir, getOpenClawConfigDir, getResourcesDir } from './paths';
import { readJson5File, writeJsonFile } from './openclaw-json5';

interface PresetWorkspaceFile {
  agentId: string;
  source: string;
  target: string;
}

interface PresetManifest {
  schemaVersion: number;
  templateRoot: string;
  workspaceFiles: PresetWorkspaceFile[];
  configPatch?: string;
}

interface PresetState {
  schemaVersion: number;
  currentHash?: string;
  updateHash?: string;
  managedFiles: Record<string, string>;
  updatedAt: string;
}

interface SnapshotMeta {
  schemaVersion: number;
  presetHash: string;
  generatedAt: string;
  appVersion: string;
}

interface RuntimeTaskContext {
  migrationMode: MigrationMode;
  manifest: PresetManifest;
  openClawConfigDir: string;
  clawXConfigDir: string;
  configPath: string;
  config: Record<string, unknown>;
  sourceHash?: string;
  targetHash: string;
  forceLawclawAgentPreset: boolean;
  vCurrentDir: string;
  vUpdateDir: string;
}

interface UpgradeWorkspaceBackupFileMeta {
  target: string;
  sourcePath: string;
  relativeBackupPath: string;
  existed: boolean;
  sha256?: string;
  bytes?: number;
}

interface UpgradeWorkspaceBackupMeta {
  schemaVersion: number;
  createdAt: string;
  taskId: string;
  sourceHash?: string;
  targetHash: string;
  backupDirName: string;
  agentId: string;
  workspacePath: string;
  files: UpgradeWorkspaceBackupFileMeta[];
}

interface DeterministicWorkspaceUpgradePlanItem {
  key: string;
  agentId: string;
  target: string;
  destinationPath: string;
  baseOld?: string;
  baseNew: string;
  userCurrent?: string;
  action: 'noop' | 'overwrite' | 'create' | 'skip';
}

interface DeterministicWorkspaceUpgradePlan {
  items: DeterministicWorkspaceUpgradePlanItem[];
  backupItems: DeterministicWorkspaceUpgradePlanItem[];
}

interface AgentPresetMigrationSummary {
  createdFiles: number;
  updatedFiles: number;
  skippedFiles: number;
  skippedTargets: string[];
  configUpdated: boolean;
}

export type AgentPresetMigrationFailureReason = 'PARTIAL_UPDATE' | 'APPLY_FAILED';

export interface AgentPresetMigrationOptions {
  resourcesDir?: string;
  openClawConfigDir?: string;
  clawXConfigDir?: string;
  forceLawclawAgentPreset?: boolean;
  now?: () => number;
  appVersion?: string;
}

export interface AgentPresetMigrationStatus {
  state: 'idle' | 'running' | 'warning' | 'failed';
  reason?: AgentPresetMigrationFailureReason;
  message?: string;
  targetHash?: string;
  updatedFiles?: number;
  createdFiles?: number;
  skippedFiles?: number;
  skippedTargets?: string[];
  updatedAt: string;
}

type MigrationMode = 'bootstrap' | 'upgrade' | 'noop';

const PRESET_ROOT_DIR = 'agent-presets';
const LOCAL_PRESET_ROOT = 'agent-presets';
const STATE_FILE = 'state.json';
const BACKUPS_DIR = 'backups';
const V_CURRENT_DIR = 'v_current';
const V_UPDATE_DIR = 'v_update';
const UPGRADE_BACKUP_RETRY_DELAYS_MS = [200, 500, 1000];
const CLEAR_DIRECTORY_NATIVE_MAX_RETRIES = 5;
const CLEAR_DIRECTORY_NATIVE_RETRY_DELAY_MS = 100;
const CLEAR_DIRECTORY_RETRY_DELAYS_MS = [100, 250, 500];
const CLEAR_DIRECTORY_RETRY_CODES = new Set(['ENOTEMPTY', 'EPERM', 'EBUSY']);
const DEDICATED_AGENT_ID = 'lawclaw-main';
const DEDICATED_AGENT_WORKSPACE = '~/.openclaw/workspace-lawclaw-main';

const emitter = new EventEmitter();
let running = false;
let status: AgentPresetMigrationStatus = {
  state: 'idle',
  updatedAt: new Date().toISOString(),
};

const migrationTestHooks = {
  rmSync,
  sleep: (ms: number) => sleep(ms),
};

export function __setAgentPresetMigrationTestHooks(hooks: {
  rmSync?: typeof rmSync;
  sleep?: (ms: number) => Promise<void>;
}): void {
  migrationTestHooks.rmSync = hooks.rmSync ?? rmSync;
  migrationTestHooks.sleep = hooks.sleep ?? ((ms: number) => sleep(ms));
}

export function __resetAgentPresetMigrationTestHooks(): void {
  migrationTestHooks.rmSync = rmSync;
  migrationTestHooks.sleep = (ms: number) => sleep(ms);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function ensureParentDir(filePath: string): void {
  ensureDir(dirname(filePath));
}

function readTextFileIfExists(filePath: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  return readFileSync(filePath, 'utf-8');
}

function writeTextFile(filePath: string, content: string): void {
  ensureParentDir(filePath);
  writeFileSync(filePath, content, 'utf-8');
}

function getWorkspaceFileKey(file: Pick<PresetWorkspaceFile, 'agentId' | 'target'>): string {
  return `${file.agentId}:${file.target}`;
}

function getPresetRoot(resourcesDir: string): string {
  return join(resourcesDir, PRESET_ROOT_DIR);
}

function getLocalPresetRoot(clawXConfigDir: string): string {
  return join(clawXConfigDir, LOCAL_PRESET_ROOT);
}

function getStatePath(clawXConfigDir: string): string {
  return join(getLocalPresetRoot(clawXConfigDir), STATE_FILE);
}

function getBackupsPath(clawXConfigDir: string): string {
  return join(getLocalPresetRoot(clawXConfigDir), BACKUPS_DIR);
}

function getVCurrentPath(clawXConfigDir: string): string {
  return join(getLocalPresetRoot(clawXConfigDir), V_CURRENT_DIR);
}

function getVUpdatePath(clawXConfigDir: string): string {
  return join(getLocalPresetRoot(clawXConfigDir), V_UPDATE_DIR);
}

function copyDirectoryRecursive(sourceDir: string, destinationDir: string): void {
  if (!existsSync(sourceDir)) {
    return;
  }

  ensureDir(destinationDir);
  const entries = readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const destinationPath = join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, destinationPath);
      continue;
    }
    if (entry.isFile()) {
      ensureParentDir(destinationPath);
      copyFileSync(sourcePath, destinationPath);
    }
  }
}

function isRetriableClearDirectoryError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    CLEAR_DIRECTORY_RETRY_CODES.has(error.code)
  );
}

function createClearDirectoryError(dirPath: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Failed to clear directory ${dirPath}: ${message}`);
}

async function clearDirectoryWithRetry(dirPath: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= CLEAR_DIRECTORY_RETRY_DELAYS_MS.length; attempt++) {
    if (!existsSync(dirPath)) {
      return;
    }

    try {
      migrationTestHooks.rmSync(dirPath, {
        recursive: true,
        force: true,
        maxRetries: CLEAR_DIRECTORY_NATIVE_MAX_RETRIES,
        retryDelay: CLEAR_DIRECTORY_NATIVE_RETRY_DELAY_MS,
      });
      return;
    } catch (error) {
      if (!isRetriableClearDirectoryError(error)) {
        throw createClearDirectoryError(dirPath, error);
      }

      lastError = error;
      if (attempt === CLEAR_DIRECTORY_RETRY_DELAYS_MS.length) {
        break;
      }

      await migrationTestHooks.sleep(CLEAR_DIRECTORY_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw createClearDirectoryError(dirPath, lastError);
}

function normalizePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
}

function loadManifest(presetRoot: string): PresetManifest {
  const manifestPath = join(presetRoot, 'manifest.json');
  const manifest = readJson5File<PresetManifest | null>(manifestPath, null);
  if (!manifest || manifest.schemaVersion !== 2 || !Array.isArray(manifest.workspaceFiles)) {
    throw new Error(`Invalid agent preset manifest: ${manifestPath}`);
  }
  return manifest;
}

function computePresetHash(presetRoot: string, manifest: PresetManifest): string {
  const manifestPath = join(presetRoot, 'manifest.json');
  const manifestRaw = readTextFileIfExists(manifestPath);
  if (manifestRaw === undefined) {
    throw new Error(`Missing manifest file: ${manifestPath}`);
  }

  const hash = createHash('sha256');
  hash.update('manifest:\n');
  hash.update(manifestRaw, 'utf-8');

  const templateRoot = join(presetRoot, manifest.templateRoot);
  const fileSet = new Set<string>();
  for (const file of manifest.workspaceFiles) {
    fileSet.add(normalizePath(file.source));
  }
  if (manifest.configPatch) {
    fileSet.add(normalizePath(manifest.configPatch));
  }

  for (const relativePath of Array.from(fileSet).sort()) {
    const absolutePath = join(templateRoot, relativePath);
    const content = readTextFileIfExists(absolutePath);
    if (content === undefined) {
      throw new Error(`Missing template file for hash: ${absolutePath}`);
    }
    hash.update(`\nfile:${relativePath}\n`);
    hash.update(content, 'utf-8');
  }

  return hash.digest('hex');
}

function readSnapshotMeta(snapshotDir: string): SnapshotMeta | undefined {
  const metaPath = join(snapshotDir, 'meta.json');
  const meta = readJson5File<SnapshotMeta | undefined>(metaPath, undefined);
  if (!meta || typeof meta.presetHash !== 'string') {
    return undefined;
  }
  return meta;
}

function writeSnapshotMeta(snapshotDir: string, meta: SnapshotMeta): void {
  ensureDir(snapshotDir);
  writeJsonFile(join(snapshotDir, 'meta.json'), meta);
}

function loadSnapshotFileIfExists(snapshotDir: string, relativePath: string): string | undefined {
  return readTextFileIfExists(join(snapshotDir, relativePath));
}

function loadSnapshotFile(snapshotDir: string, relativePath: string): string {
  const content = loadSnapshotFileIfExists(snapshotDir, relativePath);
  if (content === undefined) {
    throw new Error(`Missing snapshot file: ${join(snapshotDir, relativePath)}`);
  }
  return content;
}

async function syncVUpdateFromResources(
  templateRoot: string,
  vUpdateDir: string,
  targetHash: string,
  appVersion: string
): Promise<void> {
  const currentMeta = readSnapshotMeta(vUpdateDir);
  if (currentMeta?.presetHash === targetHash) {
    return;
  }

  await clearDirectoryWithRetry(vUpdateDir);
  copyDirectoryRecursive(templateRoot, vUpdateDir);
  writeSnapshotMeta(vUpdateDir, {
    schemaVersion: 1,
    presetHash: targetHash,
    generatedAt: new Date().toISOString(),
    appVersion,
  });
}

async function promoteVUpdateToVCurrent(vUpdateDir: string, vCurrentDir: string): Promise<void> {
  await clearDirectoryWithRetry(vCurrentDir);
  copyDirectoryRecursive(vUpdateDir, vCurrentDir);
}

function loadState(statePath: string): PresetState | undefined {
  const state = readJson5File<PresetState | undefined>(statePath, undefined);
  if (!state || typeof state.schemaVersion !== 'number') {
    return undefined;
  }
  return state;
}

function persistState(statePath: string, stateValue: PresetState): void {
  writeJsonFile(statePath, stateValue);
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function sanitizeBackupSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeBackupRelativeTarget(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Invalid backup target path: ${targetPath}`);
  }
  return segments.join('/');
}

function buildUpgradeBackupDirName(taskId: string, targetHash: string, nowMs: number): string {
  const timestamp = new Date(nowMs).toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${sanitizeBackupSegment(taskId)}-${sanitizeBackupSegment(targetHash).slice(0, 8) || 'unknown'}`;
}

function mergeArrayAdditive(current: unknown[], patch: unknown[]): { next: unknown[]; changed: boolean } {
  const next = [...current];
  let changed = false;

  for (const patchItem of patch) {
    if (isRecord(patchItem) && typeof patchItem.id === 'string') {
      const index = next.findIndex((item) => isRecord(item) && item.id === patchItem.id);
      if (index === -1) {
        next.push(deepClone(patchItem));
        changed = true;
        continue;
      }

      const existing = next[index];
      if (isRecord(existing)) {
        const merged = mergeRecordAdditive(existing, patchItem);
        if (merged.changed) {
          next[index] = merged.next;
          changed = true;
        }
      }
      continue;
    }

    const patchText = JSON.stringify(patchItem);
    const exists = next.some((item) => JSON.stringify(item) === patchText);
    if (!exists) {
      next.push(deepClone(patchItem));
      changed = true;
    }
  }

  return { next, changed };
}

function mergeRecordAdditive(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): { next: Record<string, unknown>; changed: boolean } {
  const next: Record<string, unknown> = deepClone(current);
  let changed = false;

  for (const [key, patchValue] of Object.entries(patch)) {
    if (!(key in next)) {
      next[key] = deepClone(patchValue);
      changed = true;
      continue;
    }

    const currentValue = next[key];
    if (Array.isArray(currentValue) && Array.isArray(patchValue)) {
      const merged = mergeArrayAdditive(currentValue, patchValue);
      if (merged.changed) {
        next[key] = merged.next;
        changed = true;
      }
      continue;
    }

    if (isRecord(currentValue) && isRecord(patchValue)) {
      const merged = mergeRecordAdditive(currentValue, patchValue);
      if (merged.changed) {
        next[key] = merged.next;
        changed = true;
      }
    }
  }

  return { next, changed };
}

function expandOpenClawPath(pathValue: string, openClawConfigDir: string): string {
  if (pathValue.startsWith('~/.openclaw')) {
    return join(openClawConfigDir, pathValue.slice('~/.openclaw'.length));
  }
  if (pathValue.startsWith('~')) {
    return join(homedir(), pathValue.slice(1));
  }
  if (isAbsolute(pathValue)) {
    return pathValue;
  }
  return join(openClawConfigDir, pathValue);
}

function findAgentConfig(config: Record<string, unknown>, agentId: string): Record<string, unknown> | undefined {
  const agents = isRecord(config.agents) ? config.agents : undefined;
  const list = Array.isArray(agents?.list) ? agents.list : undefined;
  if (!list) {
    return undefined;
  }

  for (const item of list) {
    if (isRecord(item) && item.id === agentId) {
      return item;
    }
  }

  return undefined;
}

function ensureDedicatedAgentInConfig(config: Record<string, unknown>): {
  next: Record<string, unknown>;
  changed: boolean;
} {
  const next = deepClone(config);
  let changed = false;

  const agents = isRecord(next.agents) ? { ...next.agents } : {};
  if (!isRecord(next.agents)) {
    changed = true;
  }

  const currentList = Array.isArray(agents.list) ? agents.list : [];
  if (!Array.isArray(agents.list)) {
    changed = true;
  }

  const dedicatedAgent = currentList.find(
    (item): item is Record<string, unknown> => isRecord(item) && item.id === DEDICATED_AGENT_ID
  );
  if (!dedicatedAgent) {
    currentList.push({
      id: DEDICATED_AGENT_ID,
      name: 'LawClaw 主智能体',
      workspace: DEDICATED_AGENT_WORKSPACE,
    });
    changed = true;
  } else {
    if (dedicatedAgent.workspace !== DEDICATED_AGENT_WORKSPACE) {
      dedicatedAgent.workspace = DEDICATED_AGENT_WORKSPACE;
      changed = true;
    }

    if ('workspaceDir' in dedicatedAgent) {
      delete dedicatedAgent.workspaceDir;
      changed = true;
    }

  }

  agents.list = currentList;
  next.agents = agents;
  return { next, changed };
}

function resolveAgentWorkspace(config: Record<string, unknown>, openClawConfigDir: string, agentId: string): string {
  const agent = findAgentConfig(config, agentId);
  const workspaceDir =
    typeof agent?.workspace === 'string' && agent.workspace.trim()
      ? agent.workspace
      : typeof agent?.workspaceDir === 'string' && agent.workspaceDir.trim()
        ? agent.workspaceDir
        : agentId === 'main'
          ? '~/.openclaw/workspace'
          : `~/.openclaw/workspace-${agentId}`;

  return expandOpenClawPath(workspaceDir, openClawConfigDir);
}

function loadConfigPatchFromVUpdate(vUpdateDir: string, manifest: PresetManifest): Record<string, unknown> | undefined {
  if (!manifest.configPatch) {
    return undefined;
  }
  return readJson5File<Record<string, unknown> | undefined>(join(vUpdateDir, manifest.configPatch), undefined);
}

function resolveMigrationMode(
  hasCurrentSnapshot: boolean,
  sourceHash: string | undefined,
  targetHash: string,
  forceLawclawAgentPreset: boolean
): MigrationMode {
  if (!hasCurrentSnapshot) {
    return 'bootstrap';
  }
  if (sourceHash === targetHash && !forceLawclawAgentPreset) {
    return 'noop';
  }
  return 'upgrade';
}

async function prepareRuntimeContext(options: AgentPresetMigrationOptions): Promise<RuntimeTaskContext> {
  const resourcesDir = options.resourcesDir ?? getResourcesDir();
  const openClawConfigDir = options.openClawConfigDir ?? getOpenClawConfigDir();
  const clawXConfigDir = options.clawXConfigDir ?? getClawXConfigDir();
  const forceLawclawAgentPreset = options.forceLawclawAgentPreset === true;

  const presetRoot = getPresetRoot(resourcesDir);
  const manifest = loadManifest(presetRoot);
  const templateRoot = join(presetRoot, manifest.templateRoot);
  if (!existsSync(templateRoot)) {
    throw new Error(`Preset template root not found: ${templateRoot}`);
  }

  const localPresetRoot = getLocalPresetRoot(clawXConfigDir);
  ensureDir(localPresetRoot);

  const targetHash = computePresetHash(presetRoot, manifest);
  const appVersion = options.appVersion ?? process.env.npm_package_version ?? '0.0.0';
  const vUpdateDir = getVUpdatePath(clawXConfigDir);
  await syncVUpdateFromResources(templateRoot, vUpdateDir, targetHash, appVersion);

  const vCurrentDir = getVCurrentPath(clawXConfigDir);
  const currentMeta = readSnapshotMeta(vCurrentDir);
  const state = loadState(getStatePath(clawXConfigDir));
  const sourceHash = currentMeta?.presetHash ?? state?.currentHash;
  const migrationMode = resolveMigrationMode(
    Boolean(currentMeta?.presetHash),
    sourceHash,
    targetHash,
    forceLawclawAgentPreset
  );

  const configPath = join(openClawConfigDir, 'openclaw.json');
  const rawConfig = readJson5File<Record<string, unknown>>(configPath, {});
  const ensured = ensureDedicatedAgentInConfig(rawConfig);
  if (ensured.changed) {
    writeJsonFile(configPath, ensured.next);
  }

  return {
    migrationMode,
    manifest,
    openClawConfigDir,
    clawXConfigDir,
    configPath,
    config: ensured.next,
    sourceHash,
    targetHash,
    forceLawclawAgentPreset,
    vCurrentDir,
    vUpdateDir,
  };
}

function computeNextConfig(context: RuntimeTaskContext): { nextConfig: Record<string, unknown>; changed: boolean } {
  const basePatch = loadConfigPatchFromVUpdate(context.vUpdateDir, context.manifest);
  let nextConfig = context.config;
  let changed = false;

  if (basePatch) {
    const merged = mergeRecordAdditive(nextConfig, basePatch);
    if (merged.changed) {
      nextConfig = merged.next;
      changed = true;
    }
  }

  const ensured = ensureDedicatedAgentInConfig(nextConfig);
  if (ensured.changed) {
    nextConfig = ensured.next;
    changed = true;
  }

  return { nextConfig, changed };
}

function collectManagedFiles(
  context: RuntimeTaskContext,
  config: Record<string, unknown>
): Record<string, string> {
  const managedFiles: Record<string, string> = {};

  for (const presetFile of context.manifest.workspaceFiles) {
    const workspace = resolveAgentWorkspace(config, context.openClawConfigDir, presetFile.agentId);
    const destinationPath = join(workspace, presetFile.target);
    const content = readTextFileIfExists(destinationPath);
    if (content !== undefined) {
      managedFiles[getWorkspaceFileKey(presetFile)] = hashContent(content);
    }
  }

  return managedFiles;
}

function persistCurrentSnapshotState(
  context: RuntimeTaskContext,
  config: Record<string, unknown>,
  nowMs: number
): void {
  persistState(getStatePath(context.clawXConfigDir), {
    schemaVersion: 2,
    currentHash: context.targetHash,
    updateHash: context.targetHash,
    managedFiles: collectManagedFiles(context, config),
    updatedAt: new Date(nowMs).toISOString(),
  });
}

async function runBootstrapInstall(context: RuntimeTaskContext, nowMs: number): Promise<AgentPresetMigrationSummary> {
  const { nextConfig, changed: configUpdated } = computeNextConfig(context);

  const bootstrapItems: DeterministicWorkspaceUpgradePlanItem[] = context.manifest.workspaceFiles.map(
    (presetFile) => {
      const workspace = resolveAgentWorkspace(nextConfig, context.openClawConfigDir, presetFile.agentId);
      const destinationPath = join(workspace, presetFile.target);
      const baseNew = loadSnapshotFile(context.vUpdateDir, presetFile.source);
      const userCurrent = readTextFileIfExists(destinationPath);

      return {
        key: getWorkspaceFileKey(presetFile),
        agentId: presetFile.agentId,
        target: presetFile.target,
        destinationPath,
        baseNew,
        userCurrent,
        action:
          userCurrent === undefined ? 'create' : userCurrent === baseNew ? 'noop' : 'overwrite',
      };
    }
  );

  const backupItems = bootstrapItems.filter(
    (item): item is DeterministicWorkspaceUpgradePlanItem =>
      item.action === 'overwrite' && item.userCurrent !== undefined
  );
  if (backupItems.length > 0) {
    await createUpgradeWorkspaceFolderBackupWithRetry(context, backupItems, nowMs);
  }

  const summary: AgentPresetMigrationSummary = {
    createdFiles: 0,
    updatedFiles: 0,
    skippedFiles: 0,
    skippedTargets: [],
    configUpdated,
  };

  for (const item of bootstrapItems) {
    if (item.action === 'create') {
      writeTextFile(item.destinationPath, item.baseNew);
      summary.createdFiles += 1;
      continue;
    }

    if (item.action === 'noop') {
      summary.skippedFiles += 1;
      continue;
    }

    writeTextFile(item.destinationPath, item.baseNew);
    summary.updatedFiles += 1;
  }

  if (configUpdated) {
    writeJsonFile(context.configPath, nextConfig);
  }

  await promoteVUpdateToVCurrent(context.vUpdateDir, context.vCurrentDir);
  persistCurrentSnapshotState(context, nextConfig, nowMs);
  return summary;
}

function planDeterministicWorkspaceUpgrade(context: RuntimeTaskContext): DeterministicWorkspaceUpgradePlan {
  const items: DeterministicWorkspaceUpgradePlanItem[] = [];
  const backupItems: DeterministicWorkspaceUpgradePlanItem[] = [];

  for (const presetFile of context.manifest.workspaceFiles) {
    const workspace = resolveAgentWorkspace(context.config, context.openClawConfigDir, presetFile.agentId);
    const destinationPath = join(workspace, presetFile.target);
    const baseOld = loadSnapshotFileIfExists(context.vCurrentDir, presetFile.source);
    const baseNew = loadSnapshotFile(context.vUpdateDir, presetFile.source);
    const userCurrent = readTextFileIfExists(destinationPath);

    let action: DeterministicWorkspaceUpgradePlanItem['action'];
    if (userCurrent === baseNew) {
      action = 'noop';
    } else if (baseOld === undefined && userCurrent === undefined) {
      action = 'create';
    } else if (baseOld !== undefined && userCurrent === baseOld) {
      action = 'overwrite';
    } else {
      action = 'skip';
    }

    const item: DeterministicWorkspaceUpgradePlanItem = {
      key: getWorkspaceFileKey(presetFile),
      agentId: presetFile.agentId,
      target: presetFile.target,
      destinationPath,
      baseOld,
      baseNew,
      userCurrent,
      action,
    };
    items.push(item);

    if (action === 'overwrite' && userCurrent !== undefined) {
      backupItems.push(item);
    }
  }

  return { items, backupItems };
}

function createUpgradeWorkspaceFolderBackup(
  context: RuntimeTaskContext,
  backupItems: DeterministicWorkspaceUpgradePlanItem[],
  taskId: string,
  nowMs: number
): string {
  const backupDir = getBackupsPath(context.clawXConfigDir);
  ensureDir(backupDir);

  const backupDirName = buildUpgradeBackupDirName(taskId, context.targetHash, nowMs);
  const backupRunDir = join(backupDir, backupDirName);
  if (existsSync(backupRunDir)) {
    throw new Error(`backup directory already exists: ${backupRunDir}`);
  }
  ensureDir(backupRunDir);

  try {
    const workspacePath = resolveAgentWorkspace(context.config, context.openClawConfigDir, DEDICATED_AGENT_ID);
    const backupFiles: UpgradeWorkspaceBackupFileMeta[] = [];

    for (const item of backupItems) {
      const relativeBackupPath = join('workspace', item.agentId, normalizeBackupRelativeTarget(item.target));
      const metaEntry: UpgradeWorkspaceBackupFileMeta = {
        target: item.target,
        sourcePath: item.destinationPath,
        relativeBackupPath: normalizePath(relativeBackupPath),
        existed: item.userCurrent !== undefined,
      };

      if (item.userCurrent !== undefined) {
        writeTextFile(join(backupRunDir, relativeBackupPath), item.userCurrent);
        metaEntry.sha256 = hashContent(item.userCurrent);
        metaEntry.bytes = Buffer.byteLength(item.userCurrent, 'utf-8');
      }

      backupFiles.push(metaEntry);
    }

    const backupMeta: UpgradeWorkspaceBackupMeta = {
      schemaVersion: 1,
      createdAt: new Date(nowMs).toISOString(),
      taskId,
      sourceHash: context.sourceHash,
      targetHash: context.targetHash,
      backupDirName,
      agentId: DEDICATED_AGENT_ID,
      workspacePath,
      files: backupFiles,
    };
    writeJsonFile(join(backupRunDir, 'backup-meta.json'), backupMeta);

    return backupRunDir;
  } catch (error) {
    rmSync(backupRunDir, { recursive: true, force: true });
    throw error;
  }
}

async function createUpgradeWorkspaceFolderBackupWithRetry(
  context: RuntimeTaskContext,
  backupItems: DeterministicWorkspaceUpgradePlanItem[],
  nowMs: number
): Promise<string> {
  let lastError: unknown;
  const taskId = randomUUID();
  const totalAttempts = UPGRADE_BACKUP_RETRY_DELAYS_MS.length + 1;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    try {
      return createUpgradeWorkspaceFolderBackup(context, backupItems, taskId, nowMs);
    } catch (error) {
      lastError = error;
      if (attempt === UPGRADE_BACKUP_RETRY_DELAYS_MS.length) {
        break;
      }
      await sleep(UPGRADE_BACKUP_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error(`backup failed after ${totalAttempts} attempts: ${String(lastError)}`);
}

async function applyDeterministicWorkspaceUpgrade(
  context: RuntimeTaskContext,
  plan: DeterministicWorkspaceUpgradePlan,
  nowMs: number
): Promise<AgentPresetMigrationSummary> {
  if (plan.backupItems.length > 0) {
    await createUpgradeWorkspaceFolderBackupWithRetry(context, plan.backupItems, nowMs);
  }

  const { nextConfig, changed: configUpdated } = computeNextConfig(context);
  const summary: AgentPresetMigrationSummary = {
    createdFiles: 0,
    updatedFiles: 0,
    skippedFiles: 0,
    skippedTargets: [],
    configUpdated,
  };

  for (const item of plan.items) {
    if (item.action === 'noop') {
      continue;
    }

    if (item.action === 'skip') {
      summary.skippedFiles += 1;
      summary.skippedTargets.push(item.target);
      continue;
    }

    writeTextFile(item.destinationPath, item.baseNew);
    if (item.action === 'create') {
      summary.createdFiles += 1;
      continue;
    }
    summary.updatedFiles += 1;
  }

  if (configUpdated) {
    writeJsonFile(context.configPath, nextConfig);
  }

  await promoteVUpdateToVCurrent(context.vUpdateDir, context.vCurrentDir);
  persistCurrentSnapshotState(context, nextConfig, nowMs);
  return summary;
}

async function runUpgradeInstall(
  context: RuntimeTaskContext,
  nowMs: number
): Promise<AgentPresetMigrationSummary> {
  const plan = planDeterministicWorkspaceUpgrade(context);
  return applyDeterministicWorkspaceUpgrade(context, plan, nowMs);
}

function setStatus(next: Partial<AgentPresetMigrationStatus>): void {
  status = {
    ...status,
    ...next,
    updatedAt: new Date().toISOString(),
  };
  emitter.emit('status', getAgentPresetMigrationStatus());
}

function setFailureStatus(error: unknown, targetHash?: string): void {
  setStatus({
    state: 'failed',
    reason: 'APPLY_FAILED',
    message: String(error),
    targetHash,
    createdFiles: 0,
    updatedFiles: 0,
    skippedFiles: 0,
    skippedTargets: [],
  });
}

function setSuccessStatus(targetHash: string, summary: AgentPresetMigrationSummary): void {
  if (summary.skippedFiles > 0) {
    setStatus({
      state: 'warning',
      reason: 'PARTIAL_UPDATE',
      message: '部分预设文件检测到本地修改，已跳过自动更新，请手动对比 v_current / v_update。',
      targetHash,
      createdFiles: summary.createdFiles,
      updatedFiles: summary.updatedFiles,
      skippedFiles: summary.skippedFiles,
      skippedTargets: summary.skippedTargets,
    });
    return;
  }

  setStatus({
    state: 'idle',
    reason: undefined,
    message: undefined,
    targetHash,
    createdFiles: summary.createdFiles,
    updatedFiles: summary.updatedFiles,
    skippedFiles: 0,
    skippedTargets: [],
  });
}

export function getAgentPresetMigrationArtifactsDir(): string {
  return getLocalPresetRoot(getClawXConfigDir());
}

export function getAgentPresetMigrationStatus(): AgentPresetMigrationStatus {
  return { ...status };
}

export function onAgentPresetMigrationStatus(listener: (nextStatus: AgentPresetMigrationStatus) => void): () => void {
  emitter.on('status', listener);
  return () => emitter.off('status', listener);
}

export async function runAgentPresetStartupMigration(
  options: AgentPresetMigrationOptions = {}
): Promise<void> {
  if (running) {
    return;
  }

  running = true;
  setStatus({
    state: 'running',
    reason: undefined,
    message: undefined,
    createdFiles: 0,
    updatedFiles: 0,
    skippedFiles: 0,
    skippedTargets: [],
  });

  try {
    const context = await prepareRuntimeContext(options);
    setStatus({ targetHash: context.targetHash });

    if (context.migrationMode === 'noop') {
      setStatus({
        state: 'idle',
        reason: undefined,
        message: undefined,
        targetHash: context.targetHash,
        createdFiles: 0,
        updatedFiles: 0,
        skippedFiles: 0,
        skippedTargets: [],
      });
      return;
    }

    const nowMs = options.now ? options.now() : Date.now();
    const summary =
      context.migrationMode === 'bootstrap'
        ? await runBootstrapInstall(context, nowMs)
        : await runUpgradeInstall(context, nowMs);

    setSuccessStatus(context.targetHash, summary);
  } catch (error) {
    logger.warn('LawClaw agent preset migration startup failed (non-blocking):', error);
    setFailureStatus(error);
  } finally {
    running = false;
  }
}

export function stopAgentPresetMigrationCoordinator(): void {
  running = false;
}
