import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  syncGatewayTokenToConfig: vi.fn(),
  syncBrowserConfigToOpenClaw: vi.fn(),
  syncJurismindWebSearchConfig: vi.fn(),
}));

const secureStorageMocks = vi.hoisted(() => ({
  getApiKey: vi.fn(async () => null),
  getDefaultProvider: vi.fn(async () => undefined),
  getProvider: vi.fn(async () => null),
  getAllProviders: vi.fn(async () => []),
}));

const providerRegistryMocks = vi.hoisted(() => ({
  getProviderEnvVar: vi.fn(() => undefined),
  getKeyableProviderTypes: vi.fn(() => []),
}));

const electronMocks = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/userData'),
    getName: vi.fn(() => 'LawClaw'),
  },
}));

vi.mock('electron', () => ({
  app: electronMocks.app,
}));

vi.mock('child_process', () => ({
  spawn: runtimeMocks.spawn,
  ChildProcess: class {},
  default: {
    spawn: runtimeMocks.spawn,
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn((target: string) => {
    if (target.includes('openclaw.json')) return false;
    if (target.includes('openrouter-headers-preload')) return false;
    return true;
  }),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  default: {
    existsSync: vi.fn((target: string) => {
      if (target.includes('openclaw.json')) return false;
      if (target.includes('openrouter-headers-preload')) return false;
      return true;
    }),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
  },
}));

vi.mock('@electron/utils/config', () => ({
  PORTS: { OPENCLAW_GATEWAY: 4317 },
}));

vi.mock('@electron/utils/paths', () => ({
  getOpenClawConfigDir: vi.fn(() => '/tmp/.openclaw'),
  getOpenClawDir: vi.fn(() => '/tmp/openclaw'),
  getOpenClawEntryPath: vi.fn(() => '/tmp/openclaw/entry.js'),
  isOpenClawBuilt: vi.fn(() => true),
  isOpenClawPresent: vi.fn(() => true),
  appendNodeRequireToNodeOptions: vi.fn((current: string | undefined) => current ?? ''),
  quoteForCmd: vi.fn((value: string) => value),
}));

vi.mock('@electron/utils/store', () => ({
  getSetting: vi.fn(async (key: string) => (key === 'gatewayToken' ? 'gw-token' : undefined)),
}));

vi.mock('@electron/utils/secure-storage', () => ({
  getApiKey: secureStorageMocks.getApiKey,
  getDefaultProvider: secureStorageMocks.getDefaultProvider,
  getProvider: secureStorageMocks.getProvider,
  getAllProviders: secureStorageMocks.getAllProviders,
}));

vi.mock('@electron/utils/provider-registry', () => ({
  getProviderEnvVar: providerRegistryMocks.getProviderEnvVar,
  getKeyableProviderTypes: providerRegistryMocks.getKeyableProviderTypes,
}));

vi.mock('@electron/utils/openclaw-auth', () => ({
  syncGatewayTokenToConfig: runtimeMocks.syncGatewayTokenToConfig,
  syncBrowserConfigToOpenClaw: runtimeMocks.syncBrowserConfigToOpenClaw,
  syncJurismindWebSearchConfig: runtimeMocks.syncJurismindWebSearchConfig,
}));

vi.mock('@electron/gateway/protocol', () => ({
  GatewayEventType: {},
  isNotification: vi.fn(() => false),
  isResponse: vi.fn(() => false),
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@electron/utils/uv-env', () => ({
  getUvMirrorEnv: vi.fn(async () => ({})),
}));

vi.mock('@electron/utils/uv-setup', () => ({
  isPythonReady: vi.fn(async () => true),
  setupManagedPython: vi.fn(async () => true),
}));

vi.mock('@electron/utils/openclaw-plugin-install', () => ({
  detectPluginInstallationState: vi.fn(() => ({ installed: true })),
  savePluginChannelConfigBackup: vi.fn(),
  stripPluginChannelConfigForStartup: vi.fn((config: Record<string, unknown>) => ({
    config,
    removedChannelConfig: undefined,
  })),
}));

vi.mock('@electron/utils/device-identity', () => ({
  loadOrCreateDeviceIdentity: vi.fn(async () => ({ deviceId: 'dev-1', privateKeyPem: '', publicKeyPem: '' })),
  signDevicePayload: vi.fn(async () => 'sig'),
  publicKeyRawBase64UrlFromPem: vi.fn(() => 'pub'),
  buildDeviceAuthPayload: vi.fn(() => ({})),
}));

vi.mock('@electron/gateway/runtime-selection', () => ({
  selectGatewayRuntime: vi.fn(() => ({
    command: 'node',
    mode: 'dev-built',
    useElectronRunAsNode: false,
  })),
}));

function createFakeChildProcess(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: ReturnType<typeof vi.fn>;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 9876;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn();
  return child;
}

describe('gateway start pre-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMocks.app.isPackaged = false;
    runtimeMocks.spawn.mockImplementation(() => createFakeChildProcess());
    runtimeMocks.syncGatewayTokenToConfig.mockResolvedValue(undefined);
    runtimeMocks.syncBrowserConfigToOpenClaw.mockResolvedValue(undefined);
    runtimeMocks.syncJurismindWebSearchConfig.mockImplementation(() => undefined);
    secureStorageMocks.getApiKey.mockResolvedValue(null);
    secureStorageMocks.getDefaultProvider.mockResolvedValue(undefined);
    secureStorageMocks.getProvider.mockResolvedValue(null);
    secureStorageMocks.getAllProviders.mockResolvedValue([]);
    providerRegistryMocks.getProviderEnvVar.mockImplementation((providerType: string) => {
      if (providerType === 'jurismind') return 'JURISMIND_API_KEY';
      return undefined;
    });
    providerRegistryMocks.getKeyableProviderTypes.mockReturnValue(['jurismind']);
  });

  it('syncs token and browser config before spawning gateway', async () => {
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    (manager as unknown as { status: { state: string; port: number } }).status = {
      state: 'starting',
      port: 4317,
    };

    await (manager as unknown as { startProcess: () => Promise<void> }).startProcess();

    expect(runtimeMocks.syncGatewayTokenToConfig).toHaveBeenCalledWith('gw-token');
    expect(runtimeMocks.syncBrowserConfigToOpenClaw).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('injects type env var from provider instance key, and falls back to placeholder when missing', async () => {
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    (manager as unknown as { status: { state: string; port: number } }).status = {
      state: 'starting',
      port: 4317,
    };

    secureStorageMocks.getAllProviders.mockResolvedValue([
      {
        id: 'provider-jurismind',
        type: 'jurismind',
      },
    ]);
    secureStorageMocks.getApiKey.mockImplementation(async (providerId: string) => {
      if (providerId === 'provider-jurismind') return 'jm-live-key';
      return null;
    });

    await (manager as unknown as { startProcess: () => Promise<void> }).startProcess();

    const firstSpawnOptions = runtimeMocks.spawn.mock.calls[0][2] as { env: Record<string, string> };
    expect(firstSpawnOptions.env.JURISMIND_API_KEY).toBe('jm-live-key');
    expect(runtimeMocks.syncJurismindWebSearchConfig).toHaveBeenCalledWith('jm-live-key');

    runtimeMocks.spawn.mockClear();
    runtimeMocks.syncJurismindWebSearchConfig.mockClear();
    secureStorageMocks.getApiKey.mockResolvedValue(null);

    await (manager as unknown as { startProcess: () => Promise<void> }).startProcess();

    const secondSpawnOptions = runtimeMocks.spawn.mock.calls[0][2] as { env: Record<string, string> };
    expect(secondSpawnOptions.env.JURISMIND_API_KEY).toBe('__CLAWX_PLACEHOLDER_JURISMIND_API_KEY__');
    expect(runtimeMocks.syncJurismindWebSearchConfig).not.toHaveBeenCalled();
  });

  it('prepends the packaged runtime bridge only to the gateway child environment', async () => {
    const previousPath = process.env.PATH;
    const previousResourcesPath = process.resourcesPath;
    process.env.PATH = '/usr/bin:/bin';
    Object.defineProperty(process, 'resourcesPath', {
      value: '/Applications/LawClaw.app/Contents/Resources',
      configurable: true,
    });
    electronMocks.app.isPackaged = true;

    try {
      const { GatewayManager } = await import('@electron/gateway/manager');
      const manager = new GatewayManager();
      (manager as unknown as { status: { state: string; port: number } }).status = {
        state: 'starting',
        port: 4317,
      };

      await (manager as unknown as { startProcess: () => Promise<void> }).startProcess();

      const spawnOptions = runtimeMocks.spawn.mock.calls[0][2] as { env: Record<string, string> };
      expect(spawnOptions.env.PATH).toBe(
        '/Applications/LawClaw.app/Contents/Resources/runtime-bridge'
        + ':/Applications/LawClaw.app/Contents/Resources/bin:/usr/bin:/bin'
      );
      expect(spawnOptions.env.LAWCLAW_BUNDLED_UV_EXE)
        .toBe('/Applications/LawClaw.app/Contents/Resources/bin/uv');
      expect(spawnOptions.env.LAWCLAW_BUNDLED_NPM_CLI_JS)
        .toBe('/Applications/LawClaw.app/Contents/Resources/npm-runtime/node_modules/npm/bin/npm-cli.js');
      expect(spawnOptions.env.LAWCLAW_BUNDLED_NPX_CLI_JS)
        .toBe('/Applications/LawClaw.app/Contents/Resources/npm-runtime/node_modules/npm/bin/npx-cli.js');
      expect(spawnOptions.env.LAWCLAW_BUNDLED_NODE_EXE).toContain('LawClaw Helper.app');
      expect(process.env.PATH).toBe('/usr/bin:/bin');
    } finally {
      process.env.PATH = previousPath;
      Object.defineProperty(process, 'resourcesPath', {
        value: previousResourcesPath,
        configurable: true,
      });
      electronMocks.app.isPackaged = false;
    }
  });
});
