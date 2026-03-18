import { beforeEach, describe, expect, it, vi } from 'vitest';

const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>();

const secureStorageMock = vi.hoisted(() => ({
  storeApiKey: vi.fn(),
  getApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  hasApiKey: vi.fn(),
  saveProvider: vi.fn(),
  getProvider: vi.fn(),
  deleteProvider: vi.fn(),
  setDefaultProvider: vi.fn(),
  getDefaultProvider: vi.fn(),
  getAllProvidersWithKeyInfo: vi.fn(),
  getAllProviders: vi.fn(),
  clearDefaultProvider: vi.fn(),
}));

const openclawAuthMock = vi.hoisted(() => ({
  clearJurismindWebSearchConfig: vi.fn(),
  saveProviderKeyToOpenClaw: vi.fn(),
  removeProviderKeyFromOpenClaw: vi.fn(),
  removeProviderFromOpenClaw: vi.fn(),
  setOpenClawDefaultModel: vi.fn(),
  setOpenClawDefaultModelWithOverride: vi.fn(),
  setOpenClawAgentModel: vi.fn(),
  setOpenClawAgentModelWithOverride: vi.fn(),
  syncJurismindWebSearchConfig: vi.fn(),
  syncProviderConfigToOpenClaw: vi.fn(),
  updateAgentModelProvider: vi.fn(),
  clearOpenClawAgentModelPrimary: vi.fn(),
  getOAuthTokenFromOpenClaw: vi.fn(),
  getOpenClawAgentModelPrimary: vi.fn(),
}));

const providerValidationMock = vi.hoisted(() => ({
  validateApiKeyWithProvider: vi.fn(async () => ({ valid: true })),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers.set(channel, handler);
    }),
    on: vi.fn(),
  },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn(), openPath: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), showMessageBox: vi.fn() },
  app: {
    getVersion: vi.fn(() => '0.0.0-test'),
    getName: vi.fn(() => 'LawClaw'),
    getPath: vi.fn(() => ''),
    quit: vi.fn(),
    relaunch: vi.fn(),
    isPackaged: false,
  },
  nativeImage: { createFromPath: vi.fn(() => ({})) },
}));

vi.mock('@electron/utils/secure-storage', () => secureStorageMock);

vi.mock('@electron/utils/openclaw-auth', () => openclawAuthMock);

vi.mock('@electron/utils/provider-registry', () => ({
  getProviderConfig: vi.fn((type: string) => {
    if (type === 'openai') {
      return {
        baseUrl: 'https://api.openai.com/v1',
        api: 'openai-responses',
        apiKeyEnv: 'OPENAI_API_KEY',
      };
    }
    if (type === 'jurismind') {
      return {
        baseUrl: 'http://101.132.245.215:3001/v1',
        api: 'openai-completions',
        apiKeyEnv: 'JURISMIND_API_KEY',
      };
    }
    return undefined;
  }),
  getProviderDefaultModel: vi.fn((type: string) => {
    if (type === 'openai') return 'openai/gpt-5.2';
    if (type === 'jurismind') return 'jurismind/jurismind';
    if (type === 'moonshot') return 'moonshot/kimi-k2.5';
    return undefined;
  }),
  getProviderEnvVar: vi.fn((type: string) => (type === 'openai' ? 'OPENAI_API_KEY' : undefined)),
}));

vi.mock('@electron/utils/store', () => ({
  getSetting: vi.fn(async () => []),
  setSetting: vi.fn(async () => undefined),
}));

vi.mock('@electron/utils/channel-config', () => ({
  saveChannelConfig: vi.fn(async () => undefined),
  getChannelConfig: vi.fn(async () => ({})),
  getChannelFormValues: vi.fn(async () => ({})),
  deleteChannelConfig: vi.fn(async () => undefined),
  listConfiguredChannels: vi.fn(async () => []),
  setChannelEnabled: vi.fn(async () => undefined),
  validateChannelConfig: vi.fn(async () => ({ valid: true })),
  validateChannelCredentials: vi.fn(async () => ({ valid: true })),
  enforceLawClawChannelBinding: vi.fn(async () => false),
  clearLawClawChannelBinding: vi.fn(async () => false),
}));

vi.mock('@electron/utils/openclaw-cli', () => ({
  getOpenClawCliCommand: vi.fn(() => 'openclaw'),
}));

