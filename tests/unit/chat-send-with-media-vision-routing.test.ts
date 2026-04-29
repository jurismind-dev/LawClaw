import { beforeEach, describe, expect, it, vi } from 'vitest';

const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>();
const pdfExtractModuleUrl = vi.hoisted(() => '/tmp/openclaw/dist/pdf-extract-BQPFOwRi.js');

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
}));

const readOpenClawConfigMock = vi.hoisted(() => vi.fn(async () => ({
  agents: {
    defaults: {
      pdfMaxPages: 2,
      pdfMaxBytesMb: 10,
    },
  },
})));

const gatewayRpc = vi.hoisted(() => vi.fn(async () => ({ runId: 'run-1', status: 'accepted' })));
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  readLogFile: vi.fn(async () => ''),
  getLogFilePath: vi.fn(() => '/tmp/app.log'),
  listLogFiles: vi.fn(async () => []),
}));
const fsPromisesMock = vi.hoisted(() => ({
  access: vi.fn(async () => undefined),
  stat: vi.fn(async (filePath: string) => ({
    size: filePath.endsWith('.pdf') ? 1024 : 128,
  })),
  readFile: vi.fn(async (filePath: string) => {
    if (filePath.endsWith('.pdf')) {
      return Buffer.from('fake-pdf');
    }
    return Buffer.from('fake-image');
  }),
  mkdir: vi.fn(async () => undefined),
  copyFile: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
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
    getPath: vi.fn(() => '/tmp'),
    quit: vi.fn(),
    relaunch: vi.fn(),
    isPackaged: false,
  },
  nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => true })) },
}));

vi.mock('@electron/utils/secure-storage', () => secureStorageMock);

vi.mock('@electron/utils/paths', () => ({
  getOpenClawStatus: vi.fn(() => ({ packageExists: true, entryPath: '/tmp/openclaw.js', dir: '/tmp' })),
  getOpenClawDir: vi.fn(() => '/tmp/openclaw'),
  getOpenClawResolvedDir: vi.fn(() => '/tmp/openclaw'),
  getOpenClawConfigDir: vi.fn(() => '/tmp/.openclaw'),
  getOpenClawSkillsDir: vi.fn(() => '/tmp/.openclaw/skills'),
  getResourcesDir: vi.fn(() => '/tmp/resources'),
  ensureDir: vi.fn(),
}));

vi.mock('@electron/utils/channel-config', () => ({
  saveChannelConfig: vi.fn(async () => undefined),
  getChannelConfig: vi.fn(async () => ({})),
  getChannelFormValues: vi.fn(async () => ({})),
  deleteChannelConfig: vi.fn(async () => undefined),
  listConfiguredChannels: vi.fn(async () => []),
  readOpenClawConfig: readOpenClawConfigMock,
  setChannelEnabled: vi.fn(async () => undefined),
  validateChannelConfig: vi.fn(async () => ({ valid: true })),
  validateChannelCredentials: vi.fn(async () => ({ valid: true })),
  enforceLawClawChannelBinding: vi.fn(async () => false),
  clearLawClawChannelBinding: vi.fn(async () => false),
}));

vi.mock('@electron/utils/openclaw-auth', () => ({
  clearJurismindMultimodalConfig: vi.fn(),
  clearJurismindWebSearchConfig: vi.fn(),
  syncJurismindMultimodalConfig: vi.fn(),
  syncJurismindWebSearchConfig: vi.fn(),
}));

vi.mock('@electron/utils/store', () => ({
  getSetting: vi.fn(async () => []),
  setSetting: vi.fn(async () => undefined),
  getAllSettings: vi.fn(async () => ({})),
  resetSettings: vi.fn(async () => undefined),
}));

vi.mock('@electron/utils/logger', () => ({
  logger: loggerMock,
}));

vi.mock('@electron/utils/provider-registry', () => ({
  getProviderConfig: vi.fn(() => undefined),
}));

vi.mock('@electron/utils/provider-validation', () => ({
  validateApiKeyWithProvider: vi.fn(async () => ({ valid: true })),
}));

vi.mock('@electron/utils/openclaw-cli', () => ({
  applyBundledNpmToCliEnv: vi.fn((env: Record<string, string>) => env),
  getNodeExecForCli: vi.fn(() => process.execPath),
  getOpenClawCliCommand: vi.fn(() => 'openclaw'),
}));

