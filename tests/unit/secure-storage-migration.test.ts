import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const electronState = vi.hoisted(() => ({
  userData: '/tmp/LawClaw',
}));

const storeState = vi.hoisted(() => ({
  initial: {
    providers: {} as Record<string, unknown>,
    apiKeys: {} as Record<string, string>,
    defaultProvider: null as string | null,
  },
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => (name === 'userData' ? electronState.userData : '/tmp')),
  },
}));

vi.mock('electron-store', () => {
  class MockStore {
    private state: Record<string, unknown>;

    constructor(options?: { defaults?: Record<string, unknown> }) {
      this.state = {
        ...(options?.defaults || {}),
        ...storeState.initial,
      };
    }

    get(key: string) {
      return this.state[key];
    }

    set(key: string | Record<string, unknown>, value?: unknown) {
      if (typeof key === 'string') {
        this.state[key] = value;
        return;
      }

      Object.assign(this.state, key);
    }

    delete(key: string) {
      delete this.state[key];
    }
  }

  return {
    default: MockStore,
  };
});

const tempDirs: string[] = [];

async function loadSecureStorage() {
  vi.resetModules();
  return import('../../electron/utils/secure-storage');
}

function writeLegacyStoreFile(
  rootDir: string,
  legacyDirName: 'ClawX' | 'OpenClaw',
  filename: string,
  data: unknown
) {
  const legacyDir = join(rootDir, legacyDirName);
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(join(legacyDir, filename), JSON.stringify(data, null, 2), 'utf-8');
}

afterEach(() => {
  vi.clearAllMocks();
  storeState.initial = {
    providers: {},
    apiKeys: {},
    defaultProvider: null,
  };
  electronState.userData = '/tmp/LawClaw';

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('secure-storage legacy provider migration', () => {
  it('hydrates the current provider store from the legacy clawx-providers file when current store is empty', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'lawclaw-provider-store-'));
    tempDirs.push(rootDir);

    electronState.userData = join(rootDir, 'LawClaw');
    mkdirSync(electronState.userData, { recursive: true });

    writeLegacyStoreFile(rootDir, 'OpenClaw', 'clawx-providers.json', {
      providers: {
        'provider-jurismind': {
          id: 'provider-jurismind',
          name: 'Jurismind',
          type: 'jurismind',
          model: 'jurismind',
          enabled: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      },
      apiKeys: {
        'provider-jurismind': 'sk-jurismind',
      },
      defaultProvider: 'provider-jurismind',
    });

    const mod = await loadSecureStorage();

    expect(await mod.getDefaultProvider()).toBe('provider-jurismind');
    expect(await mod.getApiKey('provider-jurismind')).toBe('sk-jurismind');
    expect(await mod.getProvider('provider-jurismind')).toMatchObject({
      id: 'provider-jurismind',
      type: 'jurismind',
      model: 'jurismind',
    });
  });

  it('falls back to the older providers.json filename when needed', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'lawclaw-provider-store-'));
    tempDirs.push(rootDir);

    electronState.userData = join(rootDir, 'LawClaw');
    mkdirSync(electronState.userData, { recursive: true });

    writeLegacyStoreFile(rootDir, 'ClawX', 'providers.json', {
      providers: {
        'provider-openai': {
          id: 'provider-openai',
          name: 'OpenAI',
          type: 'openai',
          model: 'gpt-5.4',
          enabled: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      },
      apiKeys: {
        'provider-openai': 'sk-openai',
      },
      defaultProvider: 'provider-openai',
    });

    const mod = await loadSecureStorage();

    expect(await mod.getDefaultProvider()).toBe('provider-openai');
    expect(await mod.getApiKey('provider-openai')).toBe('sk-openai');
    expect(await mod.getProvider('provider-openai')).toMatchObject({
      id: 'provider-openai',
      type: 'openai',
    });
  });

  it('keeps the current provider store intact when data already exists', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'lawclaw-provider-store-'));
    tempDirs.push(rootDir);

    electronState.userData = join(rootDir, 'LawClaw');
    mkdirSync(electronState.userData, { recursive: true });
    storeState.initial = {
      providers: {
        'provider-current': {
          id: 'provider-current',
          name: 'Current Provider',
          type: 'openai',
          model: 'gpt-5.4',
          enabled: true,
          createdAt: '2026-04-02T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      },
      apiKeys: {
        'provider-current': 'sk-current',
      },
      defaultProvider: 'provider-current',
    };

    writeLegacyStoreFile(rootDir, 'OpenClaw', 'clawx-providers.json', {
      providers: {
        'provider-legacy': {
          id: 'provider-legacy',
          name: 'Legacy Provider',
          type: 'jurismind',
          enabled: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      },
      apiKeys: {
        'provider-legacy': 'sk-legacy',
      },
      defaultProvider: 'provider-legacy',
    });

    const mod = await loadSecureStorage();

    expect(await mod.getDefaultProvider()).toBe('provider-current');
    expect(await mod.getApiKey('provider-current')).toBe('sk-current');
    expect(await mod.getProvider('provider-current')).toMatchObject({
      id: 'provider-current',
      type: 'openai',
    });
    expect(await mod.getProvider('provider-legacy')).toBeNull();
  });
});