vi.mock('@electron/utils/paths', () => ({
  getOpenClawStatus: vi.fn(() => ({ packageExists: true, entryPath: '/tmp/openclaw.js', dir: '/tmp' })),
  getOpenClawDir: vi.fn(() => '/tmp'),
  getOpenClawConfigDir: vi.fn(() => '/tmp/.openclaw'),
  getOpenClawSkillsDir: vi.fn(() => '/tmp/.openclaw/skills'),
  getResourcesDir: vi.fn(() => '/tmp/resources'),
  ensureDir: vi.fn(),
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    readLogFile: vi.fn(async () => ''),
    getLogFilePath: vi.fn(() => '/tmp/app.log'),
    listLogFiles: vi.fn(async () => []),
  },
}));

vi.mock('@electron/utils/uv-setup', () => ({
  checkUvInstalled: vi.fn(async () => true),
  installUv: vi.fn(async () => true),
  setupManagedPython: vi.fn(async () => true),
}));

vi.mock('@electron/utils/skill-config', () => ({
  updateSkillConfig: vi.fn(async () => ({})),
  getSkillConfig: vi.fn(async () => ({})),
  getAllSkillConfigs: vi.fn(async () => ({})),
}));

vi.mock('@electron/utils/whatsapp-login', () => ({
  whatsAppLoginManager: {
    on: vi.fn(),
    requestQr: vi.fn(async () => ({})),
    cancelQr: vi.fn(async () => undefined),
  },
}));

vi.mock('@electron/utils/provider-validation', () => providerValidationMock);

vi.mock('@electron/utils/openclaw-config-env', () => ({
  applyOpenClawConfigEnvFallbacks: vi.fn((raw: string, env: Record<string, string>) => env),
}));

vi.mock('@electron/utils/openclaw-plugin-install', () => ({
  detectPluginInstallationState: vi.fn(() => ({ installed: false })),
  clearPluginChannelConfigBackup: vi.fn(),
  isAlreadyInstalledErrorMessage: vi.fn(() => false),
  readPluginChannelConfigBackup: vi.fn(() => undefined),
  restorePluginChannelConfigAfterInstall: vi.fn((config: Record<string, unknown>) => config),
  savePluginChannelConfigBackup: vi.fn(),
  sanitizePluginPackageManifestForLocalInstall: vi.fn(),
  stripPluginChannelConfigForInstall: vi.fn((config: Record<string, unknown>) => ({
    config,
    removedChannelConfig: undefined,
  })),
}));

vi.mock('@electron/main/index', () => ({
  forceSetup: false,
}));

vi.mock('@electron/utils/agent-preset-migration', () => ({
  getAgentPresetMigrationArtifactsDir: vi.fn(async () => '/tmp'),
  getAgentPresetMigrationStatus: vi.fn(async () => ({})),
  onAgentPresetMigrationStatus: vi.fn(),
}));

vi.mock('@electron/utils/lawclaw-session', () => ({
  filterLawClawSessions: vi.fn((result: unknown) => result),
  normalizeLawClawSessionKey: vi.fn((sessionKey: string) => sessionKey),
  normalizeSessionKeyParam: vi.fn((params: unknown) => params),
}));

vi.mock('@electron/utils/device-oauth', () => ({
  deviceOAuthManager: {
    setWindow: vi.fn(),
    startFlow: vi.fn(async () => undefined),
    stopFlow: vi.fn(async () => undefined),
    on: vi.fn(),
  },
}));

