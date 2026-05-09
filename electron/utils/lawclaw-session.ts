import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LAWCLAW_MAIN_AGENT_ID = 'lawclaw-main';
export const LAWCLAW_SESSION_PREFIX = `agent:${LAWCLAW_MAIN_AGENT_ID}:`;
export const LAWCLAW_DEFAULT_SESSION_KEY = `${LAWCLAW_SESSION_PREFIX}main`;
const ACP_SESSION_KEY_PATTERN = /^agent:[^:]+:acp:/;

type HistoryMessage = Record<string, unknown> & {
  role?: unknown;
  content?: unknown;
};

type AcpHistoryEntry =
  | { type: 'user'; message: HistoryMessage }
  | { type: 'agent' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAgentId(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function getOpenClawConfigPath(): string {
  return process.env.LAWCLAW_OPENCLAW_CONFIG_PATH || join(homedir(), '.openclaw', 'openclaw.json');
}

function readConfiguredOpenClawConfig(): Record<string, unknown> | null {
  const configPath = getOpenClawConfigPath();

  try {
    if (!existsSync(configPath)) {
      return null;
    }

    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getSessionAgentId(sessionKey: string): string | null {
  if (!sessionKey.startsWith('agent:')) {
    return null;
  }

  const parts = sessionKey.split(':');
  if (parts.length < 3) {
    return null;
  }

  const agentId = normalizeAgentId(parts[1]);
  return agentId || null;
}

function getConfiguredAgentIds(): Set<string> {
  const configuredIds = new Set<string>([LAWCLAW_MAIN_AGENT_ID]);
  const parsed = readConfiguredOpenClawConfig();
  const agents = isRecord(parsed?.agents) ? parsed.agents : null;
  const list = Array.isArray(agents?.list) ? agents.list : [];

  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const agentId = normalizeAgentId(entry.id);
    if (agentId) {
      configuredIds.add(agentId);
    }
  }

  return configuredIds;
}

function isAllowedLawClawSessionKey(sessionKey: unknown): sessionKey is string {
  if (typeof sessionKey !== 'string') {
    return false;
  }

  const agentId = getSessionAgentId(sessionKey);
  if (!agentId) {
    return false;
  }

  return getConfiguredAgentIds().has(agentId);
}

export function normalizeLawClawSessionKey(sessionKey: unknown): string {
  if (typeof sessionKey === 'string' && sessionKey.trim()) {
    return sessionKey;
  }
  return LAWCLAW_DEFAULT_SESSION_KEY;
}

export function normalizeSessionKeyParam(params: unknown): unknown {
  if (!isRecord(params) || !('sessionKey' in params)) {
    return params;
  }

  const normalized = normalizeLawClawSessionKey(params.sessionKey);
  if (params.sessionKey === normalized) {
    return params;
  }

  return {
    ...params,
    sessionKey: normalized,
  };
}

export function filterLawClawSessions(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.sessions)) {
    return result;
  }

  return {
    ...result,
    sessions: result.sessions.filter((session) => {
      if (!isRecord(session) || typeof session.key !== 'string') {
        return false;
      }

      const agentId = getSessionAgentId(session.key);
      if (!agentId) {
        return false;
      }

      // Preserve persisted conversation history even when the local agent
      // registry has drifted or failed to load. Hiding these sessions makes
      // real transcripts appear "deleted" from the sidebar.
      return true;
    }),
  };
}

function expandHomePath(pathValue: unknown): string | null {
  if (typeof pathValue !== 'string') return null;
  const trimmed = pathValue.trim();
  if (!trimmed) return null;
  if (trimmed === '~') return homedir();
  if (trimmed.startsWith('~/')) {
    return join(homedir(), trimmed.slice(2));
  }
  return trimmed;
}

function getConfiguredWorkspacePaths(): string[] {
  const parsed = readConfiguredOpenClawConfig();
  const agents = isRecord(parsed?.agents) ? parsed.agents : null;
  const list = Array.isArray(agents?.list) ? agents.list : [];
  const workspaces = new Set<string>();
  workspaces.add(join(homedir(), '.openclaw', 'workspace-lawclaw-main'));

  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const workspace = expandHomePath(entry.workspace);
    if (workspace) {
      workspaces.add(workspace);
    }
  }

  return Array.from(workspaces);
}

function findAcpSessionStatePath(sessionKey: string): string | null {
  const fileName = `${encodeURIComponent(sessionKey)}.json`;
  for (const workspacePath of getConfiguredWorkspacePaths()) {
    const candidate = join(workspacePath, 'state', 'sessions', fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function extractAcpText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const parts: string[] = [];
  for (const item of content) {
    if (isRecord(item)) {
      if (typeof item.Text === 'string') {
        parts.push(item.Text);
      } else if (typeof item.text === 'string') {
        parts.push(item.text);
      }
    }
  }
  return parts.join('\n');
}

function stripAcpUserTimestamp(text: string): string {
  return text.replace(/^\[[^\]]+\]\s*/, '').trim();
}

function readAcpHistoryEntries(sessionKey: string): AcpHistoryEntry[] {
  if (!ACP_SESSION_KEY_PATTERN.test(sessionKey)) {
    return [];
  }

  const statePath = findAcpSessionStatePath(sessionKey);
  if (!statePath) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf-8')) as unknown;
    const messages = isRecord(parsed) && Array.isArray(parsed.messages) ? parsed.messages : [];
    const entries: AcpHistoryEntry[] = [];

    for (const item of messages) {
      if (!isRecord(item)) continue;

      const user = isRecord(item.User) ? item.User : null;
      if (user) {
        const text = stripAcpUserTimestamp(extractAcpText(user.content));
        if (text) {
          entries.push({
            type: 'user',
            message: {
              role: 'user',
              content: text,
              ...(typeof user.id === 'string' ? { id: user.id } : {}),
            },
          });
        }
        continue;
      }

      if (isRecord(item.Agent)) {
        entries.push({ type: 'agent' });
      }
    }

    return entries;
  } catch {
    return [];
  }
}

export function mergeAcpUserTurnsIntoHistory(result: unknown, params: unknown): unknown {
  if (!isRecord(params) || typeof params.sessionKey !== 'string') {
    return result;
  }
  if (!isRecord(result) || !Array.isArray(result.messages)) {
    return result;
  }

  const messages = result.messages as HistoryMessage[];
  if (messages.some((message) => String(message.role || '').toLowerCase() === 'user')) {
    return result;
  }

  const acpEntries = readAcpHistoryEntries(params.sessionKey);
  if (!acpEntries.some((entry) => entry.type === 'user')) {
    return result;
  }

  const gatewayMessages = [...messages];
  const mergedMessages: HistoryMessage[] = [];
  for (const entry of acpEntries) {
    if (entry.type === 'user') {
      mergedMessages.push(entry.message);
      continue;
    }

    const gatewayMessage = gatewayMessages.shift();
    if (gatewayMessage) {
      mergedMessages.push(gatewayMessage);
    }
  }

  mergedMessages.push(...gatewayMessages);
  return {
    ...result,
    messages: mergedMessages,
  };
}
