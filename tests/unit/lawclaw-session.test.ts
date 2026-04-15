import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function importModule() {
  return import('@electron/utils/lawclaw-session');
}

describe('lawclaw session guard', () => {
  let tempDir = '';
  let configPath = '';

  const writeConfig = (config: unknown) => {
    mkdirSync(join(tempDir, '.openclaw'), { recursive: true });
    writeFileSync(configPath, JSON.stringify(config), 'utf-8');
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDir = mkdtempSync(join(tmpdir(), 'lawclaw-session-'));
    configPath = join(tempDir, '.openclaw', 'openclaw.json');
    process.env.LAWCLAW_OPENCLAW_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    delete process.env.LAWCLAW_OPENCLAW_CONFIG_PATH;
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = '';
      configPath = '';
    }
  });

  it('normalizeLawClawSessionKey 会保留任意非空字符串 sessionKey，仅空值回落到默认会话', async () => {
    const mod = await importModule();

    expect(mod.normalizeLawClawSessionKey('agent:lawclaw-main:main')).toBe('agent:lawclaw-main:main');
    expect(mod.normalizeLawClawSessionKey('agent:main:main')).toBe('agent:main:main');
    expect(mod.normalizeLawClawSessionKey(undefined)).toBe(mod.LAWCLAW_DEFAULT_SESSION_KEY);
    expect(mod.normalizeLawClawSessionKey('')).toBe(mod.LAWCLAW_DEFAULT_SESSION_KEY);
  });

  it('允许未知 agent 会话透传，避免把真实历史重写到默认会话', async () => {
    writeConfig({
      agents: {
        list: [
          { id: 'lawclaw-main' },
          { id: 'contract-review' },
        ],
      },
    });
    const mod = await importModule();

    expect(mod.normalizeLawClawSessionKey('agent:contract-review:main')).toBe('agent:contract-review:main');
    expect(mod.normalizeLawClawSessionKey('agent:research:main')).toBe('agent:research:main');
  });

  it('normalizeSessionKeyParam 仅改写 sessionKey 字段', async () => {
    writeConfig({
      agents: {
        list: [{ id: 'lawclaw-main' }, { id: 'contract-review' }],
      },
    });
    const mod = await importModule();

    expect(
      mod.normalizeSessionKeyParam({
        sessionKey: 'agent:contract-review:main',
        limit: 50,
      })
    ).toEqual({
      sessionKey: 'agent:contract-review:main',
      limit: 50,
    });

    expect(
      mod.normalizeSessionKeyParam({
        sessionKey: 'agent:research:main',
        limit: 20,
      })
    ).toEqual({
      sessionKey: 'agent:research:main',
      limit: 20,
    });

    expect(mod.normalizeSessionKeyParam({ limit: 20 })).toEqual({ limit: 20 });
    expect(mod.normalizeSessionKeyParam('raw')).toBe('raw');
  });

  it('filterLawClawSessions 保留所有合法 agent session，仅过滤畸形 key', async () => {
    writeConfig({
      agents: {
        list: [{ id: 'lawclaw-main' }, { id: 'contract-review' }],
      },
    });
    const mod = await importModule();

    const filtered = mod.filterLawClawSessions({
      sessions: [
        { key: 'agent:lawclaw-main:main' },
        { key: 'agent:contract-review:main' },
        { key: 'agent:research:main' },
        { key: 'bad-key' },
      ],
      total: 4,
    }) as { sessions: Array<{ key: string }>; total: number };

    expect(filtered.total).toBe(4);
    expect(filtered.sessions.map((item) => item.key)).toEqual([
      'agent:lawclaw-main:main',
      'agent:contract-review:main',
      'agent:research:main',
    ]);
  });
});