describe('provider:updateWithKey keeps default update scoped to lawclaw-main', () => {
  beforeEach(() => {
    registeredHandlers.clear();
    vi.clearAllMocks();
    openclawAuthMock.getOpenClawAgentModelPrimary.mockReturnValue(undefined);
  });

  it('updates only lawclaw-main model when editing the current default provider', async () => {
    const providersById = new Map<string, Record<string, unknown>>([
      ['provider-openai', {
        id: 'provider-openai',
        name: 'OpenAI',
        type: 'openai',
        model: 'gpt-4o',
        enabled: true,
        createdAt: '2026-02-28T00:00:00.000Z',
        updatedAt: '2026-02-28T00:00:00.000Z',
      }],
    ]);
    secureStorageMock.getProvider.mockImplementation(async (providerId: string) =>
      providersById.get(providerId) ?? null
    );
    secureStorageMock.getDefaultProvider.mockResolvedValue('provider-openai');
    secureStorageMock.getApiKey.mockResolvedValue('sk-live');
    openclawAuthMock.getOpenClawAgentModelPrimary.mockReturnValue('openai/gpt-4o');
    secureStorageMock.saveProvider.mockImplementation(async (config: Record<string, unknown>) => {
      providersById.set(String(config.id), config);
    });
    secureStorageMock.storeApiKey.mockResolvedValue(undefined);
    secureStorageMock.deleteApiKey.mockResolvedValue(undefined);

    const { registerIpcHandlers } = await import('@electron/main/ipc-handlers');
    const gatewayManager = {
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      debouncedRestart: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'running', port: 3456 })),
      rpc: vi.fn(async () => ({})),
      isConnected: vi.fn(() => true),
      getControlUiInfo: vi.fn(() => ({ success: false })),
      setAutoStart: vi.fn(async () => undefined),
    };
    const mainWindow = { webContents: { send: vi.fn() } };
    const marketService = {
      search: vi.fn(async () => []),
      install: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
      listInstalled: vi.fn(async () => []),
      openSkillReadme: vi.fn(async () => undefined),
      openSkillPage: vi.fn(async () => undefined),
    };

    registerIpcHandlers(
      gatewayManager as never,
      marketService as never,
      marketService as never,
      mainWindow as never
    );

    const handler = registeredHandlers.get('provider:updateWithKey');
    expect(handler).toBeTypeOf('function');

    const result = await handler?.(
      {},
      'provider-openai',
      { model: 'gpt-4.1' },
      undefined
    ) as { success: boolean; error?: string };

    expect(result.success).toBe(true);
    expect(openclawAuthMock.setOpenClawAgentModel).toHaveBeenCalledWith(
      'lawclaw-main',
      'openai',
      'openai/gpt-4.1'
    );
    expect(openclawAuthMock.setOpenClawDefaultModel).not.toHaveBeenCalled();
    expect(openclawAuthMock.setOpenClawDefaultModelWithOverride).not.toHaveBeenCalled();
    expect(openclawAuthMock.setOpenClawAgentModelWithOverride).not.toHaveBeenCalled();
  });

  it('preserves a user-customized model when editing the current default provider', async () => {
    const providersById = new Map<string, Record<string, unknown>>([
      ['provider-openai', {
        id: 'provider-openai',
        name: 'OpenAI',
        type: 'openai',
        model: 'gpt-4o',
        enabled: true,
        createdAt: '2026-02-28T00:00:00.000Z',
        updatedAt: '2026-02-28T00:00:00.000Z',
      }],
    ]);
    secureStorageMock.getProvider.mockImplementation(async (providerId: string) =>
      providersById.get(providerId) ?? null
    );
    secureStorageMock.getDefaultProvider.mockResolvedValue('provider-openai');
    secureStorageMock.getApiKey.mockResolvedValue('sk-live');
    openclawAuthMock.getOpenClawAgentModelPrimary.mockReturnValue('google/gemini-3.1-pro-preview');
    secureStorageMock.saveProvider.mockImplementation(async (config: Record<string, unknown>) => {
      providersById.set(String(config.id), config);
    });
    secureStorageMock.storeApiKey.mockResolvedValue(undefined);
    secureStorageMock.deleteApiKey.mockResolvedValue(undefined);

    const { registerIpcHandlers } = await import('@electron/main/ipc-handlers');
    const gatewayManager = {
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      debouncedRestart: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'running', port: 3456 })),
      rpc: vi.fn(async () => ({})),
      isConnected: vi.fn(() => true),
      getControlUiInfo: vi.fn(() => ({ success: false })),
      setAutoStart: vi.fn(async () => undefined),
    };
    const mainWindow = { webContents: { send: vi.fn() } };
    const marketService = {
      search: vi.fn(async () => []),
      install: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
      listInstalled: vi.fn(async () => []),
      openSkillReadme: vi.fn(async () => undefined),
      openSkillPage: vi.fn(async () => undefined),
    };

    registerIpcHandlers(
      gatewayManager as never,
      marketService as never,
      marketService as never,
      mainWindow as never
    );

    const handler = registeredHandlers.get('provider:updateWithKey');
    expect(handler).toBeTypeOf('function');

    const result = await handler?.(
      {},
      'provider-openai',
      { model: 'gpt-4.1' },
      undefined
    ) as { success: boolean; error?: string };

    expect(result.success).toBe(true);
    expect(openclawAuthMock.setOpenClawAgentModel).not.toHaveBeenCalled();
  });
});

