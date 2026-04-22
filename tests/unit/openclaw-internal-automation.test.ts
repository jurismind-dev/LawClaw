import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const mockHomeState = vi.hoisted(() => ({
  value: process.env.HOME || process.env.USERPROFILE || '/tmp',
}));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  const mocked = {
    ...actual,
    homedir: () => mockHomeState.value,
  };
  return {
    ...mocked,
    default: mocked,
  };
});

const tempHomes: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const TEST_TMPDIR = process.env.TMPDIR || '/tmp';

async function loadInternalAutomationWithHome(homeDir: string) {
  vi.resetModules();
  mockHomeState.value = homeDir;
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  return import('@electron/utils/openclaw-internal-automation');
}

afterEach(() => {
  vi.resetModules();
  mockHomeState.value = originalHome || originalUserProfile || '/tmp';
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;

  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('openclaw internal automation config', () => {
  it('reads boot-md enabled and heartbeat enabled from openclaw.json', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-internal-automation-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    writeFileSync(
      join(openclawDir, 'openclaw.json'),
      JSON.stringify({
        hooks: {
          internal: {
            enabled: true,
            entries: {
              'boot-md': {
                enabled: true,
              },
            },
          },
        },
        agents: {
          defaults: {
            heartbeat: {
              every: '15m',
            },
          },
        },
      }, null, 2),
      'utf-8',
    );

    const mod = await loadInternalAutomationWithHome(homeDir);
    expect(mod.getInternalAutomationConfig()).toEqual({
      bootEnabled: true,
      heartbeatEnabled: true,
      heartbeatEvery: '15m',
    });
  });

  it('disables boot-md and heartbeat when toggled off', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-internal-automation-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        hooks: {
          internal: {
            enabled: true,
            entries: {
              'boot-md': {
                enabled: true,
              },
            },
          },
        },
        agents: {
          defaults: {
            heartbeat: {
              every: '15m',
            },
          },
        },
      }, null, 2),
      'utf-8',
    );

    const mod = await loadInternalAutomationWithHome(homeDir);
    const next = mod.setInternalAutomationConfig({
      bootEnabled: false,
      heartbeatEnabled: false,
    });

    expect(next).toEqual({
      bootEnabled: false,
      heartbeatEnabled: false,
      heartbeatEvery: '0m',
    });

    const saved = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      hooks?: {
        internal?: {
          enabled?: boolean;
          bundled?: string[];
          entries?: Record<string, { enabled?: boolean }>;
        };
      };
      agents?: { defaults?: { heartbeat?: { every?: string } } };
    };

    expect(saved.hooks?.internal?.enabled).toBe(true);
    expect(saved.hooks?.internal?.bundled).toBeUndefined();
    expect(saved.hooks?.internal?.entries?.['boot-md']?.enabled).toBe(false);
    expect(saved.agents?.defaults?.heartbeat?.every).toBe('0m');
  });

  it('re-enables boot-md while preserving the previous heartbeat interval', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-internal-automation-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        hooks: {
          internal: {
            enabled: true,
            entries: {
              'boot-md': {
                enabled: false,
              },
            },
          },
        },
        agents: {
          defaults: {
            heartbeat: {
              every: '0m',
            },
          },
        },
      }, null, 2),
      'utf-8',
    );

    const mod = await loadInternalAutomationWithHome(homeDir);
    const next = mod.setInternalAutomationConfig({
      bootEnabled: true,
      heartbeatEnabled: true,
    });

    expect(next.bootEnabled).toBe(true);
    expect(next.heartbeatEnabled).toBe(true);
    expect(next.heartbeatEvery).toBe('15m');

    const saved = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      hooks?: {
        internal?: {
          enabled?: boolean;
          entries?: Record<string, { enabled?: boolean }>;
        };
      };
      agents?: { defaults?: { heartbeat?: { every?: string } } };
    };

    expect(saved.hooks?.internal?.enabled).toBe(true);
    expect(saved.hooks?.internal?.entries?.['boot-md']?.enabled).toBe(true);
    expect(saved.agents?.defaults?.heartbeat?.every).toBe('15m');
  });

  it('migrates legacy bundled boot-md config to entries format on save', async () => {
    const homeDir = mkdtempSync(join(TEST_TMPDIR, 'lawclaw-internal-automation-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        hooks: {
          internal: {
            enabled: true,
            bundled: ['boot-md'],
          },
        },
        agents: {
          defaults: {
            heartbeat: {
              every: '15m',
            },
          },
        },
      }, null, 2),
      'utf-8',
    );

    const mod = await loadInternalAutomationWithHome(homeDir);
    const next = mod.setInternalAutomationConfig({
      bootEnabled: false,
    });

    expect(next.bootEnabled).toBe(false);

    const saved = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      hooks?: {
        internal?: {
          enabled?: boolean;
          bundled?: string[];
          entries?: Record<string, { enabled?: boolean }>;
        };
      };
    };

    expect(saved.hooks?.internal?.enabled).toBe(true);
    expect(saved.hooks?.internal?.bundled).toBeUndefined();
    expect(saved.hooks?.internal?.entries?.['boot-md']?.enabled).toBe(false);
  });
});
