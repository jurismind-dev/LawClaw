import { createHash, randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, isAbsolute, join } from 'path';
import { homedir } from 'os';
import { logger } from './logger';
import { getClawXConfigDir, getOpenClawConfigDir, getResourcesDir } from './paths';
import { readJson5File, writeJsonFile } from './openclaw-json5';
import {
  AgentPresetQueueTask,
  AGENT_PRESET_RETRY_MIN_DELAY_MS,
  computeAgentPresetRetryDelayMs,
  listDueAgentPresetQueueTasks,
  readAgentPresetQueue,
  removeAgentPresetQueueTask,
  upsertAgentPresetQueueTask,
  writeAgentPresetQueue,
} from './agent-preset-queue';

type ConflictStrategy = 'preserve' | 'append_capabilities';

interface PresetWorkspaceFile {
  agentId: string;
  source: string;
  target: string;
  conflictStrategy?: ConflictStrategy;
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

interface PlannerFileInput {
  key: string;
  agentId: string;
  target: string;
  destinationPath: string;
  sourceContent?: string;
  targetContent: string;
  userContent?: string;
}

interface PlannerInput {
  taskId: string;
  sourceHash?: string;
  targetHash: string;
  conflictPolicy: 'auto' | AgentPresetConflictDecision;
  forceLawclawAgentPreset: boolean;
  files: PlannerFileInput[];
}

interface PlannerFileOutput {
  key?: string;
  agentId?: string;
  target: string;
  content: string;
}

interface PlannerOutput {
  schemaVersion: number;
  decision: 'apply' | 'need_confirmation' | 'skip';
  reason?: string;
  files: PlannerFileOutput[];
  configPatch?: Record<string, unknown>;
}

interface RuntimeTaskContext {
  migrationMode: MigrationMode;
  hasCurrentSnapshot: boolean;
  manifest: PresetManifest;
  openClawConfigDir: string;
  clawXConfigDir: string;
  configPath: string;
  config: Record<string, unknown>;
  sourceHash?: string;
  targetHash: string;
  forceLawclawAgentPreset: boolean;
  dedicatedAgentPrepared: boolean;
  vCurrentDir: string;
  vUpdateDir: string;
}

export type AgentPresetMigrationFailureReason =
  | 'LLM_UNAVAILABLE'
  | 'CONFLICT_NEED_CONFIRM'
  | 'INVALID_OUTPUT'
  | 'APPLY_FAILED';

export type AgentPresetConflictDecision = 'preserve_user' | 'prefer_preset' | 'skip_this_time';

export interface AgentPresetMigrationOptions {
  resourcesDir?: string;
  openClawConfigDir?: string;
  clawXConfigDir?: string;
  forceLawclawAgentPreset?: boolean;
  gatewayRpc?: (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown>;
  restartGateway?: () => Promise<void>;
  isGatewayRunning?: () => boolean;
  interactiveWindow?: boolean;
  heartbeatIntervalMs?: number;
  planner?: AgentPresetPlanner;
  now?: () => number;
  random?: () => number;
  appVersion?: string;
}

export interface AgentPresetMigrationStatus {
  state: 'idle' | 'running' | 'queued' | 'awaiting_confirmation' | 'failed';
  chatLocked: boolean;
  queueLength: number;
  currentTaskId?: string;
  reason?: AgentPresetMigrationFailureReason;
  message?: string;
  targetHash?: string;
  updatedAt: string;
}

interface AgentPresetMigrationSummary {
  addedFiles: number;
  updatedFiles: number;
  skippedFiles: number;
  configUpdated: boolean;
  forcedLawclawOverwritten: boolean;
}

export type AgentPresetPlanner = (input: PlannerInput) => Promise<PlannerOutput>;
type MigrationMode = 'bootstrap' | 'upgrade' | 'noop';

const PRESET_ROOT_DIR = 'agent-presets';
const LOCAL_PRESET_ROOT = 'agent-presets';
const QUEUE_FILE = 'queue.json';
const STATE_FILE = 'state.json';
const JOBS_DIR = 'jobs';
const BACKUPS_DIR = 'backups';
const V_CURRENT_DIR = 'v_current';
const V_UPDATE_DIR = 'v_update';
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const MANUAL_SKIP_DELAY_MS = 24 * 60 * 60 * 1000;
const DEDICATED_AGENT_ID = 'lawclaw-main';
const DEDICATED_AGENT_WORKSPACE = '~/.openclaw/workspace-lawclaw-main';
const INTERNAL_MIGRATION_SESSION_PREFIX = `agent:${DEDICATED_AGENT_ID}:__internal_migration__`;
const CAPABILITY_BLOCK_RE =
  /<!--\s*LAWCLAW_CAPABILITY_START:([a-zA-Z0-9_-]+)\s*-->([\s\S]*?)<!--\s*LAWCLAW_CAPABILITY_END:\1\s*-->/g;

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

function getQueuePath(clawXConfigDir: string): string {
  return join(getLocalPresetRoot(clawXConfigDir), QUEUE_FILE);
}

function getStatePath(clawXConfigDir: string): string {
  return join(getLocalPresetRoot(clawXConfigDir), STATE_FILE);
}

function getJobsPath(clawXConfigDir: string): string {
  return join(getLocalPresetRoot(clawXConfigDir), JOBS_DIR);
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

function clearDirectory(dirPath: string): void {
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true });
  }
}