describe('provider:validateKey resolves baseUrl for built-in providers', () => {
  beforeEach(() => {
    registeredHandlers.clear();
    vi.clearAllMocks();
  });

  it('uses registry baseUrl when caller omits baseUrl even if stored provider has stale baseUrl', async () => {
    secureStorageMock.getProvider.mockResolvedValue({
      id: 'jurismind',
      name: 'Jurismind',
      type: 'jurismind',
      baseUrl: 'http://101.132.245.215:3001',
      enabled: true,
      createdAt: '2026-02-28T00:00:00.000Z',
      updatedAt: '2026-02-28T00:00:00.000Z',
    });

    const { registerIpcHandlers } = await import('@electron/main/ipc-handlers');

    const gatewayManager = {
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      debouncedRestart: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'running', port: 3456 })),
      rpc: vi.fn(async () => ({})),
      isConnected: vi.fn(() => true),
      getControlUiInfo: vi.fn(() => ({ success: false })),
      setAutoStart: vi.fn(async () => undefined),
    };
    const mainWindow = { webContents: { send: vi.fn() } };
    const marketService = {
      search: vi.fn(async () => []),
      install: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
      listInstalled: vi.fn(async () => []),
      openSkillReadme: vi.fn(async () => undefined),
      openSkillPage: vi.fn(async () => undefined),
    };

    registerIpcHandlers(
      gatewayManager as never,
      marketService as never,
      marketService as never,
      mainWindow as never
    );

    const handler = registeredHandlers.get('provider:validateKey');
    expect(handler).toBeTypeOf('function');

    await handler?.({}, 'jurismind', 'sk-live') as { valid: boolean; error?: string };

    expect(providerValidationMock.validateApiKeyWithProvider).toHaveBeenCalledWith(
      'jurismind',
      'sk-live',
      { baseUrl: 'http://101.132.245.215:3001/v1' }
    );
  });
});

describe('jurismind web search sync', () => {
  beforeEach(() => {
    registeredHandlers.clear();
    vi.clearAllMocks();
    openclawAuthMock.getOpenClawAgentModelPrimary.mockReturnValue(undefined);
  });

  it('syncs built-in doubao web search config when saving a jurismind provider with key', async () => {
    secureStorageMock.saveProvider.mockResolvedValue(undefined);
    secureStorageMock.storeApiKey.mockResolvedValue(undefined);

    const { registerIpcHandlers } = await import('@electron/main/ipc-handlers');

    const gatewayManager = {
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      debouncedRestart: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'running', port: 3456 })),
      rpc: vi.fn(async () => ({})),
      isConnected: vi.fn(() => true),
      getControlUiInfo: vi.fn(() => ({ success: false })),
      setAutoStart: vi.fn(async () => undefined),
    };
    const mainWindow = { webContents: { send: vi.fn() } };
    const marketService = {
      search: vi.fn(async () => []),
      install: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
      listInstalled: vi.fn(async () => []),
      openSkillReadme: vi.fn(async () => undefined),
      openSkillPage: vi.fn(async () => undefined),
    };

    registerIpcHandlers(
      gatewayManager as never,
      marketService as never,
      marketService as never,
      mainWindow as never
    );

    const handler = registeredHandlers.get('provider:save');
    const result = await handler?.(
      {},
      {
        id: 'jurismind',
        name: 'Jurismind',
        type: 'jurismind',
        enabled: true,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
      'sk-jurismind'
    ) as { success: boolean; error?: string };

    expect(result.success).toBe(true);
    expect(openclawAuthMock.syncJurismindWebSearchConfig).toHaveBeenCalledWith('sk-jurismind');
  });

  it('clears built-in doubao web search config when deleting a jurismind key', async () => {
    secureStorageMock.getDefaultProvider.mockResolvedValue(null);
    secureStorageMock.deleteApiKey.mockResolvedValue(true);
    secureStorageMock.getProvider.mockResolvedValue({
      id: 'jurismind',
      name: 'Jurismind',
      type: 'jurismind',
      enabled: true,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    });

    const { registerIpcHandlers } = await import('@electron/main/ipc-handlers');

    const gatewayManager = {
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      debouncedRestart: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'running', port: 3456 })),
      rpc: vi.fn(async () => ({})),
      isConnected: vi.fn(() => true),
      getControlUiInfo: vi.fn(() => ({ success: false })),
      setAutoStart: vi.fn(async () => undefined),
    };
    const mainWindow = { webContents: { send: vi.fn() } };
    const marketService = {
      search: vi.fn(async () => []),
      install: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
      listInstalled: vi.fn(async () => []),
      openSkillReadme: vi.fn(async () => undefined),
      openSkillPage: vi.fn(async () => undefined),
    };

    registerIpcHandlers(
      gatewayManager as never,
      marketService as never,
      marketService as never,
      mainWindow as never
    );

    const handler = registeredHandlers.get('provider:deleteApiKey');
    const result = await handler?.({}, 'jurismind') as { success: boolean; error?: string };

    expect(result.success).toBe(true);
    expect(openclawAuthMock.clearJurismindWebSearchConfig).toHaveBeenCalledTimes(1);
  });
});