vi.mock('@electron/utils/openclaw-config-env', () => ({
  applyOpenClawConfigEnvFallbacks: vi.fn((raw: string, env: Record<string, string>) => env),
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

vi.mock('@electron/utils/openclaw-plugin-install', () => ({
  detectPluginInstallationState: vi.fn(() => ({ installed: false })),
  finalizeBundledPluginConfigAfterInstall: vi.fn(),
  isAlreadyInstalledErrorMessage: vi.fn(() => false),
  publishPreparedPluginInstallDir: vi.fn(async () => undefined),
}));

vi.mock('@electron/utils/preset-installer', () => ({
  PresetInstaller: class {},
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
  OAuthProviderType: {},
}));

vi.mock('@electron/utils/jurismind-connector', () => ({
  jurismindConnectorManager: {
    setWindow: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('@electron/utils/jurismind-provider-token-binding', () => ({
  bindJurismindProviderToken: vi.fn(async () => ({ success: true })),
}));

vi.mock('@electron/utils/feishu-onboarding', () => ({
  feishuOnboardingManager: {
    setWindow: vi.fn(),
    on: vi.fn(),
  },
  isFeishuOnboardingCancelledError: vi.fn(() => false),
}));

vi.mock('@electron/utils/weixin-onboarding', () => ({
  weixinOnboardingManager: {
    setWindow: vi.fn(),
    on: vi.fn(),
  },
  isWeixinOnboardingCancelledError: vi.fn(() => false),
}));

vi.mock('@electron/utils/feishu-official-plugin', () => ({
  FEISHU_OFFICIAL_PLUGIN_ID: 'feishu-official',
}));

vi.mock('@electron/utils/feishu-official-plugin-installer', () => ({
  prepareFeishuOfficialPluginInstallDir: vi.fn(async () => '/tmp/plugin'),
}));

vi.mock('@electron/utils/preset-install-state', () => ({
  forgetManagedPresetInstallItem: vi.fn(async () => undefined),
}));

vi.mock('@electron/utils/lawclaw-provider-selection', () => ({
  applyLawClawProviderSelection: vi.fn(async () => undefined),
  clearLawClawProviderSelection: vi.fn(async () => undefined),
  isProviderAvailableForLawClaw: vi.fn(() => true),
  pickFallbackLawClawProvider: vi.fn(async () => null),
}));

vi.mock('@electron/utils/agent-config', () => ({
  createAgent: vi.fn(async () => undefined),
  deleteAgentConfig: vi.fn(async () => undefined),
  listAgentsSnapshot: vi.fn(async () => ({ agents: [] })),
  removeAgentWorkspaceDirectory: vi.fn(async () => undefined),
  updateAgentModel: vi.fn(async () => undefined),
  updateAgentName: vi.fn(async () => undefined),
}));

vi.mock('@electron/services/providers/provider-runtime-sync', () => ({
  getOpenClawProviderKey: vi.fn(() => 'jurismind'),
  syncAgentModelOverrideToRuntime: vi.fn(async () => undefined),
  syncAllProvidersToRuntime: vi.fn(async () => undefined),
  syncDeletedProviderApiKeyToRuntime: vi.fn(async () => undefined),
  syncDeletedProviderToRuntime: vi.fn(async () => undefined),
  syncProviderApiKeyToRuntime: vi.fn(async () => undefined),
  syncSavedProviderToRuntime: vi.fn(async () => undefined),
  syncUpdatedProviderToRuntime: vi.fn(async () => undefined),
}));

vi.mock(pdfExtractModuleUrl, () => ({
  t: vi.fn(async () => ({
    text: '',
    images: [
      { type: 'image', data: 'pdf-page-one', mimeType: 'image/png' },
      { type: 'image', data: 'pdf-page-two', mimeType: 'image/png' },
    ],
  })),
}));

vi.mock('fs/promises', () => fsPromisesMock);

describe('chat:sendWithMedia vision routing', () => {
  beforeEach(() => {
    registeredHandlers.clear();
    vi.clearAllMocks();
    secureStorageMock.getDefaultProvider.mockResolvedValue('jurismind-default');
    secureStorageMock.getProvider.mockResolvedValue({
      id: 'jurismind-default',
      type: 'jurismind',
      name: 'Jurismind',
      model: 'jurismind',
      enabled: true,
    });
    secureStorageMock.getApiKey.mockResolvedValue('sk-jurismind');
  });

  async function registerHandlers() {
    const { registerIpcHandlers } = await import('@electron/main/ipc-handlers');
    const gatewayManager = {
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      debouncedRestart: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'running', port: 3456 })),
      rpc: gatewayRpc,
      isConnected: vi.fn(() => true),
      getControlUiInfo: vi.fn(() => ({ success: false })),
      setAutoStart: vi.fn(async () => undefined),
    };
    const mainWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
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
      mainWindow as never,
    );

    return registeredHandlers.get('chat:sendWithMedia');
  }

  it('routes image attachments through the Jurismind vision model without chat.send fallback', async () => {
    const handler = await registerHandlers();
    expect(handler).toBeTypeOf('function');

    const invokeResult = await handler?.({}, {
      sessionKey: 'agent:lawclaw-main:main',
      message: '这个图片内容是什么',
      deliver: false,
      idempotencyKey: 'idem-1',
      media: [
        {
          filePath: '/tmp/test-image.png',
          mimeType: 'image/png',
          fileName: 'test-image.png',
        },
      ],
    }) as { success: boolean; result?: { runId: string } };

    expect(invokeResult.success).toBe(true);
    expect(gatewayRpc).toHaveBeenCalledTimes(1);
    expect(gatewayRpc).toHaveBeenCalledWith(
      'agent',
      expect.objectContaining({
        sessionKey: 'agent:lawclaw-main:main',
        provider: 'jurismind',
        model: 'doubao',
        attachments: [
          expect.objectContaining({
            mimeType: 'image/png',
            fileName: 'test-image.png',
          }),
        ],
      }),
      600000,
    );
    expect(gatewayRpc).not.toHaveBeenCalledWith(
      'chat.send',
      expect.anything(),
      expect.anything(),
    );
  });

  it('renders PDF pages to images and sends them through the Jurismind vision model', async () => {
    const handler = await registerHandlers();
    expect(handler).toBeTypeOf('function');

    const invokeResult = await handler?.({}, {
      sessionKey: 'agent:lawclaw-main:main',
      message: '请分析这个 PDF',
      deliver: false,
      idempotencyKey: 'idem-2',
      media: [
        {
          filePath: '/tmp/test-file.pdf',
          mimeType: 'application/pdf',
          fileName: 'test-file.pdf',
        },
      ],
    }) as { success: boolean; result?: { runId: string } };

    expect(invokeResult.success).toBe(true);
    expect(gatewayRpc).toHaveBeenCalledTimes(1);
    expect(gatewayRpc).toHaveBeenCalledWith(
      'agent',
      expect.objectContaining({
        provider: 'jurismind',
        model: 'doubao',
        attachments: [
          expect.objectContaining({ fileName: 'test-file.pdf-page-1.png', content: 'pdf-page-one' }),
          expect.objectContaining({ fileName: 'test-file.pdf-page-2.png', content: 'pdf-page-two' }),
        ],
      }),
      600000,
    );
  });

  it('keeps searchable text-only PDF content on the chat.send path', async () => {
    vi.resetModules();
    registeredHandlers.clear();
    vi.doMock(pdfExtractModuleUrl, () => ({
      t: vi.fn(async () => ({
        text: 'searchable pdf text',
        images: [],
      })),
    }));

    const handler = await registerHandlers();
    expect(handler).toBeTypeOf('function');

    const invokeResult = await handler?.({}, {
      sessionKey: 'agent:lawclaw-main:main',
      message: '请分析这个 PDF',
      deliver: false,
      idempotencyKey: 'idem-2b',
      media: [
        {
          filePath: '/tmp/test-file.pdf',
          mimeType: 'application/pdf',
          fileName: 'test-file.pdf',
        },
      ],
    }) as { success: boolean; result?: { runId: string } };

    expect(invokeResult.success).toBe(true);
    expect(gatewayRpc).toHaveBeenCalledTimes(1);
    expect(gatewayRpc).toHaveBeenCalledWith(
      'chat.send',
      expect.objectContaining({
        message: expect.stringContaining('searchable pdf text'),
      }),
      120000,
    );
  });

  it('surfaces PDF extraction warnings when neither text nor page images are available', async () => {
    vi.resetModules();
    registeredHandlers.clear();
    vi.doMock(pdfExtractModuleUrl, () => ({
      t: vi.fn(async (params: { onImageExtractionError?: (err: unknown) => void }) => {
        params.onImageExtractionError?.(new Error('canvas runtime missing'));
        return {
          text: '',
          images: [],
        };
      }),
    }));

    const handler = await registerHandlers();
    expect(handler).toBeTypeOf('function');

    const invokeResult = await handler?.({}, {
      sessionKey: 'agent:lawclaw-main:main',
      message: '请分析这个 PDF',
      deliver: false,
      idempotencyKey: 'idem-2c',
      media: [
        {
          filePath: '/tmp/test-file.pdf',
          mimeType: 'application/pdf',
          fileName: 'test-file.pdf',
        },
      ],
    }) as { success: boolean; error?: string };

    expect(invokeResult.success).toBe(false);
    expect(invokeResult.error).toContain('PDF extraction produced no usable content');
    expect(invokeResult.error).toContain('canvas runtime missing');
    expect(gatewayRpc).not.toHaveBeenCalled();
  });

  it('keeps non-Jurismind providers on the original chat.send path', async () => {
    secureStorageMock.getProvider.mockResolvedValue({
      id: 'openai-default',
      type: 'openai',
      name: 'OpenAI',
      model: 'gpt-5.2',
      enabled: true,
    });

    const handler = await registerHandlers();
    expect(handler).toBeTypeOf('function');

    const invokeResult = await handler?.({}, {
      sessionKey: 'agent:lawclaw-main:main',
      message: 'describe image',
      deliver: false,
      idempotencyKey: 'idem-3',
      media: [
        {
          filePath: '/tmp/test-image.png',
          mimeType: 'image/png',
          fileName: 'test-image.png',
        },
      ],
    }) as { success: boolean; result?: { runId: string } };

    expect(invokeResult.success).toBe(true);
    expect(gatewayRpc).toHaveBeenCalledWith(
      'chat.send',
      expect.objectContaining({
        sessionKey: 'agent:lawclaw-main:main',
      }),
      120000,
    );
  });

  it('falls back to openclaw.json imageModel/pdfModel config when the local provider store is missing on Windows', async () => {
    secureStorageMock.getDefaultProvider.mockResolvedValue(undefined);
    readOpenClawConfigMock.mockResolvedValue({
      agents: {
        defaults: {
          imageModel: 'jurismind/doubao',
          pdfModel: 'jurismind/doubao',
          pdfMaxPages: 2,
          pdfMaxBytesMb: 10,
        },
      },
      models: {
        providers: {
          jurismind: {
            baseUrl: 'http://101.132.245.215:3001/v1',
            api: 'openai-completions',
            models: [
              { id: 'jurismind', name: 'jurismind' },
              { id: 'doubao', name: 'doubao', input: ['text', 'image'] },
            ],
          },
        },
      },
    });

    const handler = await registerHandlers();
    expect(handler).toBeTypeOf('function');

    const invokeResult = await handler?.({}, {
      sessionKey: 'agent:lawclaw-main:main',
      message: '这个图片内容是什么',
      deliver: false,
      idempotencyKey: 'idem-win-fallback',
      media: [
        {
          filePath: 'C:\\Users\\fyjw888\\.openclaw\\media\\outbound\\test-image.png',
          mimeType: 'image/png',
          fileName: 'test-image.png',
        },
      ],
    }) as { success: boolean; result?: { runId: string } };

    expect(invokeResult.success).toBe(true);
    expect(gatewayRpc).toHaveBeenCalledTimes(1);
    expect(gatewayRpc).toHaveBeenCalledWith(
      'agent',
      expect.objectContaining({
        provider: 'jurismind',
        model: 'doubao',
        attachments: [
          expect.objectContaining({
            mimeType: 'image/png',
            fileName: 'test-image.png',
          }),
        ],
      }),
      600000,
    );
    expect(gatewayRpc).not.toHaveBeenCalledWith(
      'chat.send',
      expect.anything(),
      expect.anything(),
    );
  });
});
