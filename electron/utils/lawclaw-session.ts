import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LAWCLAW_MAIN_AGENT_ID = 'lawclaw-main';
export const LAWCLAW_SESSION_PREFIX = `agent:${LAWCLAW_MAIN_AGENT_ID}:`;
export const LAWCLAW_DEFAULT_SESSION_KEY = `${LAWCLAW_SESSION_PREFIX}main`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAgentId(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
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
  const configPath = process.env.LAWCLAW_OPENCLAW_CONFIG_PATH || join(homedir(), '.openclaw', 'openclaw.json');

  try {
    if (!existsSync(configPath)) {
      return configuredIds;
    }

    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const agents = isRecord(parsed.agents) ? parsed.agents : null;
    const list = Array.isArray(agents?.list) ? agents.list : [];

    for (const entry of list) {
      if (!isRecord(entry)) continue;
      const agentId = normalizeAgentId(entry.id);
      if (agentId) {
        configuredIds.add(agentId);
      }
    }
  } catch {
    // Ignore config read failures and fall back to the built-in LawClaw agent.
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
