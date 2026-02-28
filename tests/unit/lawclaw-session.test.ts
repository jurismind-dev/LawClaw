import { describe, expect, it } from 'vitest';
import {
  LAWCLAW_DEFAULT_SESSION_KEY,
  filterLawClawSessions,
  normalizeLawClawSessionKey,
  normalizeSessionKeyParam,
} from '@electron/utils/lawclaw-session';

describe('lawclaw session guard', () => {
  it('normalizeLawClawSessionKey 会将非 lawclaw 会话回落到默认会话', () => {
    expect(normalizeLawClawSessionKey('agent:lawclaw-main:main')).toBe('agent:lawclaw-main:main');
    expect(normalizeLawClawSessionKey('agent:main:main')).toBe(LAWCLAW_DEFAULT_SESSION_KEY);
    expect(normalizeLawClawSessionKey(undefined)).toBe(LAWCLAW_DEFAULT_SESSION_KEY);
  });

  it('normalizeSessionKeyParam 仅改写 sessionKey 字段', () => {
    expect(
      normalizeSessionKeyParam({
        sessionKey: 'agent:main:main',
        limit: 50,
      })
    ).toEqual({
      sessionKey: LAWCLAW_DEFAULT_SESSION_KEY,
      limit: 50,
    });

    expect(normalizeSessionKeyParam({ limit: 20 })).toEqual({ limit: 20 });
    expect(normalizeSessionKeyParam('raw')).toBe('raw');
  });

  it('filterLawClawSessions 仅保留 lawclaw 会话', () => {
    const filtered = filterLawClawSessions({
      sessions: [
        { key: 'agent:lawclaw-main:main' },
        { key: 'agent:main:main' },
        { key: 'agent:lawclaw-main:session-1' },
      ],
      total: 3,
    }) as { sessions: Array<{ key: string }>; total: number };

    expect(filtered.total).toBe(3);
    expect(filtered.sessions.map((item) => item.key)).toEqual([
      'agent:lawclaw-main:main',
      'agent:lawclaw-main:session-1',
    ]);
  });
});