describe('provider fallback selection', () => {
  beforeEach(() => {
    registeredHandlers.clear();
    vi.clearAllMocks();
    openclawAuthMock.getOpenClawAgentModelPrimary.mockReturnValue(undefined);
  });

  it('reselects the most recent available provider after deleting the current default provider', async () => {
    const providersById = new Map<string, Record<string, unknown>>([
      ['provider-openai', {
        id: 'provider-openai',
        name: 'OpenAI',
        type: 'openai',
        model: 'gpt-4.1',
        enabled: true,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      }],
      ['provider-moonshot', {
        id: 'provider-moonshot',
        name: 'Moonshot',
        type: 'moonshot',
        model: 'kimi-k2.5',
        enabled: true,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-05T00:00:00.000Z',
      }],
    ]);
    secureStorageMock.getDefaultProvider.mockResolvedValue('provider-openai');
    secureStorageMock.getProvider.mockImplementation(async (providerId: string) =>
      providersById.get(providerId) ?? null
    );
    secureStorageMock.getAllProviders.mockResolvedValue(Array.from(providersById.values()));
    secureStorageMock.getApiKey.mockImplementation(async (providerId: string) =>
      providerId === 'provider-moonshot' ? 'sk-moon' : null
    );
    openclawAuthMock.getOpenClawAgentModelPrimary.mockReturnValue('openai/gpt-4.1');
    secureStorageMock.deleteProvider.mockResolvedValue(true);
    openclawAuthMock.removeProviderFromOpenClaw.mockResolvedValue(undefined);

    const { registerIpcHandlers } = await import('@electron/main/ipc-handlers');

    const gatewayManager = {
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      debouncedRestart: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'running', port: 3456 })),
      rpc: vi.fn(async () => ({})),
      isConnected: vi.fn(() => true),
      getControlUiInfo: vi.fn(() => ({ success: false })),
      setAutoStart: vi.fn(async () => undefined),
    };
    const mainWindow = { webContents: { send: vi.fn() } };
    const marketService = {
      search: vi.fn(async () => []),
      install: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
      listInstalled: vi.fn(async () => []),
      openSkillReadme: vi.fn(async () => undefined),
      openSkillPage: vi.fn(async () => undefined),
    };

    registerIpcHandlers(
      gatewayManager as never,
      marketService as never,
      marketService as never,
      mainWindow as never
    );

    const handler = registeredHandlers.get('provider:delete');
    const result = await handler?.({}, 'provider-openai') as { success: boolean; error?: string };

    expect(result.success).toBe(true);
    expect(secureStorageMock.setDefaultProvider).toHaveBeenCalledWith('provider-moonshot');
    expect(openclawAuthMock.setOpenClawAgentModel).toHaveBeenCalledWith(
      'lawclaw-main',
      'moonshot',
      'moonshot/kimi-k2.5'
    );
  });

  it('keeps a user-selected model when deleting the current default provider and auto-falling back', async () => {
    const providersById = new Map<string, Record<string, unknown>>([
      ['provider-openai', {
        id: 'provider-openai',
        name: 'OpenAI',
        type: 'openai',
        model: 'gpt-4.1',
        enabled: true,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      }],
      ['provider-moonshot', {
        id: 'provider-moonshot',
        name: 'Moonshot',
        type: 'moonshot',
        model: 'kimi-k2.5',
        enabled: true,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-05T00:00:00.000Z',
      }],
    ]);
    secureStorageMock.getDefaultProvider.mockResolvedValue('provider-openai');
    secureStorageMock.getProvider.mockImplementation(async (providerId: string) =>
      providersById.get(providerId) ?? null
    );
    secureStorageMock.getAllProviders.mockResolvedValue(Array.from(providersById.values()));
    secureStorageMock.getApiKey.mockImplementation(async (providerId: string) =>
      providerId === 'provider-moonshot' ? 'sk-moon' : null
    );
    openclawAuthMock.getOpenClawAgentModelPrimary.mockReturnValue('google/gemini-3.1-pro-preview');
    secureStorageMock.deleteProvider.mockResolvedValue(true);
    openclawAuthMock.removeProviderFromOpenClaw.mockResolvedValue(undefined);

    const { registerIpcHandlers } = await import('@electron/main/ipc-handlers');

    const gatewayManager = {
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      debouncedRestart: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'running', port: 3456 })),
      rpc: vi.fn(async () => ({})),
      isConnected: vi.fn(() => true),
      getControlUiInfo: vi.fn(() => ({ success: false })),
      setAutoStart: vi.fn(async () => undefined),
    };
    const mainWindow = { webContents: { send: vi.fn() } };
    const marketService = {
      search: vi.fn(async () => []),
      install: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
      listInstalled: vi.fn(async () => []),
      openSkillReadme: vi.fn(async () => undefined),
      openSkillPage: vi.fn(async () => undefined),
    };

    registerIpcHandlers(
      gatewayManager as never,
      marketService as never,
      marketService as never,
      mainWindow as never
    );

    const handler = registeredHandlers.get('provider:delete');
    const result = await handler?.({}, 'provider-openai') as { success: boolean; error?: string };

    expect(result.success).toBe(true);
    expect(secureStorageMock.setDefaultProvider).toHaveBeenCalledWith('provider-moonshot');
    expect(openclawAuthMock.setOpenClawAgentModel).not.toHaveBeenCalled();
  });

  it('clears dedicated selection after deleting the last credential of the current default provider when no fallback exists', async () => {
    secureStorageMock.getDefaultProvider.mockResolvedValue('provider-openai');
    secureStorageMock.getProvider.mockResolvedValue({
      id: 'provider-openai',
      name: 'OpenAI',
      type: 'openai',
      model: 'gpt-4.1',
      enabled: true,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    });
    secureStorageMock.getAllProviders.mockResolvedValue([
      {
        id: 'provider-openai',
        name: 'OpenAI',
        type: 'openai',
        model: 'gpt-4.1',
        enabled: true,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ]);
    secureStorageMock.getApiKey.mockResolvedValue(null);
    secureStorageMock.deleteApiKey.mockResolvedValue(true);
    openclawAuthMock.getOAuthTokenFromOpenClaw.mockResolvedValue(null);
    openclawAuthMock.getOpenClawAgentModelPrimary.mockReturnValue('openai/gpt-4.1');

    const { registerIpcHandlers } = await import('@electron/main/ipc-handlers');

    const gatewayManager = {
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      debouncedRestart: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'running', port: 3456 })),
      rpc: vi.fn(async () => ({})),
      isConnected: vi.fn(() => true),
      getControlUiInfo: vi.fn(() => ({ success: false })),
      setAutoStart: vi.fn(async () => undefined),
    };
    const mainWindow = { webContents: { send: vi.fn() } };
    const marketService = {
      search: vi.fn(async () => []),
      install: vi.fn(async () => undefined),
      uninstall: vi.fn(async () => undefined),
      listInstalled: vi.fn(async () => []),
      openSkillReadme: vi.fn(async () => undefined),
      openSkillPage: vi.fn(async () => undefined),
    };

    registerIpcHandlers(
      gatewayManager as never,
      marketService as never,
      marketService as never,
      mainWindow as never
    );

    const handler = registeredHandlers.get('provider:deleteApiKey');
    const result = await handler?.({}, 'provider-openai') as { success: boolean; error?: string };

    expect(result.success).toBe(true);
    expect(secureStorageMock.clearDefaultProvider).toHaveBeenCalledTimes(1);
    expect(openclawAuthMock.clearOpenClawAgentModelPrimary).toHaveBeenCalledWith('lawclaw-main');
  });
});