function loadManifest(presetRoot: string): PresetManifest {
  const manifestPath = join(presetRoot, 'manifest.json');
  const manifest = readJson5File<PresetManifest | null>(manifestPath, null);
  if (!manifest || manifest.schemaVersion !== 2 || !Array.isArray(manifest.workspaceFiles)) {
    throw new Error(`Invalid agent preset manifest: ${manifestPath}`);
  }
  return manifest;
}

function normalizePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
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

function syncVUpdateFromResources(
  templateRoot: string,
  vUpdateDir: string,
  targetHash: string,
  appVersion: string
): void {
  const currentMeta = readSnapshotMeta(vUpdateDir);
  if (currentMeta?.presetHash === targetHash) {
    return;
  }

  clearDirectory(vUpdateDir);
  copyDirectoryRecursive(templateRoot, vUpdateDir);
  writeSnapshotMeta(vUpdateDir, {
    schemaVersion: 1,
    presetHash: targetHash,
    generatedAt: new Date().toISOString(),
    appVersion,
  });
}

function promoteVUpdateToVCurrent(vUpdateDir: string, vCurrentDir: string): void {
  clearDirectory(vCurrentDir);
  copyDirectoryRecursive(vUpdateDir, vCurrentDir);
}

function loadState(statePath: string): PresetState | undefined {
  const state = readJson5File<PresetState | undefined>(statePath, undefined);
  if (!state || typeof state.schemaVersion !== 'number') {
    return undefined;
  }
  return state;
}

