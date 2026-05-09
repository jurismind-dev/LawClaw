import { access, copyFile, mkdir, readdir, rm } from 'fs/promises';
import { constants } from 'fs';
import { join, normalize } from 'path';
import { expandPath, getOpenClawConfigDir } from './paths';
import { listConfiguredChannels, readOpenClawConfig, writeOpenClawConfig } from './channel-config';
import { logger } from './logger';
import { withConfigLock } from './config-mutex';

const DEFAULT_AGENT_ID = 'lawclaw-main';
const DEFAULT_AGENT_NAME = 'LawClaw';
const DEFAULT_WORKSPACE_PATH = '~/.openclaw/workspace-lawclaw-main';
const DEFAULT_ACCOUNT_ID = 'default';
const AGENT_BOOTSTRAP_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md',
  'IDENTITY.md',
  'HEARTBEAT.md',
  'BOOT.md',
];
const AGENT_RUNTIME_FILES = [
  'auth-profiles.json',
  'models.json',
];

interface AgentModelConfig {
  primary?: string;
  [key: string]: unknown;
}

interface AgentAcpRuntimeConfig {
  agent?: string;
  backend?: string;
  mode?: string;
  cwd?: string;
}

interface AgentRuntimeConfig {
  type: 'acp';
  acp?: AgentAcpRuntimeConfig;
}

interface AgentDefaultsConfig {
  workspace?: string;
  model?: string | AgentModelConfig;
  [key: string]: unknown;
}

interface AgentListEntry extends Record<string, unknown> {
  id: string;
  name?: string;
  default?: boolean;
  workspace?: string;
  agentDir?: string;
  model?: string | AgentModelConfig;
  runtime?: unknown;
}

interface AgentsConfig extends Record<string, unknown> {
  defaults?: AgentDefaultsConfig;
  list?: AgentListEntry[];
}

interface BindingMatch extends Record<string, unknown> {
  channel?: string;
  accountId?: string;
}

interface BindingConfig extends Record<string, unknown> {
  agentId?: string;
  match?: BindingMatch;
}

interface AgentConfigDocument extends Record<string, unknown> {
  agents?: AgentsConfig;
  bindings?: BindingConfig[];
  channels?: Record<string, Record<string, unknown>>;
  session?: {
    mainKey?: string;
    [key: string]: unknown;
  };
}

export interface AgentSummary {
  id: string;
  name: string;
  isDefault: boolean;
  modelDisplay: string;
  modelRef: string | null;
  overrideModelRef: string | null;
  inheritedModel: boolean;
  workspace: string;
  agentDir: string;
  mainSessionKey: string;
  channelTypes: string[];
  runtime?: AgentRuntimeConfig;
}

