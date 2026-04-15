import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/userData'),
    getName: vi.fn(() => 'LawClaw'),
  },
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  ChildProcess: class {},
  default: {
    spawn: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  default: {
    existsSync: vi.fn(() => true),
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
  getResourcesDir: vi.fn(() => '/tmp/resources'),
  isOpenClawBuilt: vi.fn(() => true),
  isOpenClawPresent: vi.fn(() => true),
  appendNodeRequireToNodeOptions: vi.fn((value?: string) => value ?? ''),
  quoteForCmd: vi.fn((value: string) => value),
}));

vi.mock('@electron/utils/store', () => ({
  getSetting: vi.fn(async () => 'gw-token'),
}));

vi.mock('@electron/utils/secure-storage', () => ({
  getAllProviders: vi.fn(async () => []),
  getApiKey: vi.fn(async () => null),
  getDefaultProvider: vi.fn(async () => undefined),
  getProvider: vi.fn(async () => null),
}));

vi.mock('@electron/utils/provider-registry', () => ({
  getProviderEnvVar: vi.fn(() => undefined),
  getKeyableProviderTypes: vi.fn(() => []),
}));

vi.mock('@electron/utils/openclaw-auth', () => ({
  sanitizeOpenClawConfig: vi.fn(() => false),
  syncBrowserConfigToOpenClaw: vi.fn(async () => undefined),
  syncGatewayTokenToConfig: vi.fn(async () => undefined),
  syncJurismindWebSearchConfig: vi.fn(),
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

vi.mock('@electron/utils/bundled-runtime', () => ({
  applyBundledRuntimeToEnv: vi.fn((env: NodeJS.ProcessEnv) => env),
  getBundledRuntimePathEntries: vi.fn(() => []),
}));

vi.mock('@electron/utils/uv-env', () => ({
  getUvMirrorEnv: vi.fn(async () => ({})),
}));

vi.mock('@electron/utils/uv-setup', () => ({
  isPythonReady: vi.fn(async () => true),
  setupManagedPython: vi.fn(async () => true),
}));

vi.mock('@electron/utils/openclaw-cli', () => ({
  applyBundledNpmToCliEnv: vi.fn((env: NodeJS.ProcessEnv) => env),
  getNodeExecForCli: vi.fn(() => 'node'),
}));

vi.mock('@electron/utils/device-identity', () => ({
  loadOrCreateDeviceIdentity: vi.fn(async () => ({ deviceId: 'dev-1', privateKeyPem: '', publicKeyPem: '' })),
  signDevicePayload: vi.fn(() => 'sig'),
  publicKeyRawBase64UrlFromPem: vi.fn(() => 'pub'),
  buildDeviceAuthPayload: vi.fn(() => ({})),
}));

vi.mock('@electron/utils/feishu-official-plugin-installer', () => ({
  repairInstalledFeishuOfficialPluginIfNeeded: vi.fn(async () => ({
    repaired: false,
    reason: 'healthy',
    pluginDir: '/tmp/.openclaw/extensions/openclaw-lark',
  })),
}));

vi.mock('@electron/utils/openclaw-config-env', () => ({
  applyOpenClawConfigEnvFallbacks: vi.fn((content: string) => content),
}));

vi.mock('@electron/utils/text-encoding', () => ({
  stripUtf8Bom: vi.fn((value: string) => value),
}));

vi.mock('@electron/utils/weixin-plugin-installer', () => ({
  repairInstalledWeixinPluginIfNeeded: vi.fn(async () => ({
    repaired: false,
    reason: 'healthy',
    pluginDir: '/tmp/.openclaw/extensions/openclaw-weixin',
  })),
}));

vi.mock('@electron/utils/openclaw-plugin-install', () => ({
  cleanupStalePluginInstallStageDirs: vi.fn(() => []),
}));

vi.mock('@electron/gateway/runtime-selection', () => ({
  selectGatewayRuntime: vi.fn(() => ({
    command: 'node',
    mode: 'dev-built',
    useElectronRunAsNode: false,
  })),
}));

vi.mock('@electron/gateway/startup-recovery', () => ({
  getGatewayStartupRecoveryAction: vi.fn(() => 'fail'),
}));

vi.mock('@electron/gateway/ws-client', () => ({
  probeGatewayReady: vi.fn(),
  waitForGatewayReady: vi.fn(async () => undefined),
}));

describe('GatewayManager deferred restart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not stop the gateway immediately when restart is requested during startup', async () => {
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();

    const stopSpy = vi.spyOn(manager, 'stop').mockResolvedValue(undefined);
    const startSpy = vi.spyOn(manager, 'start').mockResolvedValue(undefined);

    (manager as unknown as { startLock: boolean }).startLock = true;
    (manager as unknown as { status: { state: 'starting'; port: number } }).status = {
      state: 'starting',
      port: 4317,
    };

    await manager.restart();
    expect(stopSpy).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();

    (manager as unknown as { startLock: boolean }).startLock = false;
    (manager as unknown as { status: { state: 'running'; port: number } }).status = {
      state: 'running',
      port: 4317,
    };
    (manager as unknown as { flushDeferredRestart: (trigger: string) => void }).flushDeferredRestart('test');
    await Promise.resolve();

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledTimes(1);
  });
});