function persistState(statePath: string, state: PresetState): void {
  writeJsonFile(statePath, state);
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function createBackupFile(clawXConfigDir: string, agentId: string, targetPath: string, content: string): string {
  const backupDir = getBackupsPath(clawXConfigDir);
  ensureDir(backupDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = basename(targetPath).replace(/[^a-zA-Z0-9._-]/g, '_');
  const backupPath = join(backupDir, `${timestamp}-${agentId}-${safeName}`);
  writeTextFile(backupPath, content);
  return backupPath;
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

function extractCapabilityBlocks(content: string): Map<string, string> {
  const blocks = new Map<string, string>();
  CAPABILITY_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null = CAPABILITY_BLOCK_RE.exec(content);
  while (match) {
    blocks.set(match[1], match[0].trim());
    match = CAPABILITY_BLOCK_RE.exec(content);
  }
  CAPABILITY_BLOCK_RE.lastIndex = 0;
  return blocks;
}

function appendNewCapabilities(baseOld: string, baseNew: string, userContent: string): {
  merged: string;
  appended: number;
} {
  const oldBlocks = extractCapabilityBlocks(baseOld);
  const newBlocks = extractCapabilityBlocks(baseNew);
  const missingIds = Array.from(newBlocks.keys()).filter((id) => !oldBlocks.has(id));

  let merged = userContent;
  let appended = 0;

  for (const id of missingIds) {
    const marker = `LAWCLAW_CAPABILITY_START:${id}`;
    if (merged.includes(marker)) {
      continue;
    }
    const block = newBlocks.get(id);
    if (!block) {
      continue;
    }

    merged = `${merged.trimEnd()}\n\n${block}\n`;
    appended += 1;
  }

  return { merged, appended };
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

function classifyPlannerError(error: unknown): AgentPresetMigrationFailureReason {
  const message = String(error).toLowerCase();
  if (
    message.includes('unavailable') ||
    message.includes('timeout') ||
    message.includes('model') ||
    message.includes('network') ||
    message.includes('gateway')
  ) {
    return 'LLM_UNAVAILABLE';
  }
  return 'APPLY_FAILED';
}

function assertPlannerOutput(value: unknown): PlannerOutput {
  if (!isRecord(value)) {
    throw new Error('planner output is not an object');
  }
  if (value.schemaVersion !== 1) {
    throw new Error('planner schemaVersion must be 1');
  }
  if (value.decision !== 'apply' && value.decision !== 'need_confirmation' && value.decision !== 'skip') {
    throw new Error('planner decision is invalid');
  }
  if (!Array.isArray(value.files)) {
    throw new Error('planner files must be an array');
  }
  for (const file of value.files) {
    if (!isRecord(file) || typeof file.target !== 'string' || typeof file.content !== 'string') {
      throw new Error('planner file entry is invalid');
    }
  }
  if (value.configPatch !== undefined && !isRecord(value.configPatch)) {
    throw new Error('planner configPatch must be an object');
  }
  return value as PlannerOutput;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((block) => {
      if (isRecord(block) && typeof block.text === 'string') {
        return block.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function extractAssistantText(historyResult: unknown): string {
  if (!isRecord(historyResult) || !Array.isArray(historyResult.messages)) {
    return '';
  }
  const messages = historyResult.messages as unknown[];
  const assistants = messages
    .filter((message) => isRecord(message) && message.role === 'assistant')
    .map((message) => (isRecord(message) ? extractTextFromContent(message.content) : ''))
    .filter((text) => text.trim().length > 0);

  return assistants.length > 0 ? assistants[assistants.length - 1] : '';
}

function extractJsonCandidate(text: string): string | undefined {
  const codeFence = text.match(/```json\s*([\s\S]*?)```/i);
  if (codeFence && codeFence[1]) {
    return codeFence[1].trim();
  }

  const genericFence = text.match(/```[\s\S]*?(\{[\s\S]*\})[\s\S]*?```/);
  if (genericFence && genericFence[1]) {
    return genericFence[1].trim();
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return undefined;
}

async function defaultPlannerFactory(
  input: PlannerInput,
  rpc: AgentPresetMigrationOptions['gatewayRpc']
): Promise<PlannerOutput> {
  if (!rpc) {
    throw new Error('gateway rpc unavailable');
  }

  const sessionKey = `${INTERNAL_MIGRATION_SESSION_PREFIX}:${input.taskId}`;
  const prompt = [
    '请调用 lawclaw-upgrade skill 并完成三方合并。',
    '三方上下文含义：v_current(旧默认快照)、v_update(新默认快照)、user_current(用户当前文件)。',
    '你必须只返回 JSON，不要附加解释。',
    `全局冲突策略: ${input.conflictPolicy}`,
    `taskId: ${input.taskId}`,
    `sourceHash: ${input.sourceHash ?? 'none'}`,
    `targetHash: ${input.targetHash}`,
    `forceLawclawAgentPreset: ${String(input.forceLawclawAgentPreset)}`,
    '文件上下文(JSON):',
    JSON.stringify(
      input.files.map((file) => ({
        key: file.key,
        agentId: file.agentId,
        target: file.target,
        sourceContent: file.sourceContent ?? null,
        targetContent: file.targetContent,
        userContent: file.userContent ?? null,
      }))
    ),
  ].join('\n');

  await rpc(
    'chat.send',
    {
      sessionKey,
      message: prompt,
      deliver: false,
      idempotencyKey: randomUUID(),
    },
    30_000
  );

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const history = await rpc('chat.history', { sessionKey, limit: 40 }, 30_000);
    const assistantText = extractAssistantText(history);
    const candidate = extractJsonCandidate(assistantText);
    if (candidate) {
      return assertPlannerOutput(JSON.parse(candidate) as unknown);
    }
    await sleep(2_000);
  }

  throw new Error('planner timeout while waiting assistant output');
}

function createPlannerInput(
  context: RuntimeTaskContext,
  taskId: string,
  conflictPolicy: 'auto' | AgentPresetConflictDecision
): PlannerInput {
  return {
    taskId,
    sourceHash: context.sourceHash,
    targetHash: context.targetHash,
    conflictPolicy,
    forceLawclawAgentPreset: context.forceLawclawAgentPreset,
    files: context.manifest.workspaceFiles.map((file) => {
      const workspace = resolveAgentWorkspace(context.config, context.openClawConfigDir, file.agentId);
      const destinationPath = join(workspace, file.target);
      return {
        key: getWorkspaceFileKey(file),
        agentId: file.agentId,
        target: file.target,
        destinationPath,
        sourceContent: loadSnapshotFileIfExists(context.vCurrentDir, file.source),
        targetContent: loadSnapshotFile(context.vUpdateDir, file.source),
        userContent: readTextFileIfExists(destinationPath),
      };
    }),
  };
}

function writeSnapshot(clawXConfigDir: string, input: PlannerInput): string {
  const jobsDir = getJobsPath(clawXConfigDir);
  ensureDir(jobsDir);

  const taskDir = join(jobsDir, input.taskId);
  ensureDir(taskDir);

  writeJsonFile(join(taskDir, 'snapshot.json'), {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    sourceHash: input.sourceHash,
    targetHash: input.targetHash,
    conflictPolicy: input.conflictPolicy,
    forceLawclawAgentPreset: input.forceLawclawAgentPreset,
    files: input.files,
  });

  return taskDir;
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

function prepareRuntimeContext(options: AgentPresetMigrationOptions): RuntimeTaskContext {
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
  syncVUpdateFromResources(templateRoot, vUpdateDir, targetHash, appVersion);

  const vCurrentDir = getVCurrentPath(clawXConfigDir);
  const currentMeta = readSnapshotMeta(vCurrentDir);
  const hasCurrentSnapshot = Boolean(currentMeta?.presetHash);
  const state = loadState(getStatePath(clawXConfigDir));
  const sourceHash = currentMeta?.presetHash ?? state?.currentHash;
  const migrationMode = resolveMigrationMode(
    hasCurrentSnapshot,
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
    hasCurrentSnapshot,
    manifest,
    openClawConfigDir,
    clawXConfigDir,
    configPath,
    config: ensured.next,
    sourceHash,
    targetHash,
    forceLawclawAgentPreset,
    dedicatedAgentPrepared: ensured.changed,
    vCurrentDir,
    vUpdateDir,
  };
}

function applyForceLawclawPreset(context: RuntimeTaskContext, input: PlannerInput): number {
  let changedFiles = 0;

  for (const file of input.files) {
    if (file.agentId !== DEDICATED_AGENT_ID) {
      continue;
    }

    const existingContent = readTextFileIfExists(file.destinationPath);
    if (existingContent === file.targetContent) {
      continue;
    }

    if (existingContent !== undefined) {
      createBackupFile(context.clawXConfigDir, file.agentId, file.target, existingContent);
    }

    writeTextFile(file.destinationPath, file.targetContent);
    changedFiles += 1;
  }

  return changedFiles;
}

function preseedDedicatedWorkspaceFiles(context: RuntimeTaskContext): number {
  let seeded = 0;

  for (const file of context.manifest.workspaceFiles) {
    if (file.agentId !== DEDICATED_AGENT_ID) {
      continue;
    }

    const workspace = resolveAgentWorkspace(context.config, context.openClawConfigDir, file.agentId);
    const destinationPath = join(workspace, file.target);
    if (existsSync(destinationPath)) {
      continue;
    }

    const targetContent = loadSnapshotFile(context.vUpdateDir, file.source);
    writeTextFile(destinationPath, targetContent);
    seeded += 1;
  }

  return seeded;
}

function runBootstrapInstall(context: RuntimeTaskContext): AgentPresetMigrationSummary {
  const summary: AgentPresetMigrationSummary = {
    addedFiles: 0,
    updatedFiles: 0,
    skippedFiles: 0,
    configUpdated: false,
    forcedLawclawOverwritten: false,
  };

  const basePatch = loadConfigPatchFromVUpdate(context.vUpdateDir, context.manifest);
  let nextConfig = context.config;
  if (basePatch) {
    const merged = mergeRecordAdditive(nextConfig, basePatch);
    if (merged.changed) {
      nextConfig = merged.next;
      summary.configUpdated = true;
    }
  }

  const ensuredDedicated = ensureDedicatedAgentInConfig(nextConfig);
  if (ensuredDedicated.changed) {
    nextConfig = ensuredDedicated.next;
    summary.configUpdated = true;
  }

  if (summary.configUpdated) {
    writeJsonFile(context.configPath, nextConfig);
  }

  const managedFiles: Record<string, string> = {};
  for (const presetFile of context.manifest.workspaceFiles) {
    const workspace = resolveAgentWorkspace(nextConfig, context.openClawConfigDir, presetFile.agentId);
    const destinationPath = join(workspace, presetFile.target);
    const targetContent = loadSnapshotFile(context.vUpdateDir, presetFile.source);
    const existingContent = readTextFileIfExists(destinationPath);

    if (existingContent === undefined) {
      writeTextFile(destinationPath, targetContent);
      summary.addedFiles += 1;
      managedFiles[getWorkspaceFileKey(presetFile)] = hashContent(targetContent);
      continue;
    }

    if (existingContent === targetContent) {
      summary.skippedFiles += 1;
      managedFiles[getWorkspaceFileKey(presetFile)] = hashContent(existingContent);
      continue;
    }

    createBackupFile(context.clawXConfigDir, presetFile.agentId, presetFile.target, existingContent);
    writeTextFile(destinationPath, targetContent);
    summary.updatedFiles += 1;
    managedFiles[getWorkspaceFileKey(presetFile)] = hashContent(targetContent);
  }

  promoteVUpdateToVCurrent(context.vUpdateDir, context.vCurrentDir);
  persistState(getStatePath(context.clawXConfigDir), {
    schemaVersion: 2,
    currentHash: context.targetHash,
    updateHash: context.targetHash,
    managedFiles,
    updatedAt: new Date().toISOString(),
  });

  return summary;
}

function applyPlannerOutput(context: RuntimeTaskContext, input: PlannerInput, output: PlannerOutput): AgentPresetMigrationSummary {
  const summary: AgentPresetMigrationSummary = {
    addedFiles: 0,
    updatedFiles: 0,
    skippedFiles: 0,
    configUpdated: false,
    forcedLawclawOverwritten: false,
  };

  const patchByKey = new Map<string, PlannerFileOutput>();
  for (const patch of output.files) {
    const key = patch.key
      ? patch.key
      : getWorkspaceFileKey({
          agentId: patch.agentId ?? DEDICATED_AGENT_ID,
          target: patch.target,
        });
    patchByKey.set(key, patch);
  }

  const basePatch = loadConfigPatchFromVUpdate(context.vUpdateDir, context.manifest);
  let nextConfig = context.config;
  if (basePatch) {
    const merged = mergeRecordAdditive(nextConfig, basePatch);
    if (merged.changed) {
      nextConfig = merged.next;
      summary.configUpdated = true;
    }
  }
  if (output.configPatch) {
    const merged = mergeRecordAdditive(nextConfig, output.configPatch);
    if (merged.changed) {
      nextConfig = merged.next;
      summary.configUpdated = true;
    }
  }

  // Guarantee dedicated agent invariants even if template/configPatch contains stale workspace fields.
  const ensuredDedicated = ensureDedicatedAgentInConfig(nextConfig);
  if (ensuredDedicated.changed) {
    nextConfig = ensuredDedicated.next;
    summary.configUpdated = true;
  }

  if (summary.configUpdated) {
    writeJsonFile(context.configPath, nextConfig);
  }

  const managedFiles: Record<string, string> = {};
  const inputByKey = new Map(input.files.map((file) => [file.key, file]));

  for (const presetFile of context.manifest.workspaceFiles) {
    const key = getWorkspaceFileKey(presetFile);
    const plannerFile = inputByKey.get(key);
    if (!plannerFile) {
      continue;
    }

    const existingContent = readTextFileIfExists(plannerFile.destinationPath);
    const sourceContent = plannerFile.sourceContent;
    const targetContent = plannerFile.targetContent;

    let nextContent: string | undefined;
    let usedForceLawclaw = false;

    if (context.forceLawclawAgentPreset && presetFile.agentId === DEDICATED_AGENT_ID) {
      nextContent = targetContent;
      usedForceLawclaw = true;
    } else if (patchByKey.has(key)) {
      nextContent = patchByKey.get(key)?.content;
    } else if (existingContent === undefined) {
      nextContent = targetContent;
    } else if (
      sourceContent !== undefined &&
      presetFile.conflictStrategy === 'append_capabilities' &&
      presetFile.target.toLowerCase().endsWith('.md')
    ) {
      const merged = appendNewCapabilities(sourceContent, targetContent, existingContent);
      if (merged.appended > 0) {
        nextContent = merged.merged;
      }
    }

    if (nextContent === undefined) {
      summary.skippedFiles += 1;
      if (existingContent !== undefined) {
        managedFiles[key] = hashContent(existingContent);
      }
      continue;
    }

    if (existingContent === undefined) {
      writeTextFile(plannerFile.destinationPath, nextContent);
      summary.addedFiles += 1;
      managedFiles[key] = hashContent(nextContent);
      continue;
    }

    if (existingContent === nextContent) {
      summary.skippedFiles += 1;
      managedFiles[key] = hashContent(existingContent);
      continue;
    }

    createBackupFile(context.clawXConfigDir, presetFile.agentId, presetFile.target, existingContent);
    writeTextFile(plannerFile.destinationPath, nextContent);
    summary.updatedFiles += 1;
    if (usedForceLawclaw) {
      summary.forcedLawclawOverwritten = true;
    }
    managedFiles[key] = hashContent(nextContent);
  }

  promoteVUpdateToVCurrent(context.vUpdateDir, context.vCurrentDir);
  persistState(getStatePath(context.clawXConfigDir), {
    schemaVersion: 2,
    currentHash: context.targetHash,
    updateHash: context.targetHash,
    managedFiles,
    updatedAt: new Date().toISOString(),
  });

  return summary;
}

class AgentPresetMigrationCoordinator extends EventEmitter {
  private options: AgentPresetMigrationOptions = {};
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private running = false;
  private status: AgentPresetMigrationStatus = {
    state: 'idle',
    chatLocked: false,
    queueLength: 0,
    updatedAt: new Date().toISOString(),
  };

  configure(options: AgentPresetMigrationOptions): void {
    this.options = { ...this.options, ...options };
  }

  getStatus(): AgentPresetMigrationStatus {
    return { ...this.status };
  }

  private setStatus(next: Partial<AgentPresetMigrationStatus>): void {
    this.status = {
      ...this.status,
      ...next,
      updatedAt: new Date().toISOString(),
    };
    this.emit('status', this.getStatus());
    this.emit('chatLock', this.status.chatLocked);
  }

  private queuePath(): string {
    const clawXConfigDir = this.options.clawXConfigDir ?? getClawXConfigDir();
    return getQueuePath(clawXConfigDir);
  }

  private nowMs(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private random(): number {
    return this.options.random ? this.options.random() : Math.random();
  }

  private refreshQueueStatus(): void {
    const queue = readAgentPresetQueue(this.queuePath());
    const awaiting = queue.tasks.find((task) => task.status === 'awaiting_confirmation');
    if (awaiting) {
      this.setStatus({
        state: 'awaiting_confirmation',
        chatLocked: true,
        queueLength: queue.tasks.length,
        currentTaskId: awaiting.taskId,
        reason: awaiting.reason as AgentPresetMigrationFailureReason,
        message: awaiting.lastError,
        targetHash: awaiting.targetHash,
      });
      return;
    }

    const queuedTask = queue.tasks
      .filter((task) => task.status === 'pending' || task.status === 'failed')
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))[0];

    this.setStatus({
      state: queue.tasks.length > 0 ? 'queued' : 'idle',
      chatLocked: false,
      queueLength: queue.tasks.length,
      reason: queuedTask?.reason as AgentPresetMigrationFailureReason | undefined,
      message: queuedTask?.lastError,
      currentTaskId: queuedTask?.taskId,
      targetHash: queuedTask?.targetHash,
    });
  }

  private ensureTask(task: AgentPresetQueueTask): void {
    const queue = upsertAgentPresetQueueTask(this.queuePath(), task);
    this.setStatus({
      state: task.status === 'awaiting_confirmation' ? 'awaiting_confirmation' : 'queued',
      chatLocked: task.status === 'awaiting_confirmation',
      queueLength: queue.tasks.length,
      currentTaskId: task.taskId,
      reason: task.reason as AgentPresetMigrationFailureReason,
      message: task.lastError,
      targetHash: task.targetHash,
    });
  }

  private async runPlanner(input: PlannerInput): Promise<PlannerOutput> {
    const planner =
      this.options.planner ??
      ((plannerInput: PlannerInput) => defaultPlannerFactory(plannerInput, this.options.gatewayRpc));

    return assertPlannerOutput(await planner(input));
  }

  private async runTask(task: AgentPresetQueueTask, conflictPolicy: 'auto' | AgentPresetConflictDecision): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.setStatus({
      state: 'running',
      chatLocked: false,
      currentTaskId: task.taskId,
      queueLength: readAgentPresetQueue(this.queuePath()).tasks.length,
      reason: undefined,
      message: undefined,
      targetHash: task.targetHash,
    });

    try {
      const context = prepareRuntimeContext(this.options);
      if (context.migrationMode === 'noop') {
        removeAgentPresetQueueTask(this.queuePath(), task.taskId);
        this.refreshQueueStatus();
        return;
      }
      if (context.migrationMode === 'bootstrap') {
        const summary = runBootstrapInstall(context);
        removeAgentPresetQueueTask(this.queuePath(), task.taskId);
        this.refreshQueueStatus();

        if (
          (summary.addedFiles > 0 ||
            summary.updatedFiles > 0 ||
            summary.configUpdated ||
            summary.forcedLawclawOverwritten) &&
          this.options.restartGateway
        ) {
          await this.options.restartGateway();
        }
        return;
      }

      if (context.dedicatedAgentPrepared && this.options.restartGateway) {
        await this.options.restartGateway();
      }

      preseedDedicatedWorkspaceFiles(context);
      const input = createPlannerInput(context, task.taskId, conflictPolicy);
      task.snapshotRef = writeSnapshot(context.clawXConfigDir, input);
      task.updatedAt = new Date(this.nowMs()).toISOString();
      task.sourceHash = context.sourceHash;
      task.targetHash = context.targetHash;

      let output: PlannerOutput;
      try {
        output = await this.runPlanner(input);
      } catch (error) {
        const reason = classifyPlannerError(error);
        if (reason === 'LLM_UNAVAILABLE') {
          let forceMessage = '';
          if (context.forceLawclawAgentPreset) {
            const changed = applyForceLawclawPreset(context, input);
            if (changed > 0 && this.options.restartGateway) {
              await this.options.restartGateway();
            }
            if (changed > 0) {
              forceMessage = `; force lawclaw-main applied files=${changed}`;
            }
          }

          const attempt = task.attempt + 1;
          const delayMs = computeAgentPresetRetryDelayMs(attempt, this.random());
          this.ensureTask({
            ...task,
            status: 'pending',
            reason,
            sourceHash: context.sourceHash,
            targetHash: context.targetHash,
            attempt,
            nextRetryAt: new Date(this.nowMs() + delayMs).toISOString(),
            updatedAt: new Date(this.nowMs()).toISOString(),
            lastError: `${String(error)}${forceMessage}`,
          });
          return;
        }

        this.ensureTask({
          ...task,
          status: 'failed',
          reason,
          sourceHash: context.sourceHash,
          targetHash: context.targetHash,
          updatedAt: new Date(this.nowMs()).toISOString(),
          lastError: String(error),
        });

        this.setStatus({
          state: 'failed',
          chatLocked: false,
          reason,
          message: String(error),
          targetHash: context.targetHash,
        });
        return;
      }

      if (output.decision === 'need_confirmation') {
        if (this.options.interactiveWindow === false) {
          this.ensureTask({
            ...task,
            status: 'pending',
            reason: 'CONFLICT_NEED_CONFIRM',
            sourceHash: context.sourceHash,
            targetHash: context.targetHash,
            nextRetryAt: new Date(this.nowMs() + AGENT_PRESET_RETRY_MIN_DELAY_MS).toISOString(),
            updatedAt: new Date(this.nowMs()).toISOString(),
            lastError: output.reason ?? 'conflict requires confirmation',
          });

          this.setStatus({
            state: 'queued',
            chatLocked: false,
            reason: 'CONFLICT_NEED_CONFIRM',
            message: output.reason ?? 'conflict requires confirmation',
            targetHash: context.targetHash,
          });
          return;
        }

        this.ensureTask({
          ...task,
          status: 'awaiting_confirmation',
          reason: 'CONFLICT_NEED_CONFIRM',
          sourceHash: context.sourceHash,
          targetHash: context.targetHash,
          nextRetryAt: new Date(this.nowMs()).toISOString(),
          updatedAt: new Date(this.nowMs()).toISOString(),
          lastError: output.reason ?? 'conflict requires confirmation',
        });

        this.setStatus({
          state: 'awaiting_confirmation',
          chatLocked: true,
          reason: 'CONFLICT_NEED_CONFIRM',
          message: output.reason ?? 'conflict requires confirmation',
          targetHash: context.targetHash,
        });
        return;
      }

      if (output.decision === 'skip') {
        this.ensureTask({
          ...task,
          status: 'pending',
          reason: 'CONFLICT_NEED_CONFIRM',
          sourceHash: context.sourceHash,
          targetHash: context.targetHash,
          nextRetryAt: new Date(this.nowMs() + MANUAL_SKIP_DELAY_MS).toISOString(),
          updatedAt: new Date(this.nowMs()).toISOString(),
          lastError: output.reason ?? 'migration skipped by planner',
        });

        this.setStatus({
          state: 'queued',
          chatLocked: false,
          reason: 'CONFLICT_NEED_CONFIRM',
          message: output.reason ?? 'migration skipped by planner',
          targetHash: context.targetHash,
        });
        return;
      }

      const summary = applyPlannerOutput(context, input, output);
      removeAgentPresetQueueTask(this.queuePath(), task.taskId);
      this.refreshQueueStatus();

      if (
        (summary.addedFiles > 0 ||
          summary.updatedFiles > 0 ||
          summary.configUpdated ||
          summary.forcedLawclawOverwritten) &&
        this.options.restartGateway
      ) {
        await this.options.restartGateway();
      }
    } finally {
      this.running = false;
    }
  }

  private async runDueTask(): Promise<void> {
    if (this.running) {
      return;
    }
    if (this.options.isGatewayRunning && !this.options.isGatewayRunning()) {
      return;
    }

    const queue = readAgentPresetQueue(this.queuePath());
    const dueTask = listDueAgentPresetQueueTasks(queue, this.nowMs())[0];
    if (!dueTask) {
      return;
    }

    await this.runTask(dueTask, 'auto');
  }

  async start(options: AgentPresetMigrationOptions = {}): Promise<void> {
    this.configure(options);

    const queuePath = this.queuePath();
    if (!existsSync(queuePath)) {
      writeAgentPresetQueue(queuePath, { schemaVersion: 1, tasks: [] });
    }

    const context = prepareRuntimeContext(this.options);
    if (context.migrationMode === 'bootstrap') {
      writeAgentPresetQueue(queuePath, { schemaVersion: 1, tasks: [] });
      this.setStatus({
        state: 'running',
        chatLocked: false,
        queueLength: 0,
        currentTaskId: undefined,
        reason: undefined,
        message: undefined,
        targetHash: context.targetHash,
      });
      const summary = runBootstrapInstall(context);
      this.refreshQueueStatus();
      if (
        (summary.addedFiles > 0 ||
          summary.updatedFiles > 0 ||
          summary.configUpdated ||
          summary.forcedLawclawOverwritten) &&
        this.options.restartGateway
      ) {
        await this.options.restartGateway();
      }
    } else if (context.migrationMode === 'upgrade') {
      const queue = readAgentPresetQueue(queuePath);
      const existsTask = queue.tasks.find(
        (task) => task.targetHash === context.targetHash && task.status !== 'running'
      );

      if (!existsTask) {
        const nowIso = new Date(this.nowMs()).toISOString();
        upsertAgentPresetQueueTask(queuePath, {
          taskId: randomUUID(),
          status: 'pending',
          reason: 'LLM_UNAVAILABLE',
          sourceHash: context.sourceHash,
          targetHash: context.targetHash,
          forceLawclawAgentPreset: context.forceLawclawAgentPreset,
          snapshotRef: '',
          attempt: 0,
          nextRetryAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    } else {
      const queue = readAgentPresetQueue(queuePath);
      if (queue.tasks.length > 0) {
        writeAgentPresetQueue(queuePath, { schemaVersion: 1, tasks: [] });
      }
    }

    this.refreshQueueStatus();
    await this.runDueTask();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.heartbeatTimer = setInterval(() => {
      void this.runDueTask();
    }, this.options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS);
  }

  async retryNow(): Promise<void> {
    const queue = readAgentPresetQueue(this.queuePath());
    const awaiting = queue.tasks.find((task) => task.status === 'awaiting_confirmation');
    if (awaiting) {
      this.setStatus({
        state: 'awaiting_confirmation',
        chatLocked: true,
        queueLength: queue.tasks.length,
        currentTaskId: awaiting.taskId,
        reason: 'CONFLICT_NEED_CONFIRM',
        message: awaiting.lastError,
        targetHash: awaiting.targetHash,
      });
      return;
    }

    const pending = queue.tasks
      .filter((task) => task.status === 'pending' || task.status === 'failed')
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))[0];

    if (!pending) {
      this.refreshQueueStatus();
      return;
    }

    const immediateTask: AgentPresetQueueTask = {
      ...pending,
      status: 'pending',
      nextRetryAt: new Date(this.nowMs()).toISOString(),
      updatedAt: new Date(this.nowMs()).toISOString(),
    };

    upsertAgentPresetQueueTask(this.queuePath(), immediateTask);
    await this.runTask(immediateTask, 'auto');
  }

  async resolveConflict(decision: AgentPresetConflictDecision): Promise<{ success: boolean; message?: string }> {
    const queue = readAgentPresetQueue(this.queuePath());
    const conflictTask = queue.tasks.find((task) => task.status === 'awaiting_confirmation');
    if (!conflictTask) {
      return { success: false, message: '当前没有待确认的迁移冲突任务。' };
    }

    if (decision === 'skip_this_time') {
      const deferredTask: AgentPresetQueueTask = {
        ...conflictTask,
        status: 'pending',
        reason: 'CONFLICT_NEED_CONFIRM',
        nextRetryAt: new Date(this.nowMs() + MANUAL_SKIP_DELAY_MS).toISOString(),
        updatedAt: new Date(this.nowMs()).toISOString(),
        lastError: '用户本次选择跳过冲突合并。',
      };
      this.ensureTask(deferredTask);
      this.setStatus({
        state: 'queued',
        chatLocked: false,
        reason: 'CONFLICT_NEED_CONFIRM',
        message: deferredTask.lastError,
        targetHash: deferredTask.targetHash,
      });
      return { success: true };
    }

    const policy: 'auto' | AgentPresetConflictDecision =
      decision === 'prefer_preset' ? 'prefer_preset' : 'preserve_user';

    const rerunTask: AgentPresetQueueTask = {
      ...conflictTask,
      status: 'pending',
      nextRetryAt: new Date(this.nowMs()).toISOString(),
      updatedAt: new Date(this.nowMs()).toISOString(),
      lastError: undefined,
    };

    upsertAgentPresetQueueTask(this.queuePath(), rerunTask);
    await this.runTask(rerunTask, policy);
    return { success: true };
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.running = false;
  }
}

const coordinator = new AgentPresetMigrationCoordinator();

export function getAgentPresetMigrationArtifactsDir(): string {
  return getLocalPresetRoot(getClawXConfigDir());
}

export function getAgentPresetMigrationStatus(): AgentPresetMigrationStatus {
  return coordinator.getStatus();
}

export function onAgentPresetMigrationStatus(listener: (status: AgentPresetMigrationStatus) => void): () => void {
  coordinator.on('status', listener);
  return () => coordinator.off('status', listener);
}

export function onAgentPresetMigrationChatLock(listener: (locked: boolean) => void): () => void {
  coordinator.on('chatLock', listener);
  return () => coordinator.off('chatLock', listener);
}

export async function resolveAgentPresetMigrationConflict(
  decision: AgentPresetConflictDecision
): Promise<{ success: boolean; message?: string }> {
  return coordinator.resolveConflict(decision);
}

export async function retryAgentPresetMigrationNow(): Promise<void> {
  await coordinator.retryNow();
}

export async function runAgentPresetStartupMigration(
  options: AgentPresetMigrationOptions = {}
): Promise<void> {
  try {
    await coordinator.start(options);
  } catch (error) {
    logger.warn('LawClaw agent preset migration startup failed (non-blocking):', error);
  }
}

export function stopAgentPresetMigrationCoordinator(): void {
  coordinator.stop();
}