export interface AgentsSnapshot {
  agents: AgentSummary[];
  defaultAgentId: string;
  defaultModelRef: string | null;
  configuredChannelTypes: string[];
  channelOwners: Record<string, string>;
  channelAccountOwners: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBindingConfig(value: unknown): value is BindingConfig {
  if (!isRecord(value)) return false;
  if (typeof value.agentId !== 'string' || !value.agentId.trim()) return false;
  if (!isRecord(value.match)) return false;
  return typeof value.match.channel === 'string' && value.match.channel.trim().length > 0;
}

function normalizeAgentId(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeAgentName(name: string): string {
  return name.trim() || 'Agent';
}

function slugifyAgentId(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized || /^\d+$/.test(normalized)) return 'agent';
  if (normalized === DEFAULT_AGENT_ID) return 'agent';
  return normalized;
}

function resolveModelRef(model: unknown): string | null {
  if (typeof model === 'string' && model.trim()) {
    return model.trim();
  }
  if (isRecord(model) && typeof model.primary === 'string' && model.primary.trim()) {
    return model.primary.trim();
  }
  return null;
}

function formatModelLabel(model: unknown): string | null {
  const modelRef = resolveModelRef(model);
  if (!modelRef) return null;
  const parts = modelRef.split('/');
  return parts[parts.length - 1] || modelRef;
}

function normalizeAcpRuntimeConfig(value: unknown): AgentRuntimeConfig | undefined {
  if (!isRecord(value) || value.type !== 'acp') {
    return undefined;
  }

  const acpRecord = isRecord(value.acp) ? value.acp : undefined;
  const acp: AgentAcpRuntimeConfig = {};
  if (typeof acpRecord?.agent === 'string' && acpRecord.agent.trim()) {
    acp.agent = acpRecord.agent.trim();
  }
  if (typeof acpRecord?.backend === 'string' && acpRecord.backend.trim()) {
    acp.backend = acpRecord.backend.trim();
  }
  if (typeof acpRecord?.mode === 'string' && acpRecord.mode.trim()) {
    acp.mode = acpRecord.mode.trim();
  }
  if (typeof acpRecord?.cwd === 'string' && acpRecord.cwd.trim()) {
    acp.cwd = acpRecord.cwd.trim();
  }

  return Object.keys(acp).length > 0
    ? { type: 'acp', acp }
    : { type: 'acp' };
}

function formatRuntimeModelLabel(runtime: AgentRuntimeConfig | undefined): string | null {
  if (runtime?.type !== 'acp') {
    return null;
  }

  const backend = runtime.acp?.backend || 'acp';
  return `ACP / ${backend}`;
}

function normalizeMainKey(value: unknown): string {
  if (typeof value !== 'string') return 'main';
  const trimmed = value.trim().toLowerCase();
  return trimmed || 'main';
}

function buildAgentMainSessionKey(config: AgentConfigDocument, agentId: string): string {
  return `agent:${normalizeAgentId(agentId) || DEFAULT_AGENT_ID}:${normalizeMainKey(config.session?.mainKey)}`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(path: string): Promise<void> {
  if (!(await fileExists(path))) {
    await mkdir(path, { recursive: true });
  }
}

function getDefaultWorkspacePath(config: AgentConfigDocument): string {
  const defaults = isRecord(config.agents) && isRecord(config.agents.defaults)
    ? config.agents.defaults as AgentDefaultsConfig
    : undefined;
  return typeof defaults?.workspace === 'string' && defaults.workspace.trim()
    ? defaults.workspace
    : DEFAULT_WORKSPACE_PATH;
}

function getDefaultAgentDirPath(agentId: string): string {
  return `~/.openclaw/agents/${agentId}/agent`;
}

function createImplicitDefaultEntry(config: AgentConfigDocument): AgentListEntry {
  return {
    id: DEFAULT_AGENT_ID,
    name: DEFAULT_AGENT_NAME,
    default: true,
    workspace: getDefaultWorkspacePath(config),
    agentDir: getDefaultAgentDirPath(DEFAULT_AGENT_ID),
  };
}

function normalizeAgentsConfig(config: AgentConfigDocument): {
  agentsConfig: AgentsConfig;
  entries: AgentListEntry[];
  defaultAgentId: string;
} {
  const agentsConfig = isRecord(config.agents)
    ? { ...(config.agents as AgentsConfig) }
    : {};
  const entries = Array.isArray(agentsConfig.list)
    ? agentsConfig.list.filter((entry): entry is AgentListEntry => (
      isRecord(entry) && typeof entry.id === 'string' && entry.id.trim().length > 0
    )).map((entry) => ({ ...entry }))
    : [];

  if (entries.length === 0) {
    const fallback = createImplicitDefaultEntry(config);
    return {
      agentsConfig,
      entries: [fallback],
      defaultAgentId: DEFAULT_AGENT_ID,
    };
  }

  const defaultEntry = entries.find((entry) => entry.default) ?? entries.find((entry) => entry.id === DEFAULT_AGENT_ID) ?? entries[0];
  return {
    agentsConfig,
    entries,
    defaultAgentId: defaultEntry.id,
  };
}

function getChannelBindingMap(bindings: unknown): {
  channelToAgent: Map<string, string>;
  accountToAgent: Map<string, string>;
} {
  const channelToAgent = new Map<string, string>();
  const accountToAgent = new Map<string, string>();
  if (!Array.isArray(bindings)) {
    return { channelToAgent, accountToAgent };
  }

  for (const binding of bindings) {
    if (!isBindingConfig(binding)) continue;
    const agentId = normalizeAgentId(binding.agentId);
    const channelType = String(binding.match?.channel || '').trim().toLowerCase();
    const accountId = String(binding.match?.accountId || '').trim();
    if (!agentId || !channelType) continue;

    if (accountId) {
      accountToAgent.set(`${channelType}:${accountId}`, agentId);
    } else {
      channelToAgent.set(channelType, agentId);
    }
  }

  return { channelToAgent, accountToAgent };
}

async function buildSnapshotFromConfig(config: AgentConfigDocument): Promise<AgentsSnapshot> {
  const { entries, defaultAgentId } = normalizeAgentsConfig(config);
  const configuredChannels = await listConfiguredChannels();
  const { channelToAgent, accountToAgent } = getChannelBindingMap(config.bindings);
  const agentChannelSets = new Map<string, Set<string>>();
  const defaultAgentKey = normalizeAgentId(defaultAgentId);
  const channelOwners: Record<string, string> = {};
  const channelAccountOwners: Record<string, string> = {};

  for (const channelType of configuredChannels) {
    const wildcardOwner = accountToAgent.get(`${channelType}:*`);
    if (wildcardOwner) {
      channelAccountOwners[`${channelType}:*`] = wildcardOwner;
    }

    const channelSection = config.channels?.[channelType];
    const configuredAccountIds = isRecord(channelSection) && isRecord(channelSection.accounts)
      ? Object.keys(channelSection.accounts)
      : [];
    const accountIds = configuredAccountIds.length > 0 ? configuredAccountIds : [DEFAULT_ACCOUNT_ID];
    const hasExplicitAccountBinding = wildcardOwner || accountIds.some((accountId) =>
      accountToAgent.has(`${channelType}:${accountId}`)
    );

    let primaryOwner: string | undefined;

    for (const accountId of accountIds) {
      const owner =
        accountToAgent.get(`${channelType}:${accountId}`)
        || wildcardOwner
        || (
          accountId === DEFAULT_ACCOUNT_ID && !hasExplicitAccountBinding
            ? channelToAgent.get(channelType)
            : undefined
        );

      if (!owner) {
        continue;
      }

      channelAccountOwners[`${channelType}:${accountId}`] = owner;
      primaryOwner ??= owner;

      const existing = agentChannelSets.get(owner) ?? new Set<string>();
      existing.add(channelType);
      agentChannelSets.set(owner, existing);
    }

    if (!primaryOwner) {
      primaryOwner = channelToAgent.get(channelType) || defaultAgentKey;
      const existing = agentChannelSets.get(primaryOwner) ?? new Set<string>();
      existing.add(channelType);
      agentChannelSets.set(primaryOwner, existing);
    }

    channelOwners[channelType] = primaryOwner;
  }

  const defaultModelConfig = isRecord(config.agents) && isRecord(config.agents.defaults)
    ? (config.agents.defaults as AgentDefaultsConfig).model
    : undefined;
  const defaultModelLabel = formatModelLabel(defaultModelConfig);
  const defaultModelRef = resolveModelRef(defaultModelConfig);

  const agents: AgentSummary[] = entries.map((entry) => {
    const explicitModelRef = resolveModelRef(entry.model);
    const runtime = normalizeAcpRuntimeConfig(entry.runtime);
    const runtimeLabel = formatRuntimeModelLabel(runtime);
    const modelLabel = runtimeLabel || formatModelLabel(entry.model) || defaultModelLabel || 'Not configured';
    const entryKey = normalizeAgentId(entry.id);
    const channelTypes = [...(agentChannelSets.get(entryKey) ?? new Set<string>())].sort();

    return {
      id: entry.id,
      name: entry.name || (entry.id === DEFAULT_AGENT_ID ? DEFAULT_AGENT_NAME : entry.id),
      isDefault: entry.id === defaultAgentId,
      modelDisplay: modelLabel,
      modelRef: runtime ? null : explicitModelRef || defaultModelRef || null,
      overrideModelRef: explicitModelRef,
      inheritedModel: !runtime && !explicitModelRef && Boolean(defaultModelLabel),
      workspace: entry.workspace || (entry.id === DEFAULT_AGENT_ID ? getDefaultWorkspacePath(config) : `~/.openclaw/workspace-${entry.id}`),
      agentDir: entry.agentDir || getDefaultAgentDirPath(entry.id),
      mainSessionKey: buildAgentMainSessionKey(config, entry.id),
      channelTypes,
      ...(runtime ? { runtime } : {}),
    };
  });

  return {
    agents,
    defaultAgentId,
    defaultModelRef,
    configuredChannelTypes: configuredChannels,
    channelOwners,
    channelAccountOwners,
  };
}

export async function listAgentsSnapshot(): Promise<AgentsSnapshot> {
  const config = await readOpenClawConfig() as AgentConfigDocument;
  return buildSnapshotFromConfig(config);
}

export async function listConfiguredAgentIds(): Promise<string[]> {
  const config = await readOpenClawConfig() as AgentConfigDocument;
  const { entries } = normalizeAgentsConfig(config);
  const ids = [...new Set(entries.map((entry) => entry.id.trim()).filter(Boolean))];
  return ids.length > 0 ? ids : [DEFAULT_AGENT_ID];
}

async function listExistingAgentIdsOnDisk(): Promise<Set<string>> {
  const ids = new Set<string>();
  const agentsDir = join(getOpenClawConfigDir(), 'agents');

  try {
    if (!(await fileExists(agentsDir))) return ids;
    const entries = await readdir(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) ids.add(entry.name);
    }
  } catch {
    // ignore discovery failures
  }

  return ids;
}

async function copyBootstrapFiles(sourceWorkspace: string, targetWorkspace: string): Promise<void> {
  await ensureDir(targetWorkspace);

  for (const fileName of AGENT_BOOTSTRAP_FILES) {
    const source = join(sourceWorkspace, fileName);
    const target = join(targetWorkspace, fileName);
    if (!(await fileExists(source)) || (await fileExists(target))) continue;
    await copyFile(source, target);
  }
}

async function copyRuntimeFiles(sourceAgentDir: string, targetAgentDir: string): Promise<void> {
  await ensureDir(targetAgentDir);

  for (const fileName of AGENT_RUNTIME_FILES) {
    const source = join(sourceAgentDir, fileName);
    const target = join(targetAgentDir, fileName);
    if (!(await fileExists(source)) || (await fileExists(target))) continue;
    await copyFile(source, target);
  }
}

async function provisionAgentFilesystem(
  config: AgentConfigDocument,
  agent: AgentListEntry,
  options?: { inheritWorkspace?: boolean },
): Promise<void> {
  const { entries } = normalizeAgentsConfig(config);
  const sourceAgent = entries.find((entry) => entry.id === DEFAULT_AGENT_ID) ?? createImplicitDefaultEntry(config);
  const sourceWorkspace = expandPath(sourceAgent.workspace || getDefaultWorkspacePath(config));
  const sourceAgentDir = expandPath(sourceAgent.agentDir || getDefaultAgentDirPath(DEFAULT_AGENT_ID));
  const targetWorkspace = expandPath(agent.workspace || `~/.openclaw/workspace-${agent.id}`);
  const targetAgentDir = expandPath(agent.agentDir || getDefaultAgentDirPath(agent.id));
  const targetSessionsDir = join(getOpenClawConfigDir(), 'agents', agent.id, 'sessions');

  await ensureDir(targetWorkspace);
  await ensureDir(targetAgentDir);
  await ensureDir(targetSessionsDir);

  if (options?.inheritWorkspace && targetWorkspace !== sourceWorkspace) {
    await copyBootstrapFiles(sourceWorkspace, targetWorkspace);
  }
  if (targetAgentDir !== sourceAgentDir) {
    await copyRuntimeFiles(sourceAgentDir, targetAgentDir);
  }
}

function trimTrailingSeparators(path: string): string {
  return path.replace(/[\\/]+$/, '');
}

function getManagedWorkspaceDirectory(agent: AgentListEntry): string | null {
  if (agent.id === DEFAULT_AGENT_ID) return null;

  const configuredWorkspace = expandPath(agent.workspace || `~/.openclaw/workspace-${agent.id}`);
  const managedWorkspace = join(getOpenClawConfigDir(), `workspace-${agent.id}`);
  const normalizedConfigured = trimTrailingSeparators(normalize(configuredWorkspace));
  const normalizedManaged = trimTrailingSeparators(normalize(managedWorkspace));

  return normalizedConfigured === normalizedManaged ? configuredWorkspace : null;
}

export async function removeAgentWorkspaceDirectory(agent: { id: string; workspace?: string }): Promise<void> {
  const workspaceDir = getManagedWorkspaceDirectory(agent as AgentListEntry);
  if (!workspaceDir) {
    logger.warn('Skipping agent workspace deletion for unmanaged path', {
      agentId: agent.id,
      workspace: agent.workspace,
    });
    return;
  }

  try {
    await rm(workspaceDir, { recursive: true, force: true });
  } catch (error) {
    logger.warn('Failed to remove agent workspace directory', {
      agentId: agent.id,
      workspaceDir,
      error: String(error),
    });
  }
}

async function removeAgentRuntimeDirectory(agentId: string): Promise<void> {
  const runtimeDir = join(getOpenClawConfigDir(), 'agents', agentId);
  try {
    await rm(runtimeDir, { recursive: true, force: true });
  } catch (error) {
    logger.warn('Failed to remove agent runtime directory', {
      agentId,
      runtimeDir,
      error: String(error),
    });
  }
}

function isValidModelRef(modelRef: string): boolean {
  const firstSlash = modelRef.indexOf('/');
  return firstSlash > 0 && firstSlash < modelRef.length - 1;
}

export async function createAgent(
  name: string,
  options?: { inheritWorkspace?: boolean },
): Promise<AgentsSnapshot> {
  return withConfigLock(async () => {
    const config = await readOpenClawConfig() as AgentConfigDocument;
    const { agentsConfig, entries } = normalizeAgentsConfig(config);
    const normalizedName = normalizeAgentName(name);
    const existingIds = new Set(entries.map((entry) => entry.id));
    const diskIds = await listExistingAgentIdsOnDisk();
    const baseId = slugifyAgentId(normalizedName);
    let nextId = baseId;
    let suffix = 2;

    while (existingIds.has(nextId) || diskIds.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const nextEntries = [...entries];
    const newAgent: AgentListEntry = {
      id: nextId,
      name: normalizedName,
      workspace: `~/.openclaw/workspace-${nextId}`,
      agentDir: getDefaultAgentDirPath(nextId),
    };
    nextEntries.push(newAgent);

    config.agents = {
      ...agentsConfig,
      list: nextEntries,
    };

    await provisionAgentFilesystem(config, newAgent, { inheritWorkspace: options?.inheritWorkspace });
    await writeOpenClawConfig(config);
    logger.info('Created agent config entry', { agentId: nextId, inheritWorkspace: !!options?.inheritWorkspace });
    return buildSnapshotFromConfig(config);
  });
}

export async function updateAgentName(agentId: string, name: string): Promise<AgentsSnapshot> {
  return withConfigLock(async () => {
    const config = await readOpenClawConfig() as AgentConfigDocument;
    const { agentsConfig, entries } = normalizeAgentsConfig(config);
    const normalizedName = normalizeAgentName(name);
    const index = entries.findIndex((entry) => entry.id === agentId);

    if (index === -1) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    entries[index] = {
      ...entries[index],
      name: normalizedName,
    };

    config.agents = {
      ...agentsConfig,
      list: entries,
    };

    await writeOpenClawConfig(config);
    logger.info('Updated agent name', { agentId, name: normalizedName });
    return buildSnapshotFromConfig(config);
  });
}

export async function updateAgentModel(agentId: string, modelRef: string | null): Promise<AgentsSnapshot> {
  return withConfigLock(async () => {
    const config = await readOpenClawConfig() as AgentConfigDocument;
    const { agentsConfig, entries } = normalizeAgentsConfig(config);
    const index = entries.findIndex((entry) => entry.id === agentId);

    if (index === -1) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    const nextEntry: AgentListEntry = { ...entries[index] };
    const normalizedModelRef = typeof modelRef === 'string' ? modelRef.trim() : '';

    if (!normalizedModelRef) {
      delete nextEntry.model;
    } else {
      if (!isValidModelRef(normalizedModelRef)) {
        throw new Error('modelRef must be in "provider/model" format');
      }
      nextEntry.model = { primary: normalizedModelRef };
    }

    entries[index] = nextEntry;
    config.agents = {
      ...agentsConfig,
      list: entries,
    };

    await writeOpenClawConfig(config);
    logger.info('Updated agent model', { agentId, modelRef: normalizedModelRef || null });
    return buildSnapshotFromConfig(config);
  });
}

export async function deleteAgentConfig(agentId: string): Promise<{ snapshot: AgentsSnapshot; removedEntry: AgentListEntry }> {
  return withConfigLock(async () => {
    if (agentId === DEFAULT_AGENT_ID) {
      throw new Error('The default LawClaw agent cannot be deleted');
    }

    const config = await readOpenClawConfig() as AgentConfigDocument;
    const { agentsConfig, entries, defaultAgentId } = normalizeAgentsConfig(config);
    const removedEntry = entries.find((entry) => entry.id === agentId);
    const nextEntries = entries.filter((entry) => entry.id !== agentId);

    if (!removedEntry || nextEntries.length === entries.length) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    if (defaultAgentId === agentId && nextEntries.length > 0) {
      nextEntries[0] = {
        ...nextEntries[0],
        default: true,
      };
    }

    config.agents = {
      ...agentsConfig,
      list: nextEntries,
    };
    config.bindings = Array.isArray(config.bindings)
      ? config.bindings.filter((binding) => !(isBindingConfig(binding) && normalizeAgentId(binding.agentId) === normalizeAgentId(agentId)))
      : undefined;

    await writeOpenClawConfig(config);
    await removeAgentRuntimeDirectory(agentId);
    logger.info('Deleted agent config entry', { agentId });
    return {
      snapshot: await buildSnapshotFromConfig(config),
      removedEntry,
    };
  });
}
