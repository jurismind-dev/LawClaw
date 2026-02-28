const LAWCLAW_MAIN_AGENT_ID = 'lawclaw-main';
export const LAWCLAW_SESSION_PREFIX = `agent:${LAWCLAW_MAIN_AGENT_ID}:`;
export const LAWCLAW_DEFAULT_SESSION_KEY = `${LAWCLAW_SESSION_PREFIX}main`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeLawClawSessionKey(sessionKey: unknown): string {
  if (typeof sessionKey === 'string' && sessionKey.startsWith(LAWCLAW_SESSION_PREFIX)) {
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
    sessions: result.sessions.filter(
      (session) => isRecord(session) && typeof session.key === 'string' && session.key.startsWith(LAWCLAW_SESSION_PREFIX)
    ),
  };
}
