import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  clearJurismindMultimodalConfig: vi.fn(() => false),
  sanitizeOpenClawConfig: vi.fn(() => false),
  spawn: vi.fn(),
  syncGatewayTokenToConfig: vi.fn(),
  syncBrowserConfigToOpenClaw: vi.fn(),
  syncJurismindMultimodalConfig: vi.fn(),
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

const pluginRepairMocks = vi.hoisted(() => ({
  repairInstalledFeishuOfficialPluginIfNeeded: vi.fn(async () => ({
    repaired: false,
    reason: 'healthy',
    pluginDir: '/tmp/.openclaw/extensions/openclaw-lark',
    missingPaths: [],
  })),
  repairInstalledWeixinPluginIfNeeded: vi.fn(async () => ({
    repaired: false,
    reason: 'healthy',
    pluginDir: '/tmp/.openclaw/extensions/openclaw-weixin',
    missingPaths: [],
  })),
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
  clearJurismindMultimodalConfig: runtimeMocks.clearJurismindMultimodalConfig,
  sanitizeOpenClawConfig: runtimeMocks.sanitizeOpenClawConfig,
  syncGatewayTokenToConfig: runtimeMocks.syncGatewayTokenToConfig,
  syncBrowserConfigToOpenClaw: runtimeMocks.syncBrowserConfigToOpenClaw,
  syncJurismindMultimodalConfig: runtimeMocks.syncJurismindMultimodalConfig,
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
  cleanupStalePluginInstallStageDirs: vi.fn(() => []),
  ensureHostOpenClawPackageLink: vi.fn(() => ({
    changed: false,
    linkPath: '/tmp/.openclaw/node_modules/openclaw',
  })),
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

vi.mock('@electron/utils/feishu-official-plugin-installer', () => ({
  repairInstalledFeishuOfficialPluginIfNeeded: pluginRepairMocks.repairInstalledFeishuOfficialPluginIfNeeded,
}));

vi.mock('@electron/utils/weixin-plugin-installer', () => ({
  repairInstalledWeixinPluginIfNeeded: pluginRepairMocks.repairInstalledWeixinPluginIfNeeded,
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
    runtimeMocks.sanitizeOpenClawConfig.mockReturnValue(false);
    runtimeMocks.syncGatewayTokenToConfig.mockResolvedValue(undefined);
    runtimeMocks.syncBrowserConfigToOpenClaw.mockResolvedValue(undefined);
    runtimeMocks.clearJurismindMultimodalConfig.mockImplementation(() => false);
    runtimeMocks.syncJurismindMultimodalConfig.mockImplementation(() => undefined);
    secureStorageMocks.getApiKey.mockResolvedValue(null);
    secureStorageMocks.getDefaultProvider.mockResolvedValue(undefined);
    secureStorageMocks.getProvider.mockResolvedValue(null);
    secureStorageMocks.getAllProviders.mockResolvedValue([]);
    providerRegistryMocks.getProviderEnvVar.mockImplementation((providerType: string) => {
      if (providerType === 'jurismind') return 'JURISMIND_API_KEY';
      return undefined;
    });
    providerRegistryMocks.getKeyableProviderTypes.mockReturnValue(['jurismind']);
    pluginRepairMocks.repairInstalledFeishuOfficialPluginIfNeeded.mockResolvedValue({
      repaired: false,
      reason: 'healthy',
      pluginDir: '/tmp/.openclaw/extensions/openclaw-lark',
      missingPaths: [],
    });
    pluginRepairMocks.repairInstalledWeixinPluginIfNeeded.mockResolvedValue({
      repaired: false,
      reason: 'healthy',
      pluginDir: '/tmp/.openclaw/extensions/openclaw-weixin',
      missingPaths: [],
    });
  });

  it('syncs token and browser config before spawning gateway', async () => {
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    (manager as unknown as { status: { state: string; port: number } }).status = {
      state: 'starting',
      port: 4317,
    };

    await (manager as unknown as { startProcess: () => Promise<void> }).startProcess();

    expect(runtimeMocks.sanitizeOpenClawConfig).toHaveBeenCalledTimes(1);
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
    secureStorageMocks.getDefaultProvider.mockResolvedValue('provider-jurismind');
    secureStorageMocks.getProvider.mockResolvedValue({
      id: 'provider-jurismind',
      type: 'jurismind',
    });

    await (manager as unknown as { startProcess: () => Promise<void> }).startProcess();

    const firstSpawnOptions = runtimeMocks.spawn.mock.calls[0][2] as { env: Record<string, string> };
    expect(firstSpawnOptions.env.JURISMIND_API_KEY).toBe('jm-live-key');
    expect(runtimeMocks.syncJurismindMultimodalConfig).toHaveBeenCalledWith('jm-live-key');

    runtimeMocks.spawn.mockClear();
    runtimeMocks.syncJurismindMultimodalConfig.mockClear();
    runtimeMocks.clearJurismindMultimodalConfig.mockClear();
    secureStorageMocks.getApiKey.mockResolvedValue(null);

    await (manager as unknown as { startProcess: () => Promise<void> }).startProcess();

    const secondSpawnOptions = runtimeMocks.spawn.mock.calls[0][2] as { env: Record<string, string> };
    expect(secondSpawnOptions.env.JURISMIND_API_KEY).toBe('__CLAWX_PLACEHOLDER_JURISMIND_API_KEY__');
    expect(runtimeMocks.syncJurismindMultimodalConfig).not.toHaveBeenCalled();
    expect(runtimeMocks.clearJurismindMultimodalConfig).toHaveBeenCalledTimes(1);
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

  it('defers reconnect startup when another start flow is already in progress', async () => {
    vi.useFakeTimers();

    try {
      const { GatewayManager } = await import('@electron/gateway/manager');
      const manager = new GatewayManager({
        baseDelay: 10,
        maxDelay: 20,
      });

      (manager as unknown as { status: { state: string; port: number } }).status = {
        state: 'stopped',
        port: 4317,
      };

      const findExistingGateway = vi.fn(async () => null);
      const startProcess = vi.fn(async () => undefined);
      const waitForReady = vi.fn(async () => undefined);
      const connect = vi.fn(async () => undefined);
      const startHealthCheck = vi.fn();

      (manager as unknown as { findExistingGateway: () => Promise<null> }).findExistingGateway = findExistingGateway;
      (manager as unknown as { startProcess: () => Promise<void> }).startProcess = startProcess;
      (manager as unknown as { waitForReady: () => Promise<void> }).waitForReady = waitForReady;
      (manager as unknown as { connect: () => Promise<void> }).connect = connect;
      (manager as unknown as { startHealthCheck: () => void }).startHealthCheck = startHealthCheck;
      (manager as unknown as { startLock: boolean }).startLock = true;

      (manager as unknown as { scheduleReconnect: () => void }).scheduleReconnect();

      await vi.advanceTimersByTimeAsync(10);
      expect(startProcess).not.toHaveBeenCalled();

      (manager as unknown as { startLock: boolean }).startLock = false;
      await vi.advanceTimersByTimeAsync(20);

      expect(findExistingGateway).toHaveBeenCalledTimes(1);
      expect(startProcess).toHaveBeenCalledTimes(1);
      expect(waitForReady).toHaveBeenCalledTimes(1);
      expect(connect).toHaveBeenCalledTimes(1);
      expect(startHealthCheck).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects oversized RPC payloads before sending them over WebSocket', async () => {
    const previousLimit = process.env.LAWCLAW_GATEWAY_RPC_MAX_PAYLOAD_BYTES;
    process.env.LAWCLAW_GATEWAY_RPC_MAX_PAYLOAD_BYTES = '256';

    try {
      const { GatewayManager } = await import('@electron/gateway/manager');
      const manager = new GatewayManager();
      const send = vi.fn();
      (manager as unknown as { ws: { readyState: number; send: typeof send } }).ws = {
        readyState: 1,
        send,
      };

      await expect(
        manager.rpc('agent', { message: 'x'.repeat(1024) }, 30000),
      ).rejects.toThrow(/Gateway RPC payload is too large/);
      expect(send).not.toHaveBeenCalled();
    } finally {
      if (previousLimit === undefined) {
        delete process.env.LAWCLAW_GATEWAY_RPC_MAX_PAYLOAD_BYTES;
      } else {
        process.env.LAWCLAW_GATEWAY_RPC_MAX_PAYLOAD_BYTES = previousLimit;
      }
    }
  });

  it('rejects pending RPC requests immediately when the Gateway socket fails', async () => {
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    const send = vi.fn();
    const managerInternals = manager as unknown as {
      ws: { readyState: number; send: typeof send };
      rejectPendingRequests: (error: Error) => void;
    };
    managerInternals.ws = {
      readyState: 1,
      send,
    };

    const pending = manager.rpc('chat.send', { message: 'hello' }, 30000);
    expect(send).toHaveBeenCalledTimes(1);

    managerInternals.rejectPendingRequests(
      new Error('Gateway WebSocket payload is too large. Reduce PDF pages/attachments.'),
    );

    await expect(pending).rejects.toThrow(/payload is too large/);
  });
});
