import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStorageMock = vi.hoisted(() => ({
  saveProvider: vi.fn(),
  getProvider: vi.fn(),
}));

const openclawAuthMock = vi.hoisted(() => ({
  saveOAuthTokenToOpenClaw: vi.fn(),
  setOpenClawDefaultModelWithOverride: vi.fn(),
}));

const providerRegistryMock = vi.hoisted(() => ({
  getProviderDefaultModel: vi.fn((provider: string) => {
    if (provider === 'qwen-portal') {
      return 'qwen-portal/coder-model';
    }
    return undefined;
  }),
}));

const pathsMock = vi.hoisted(() => ({
  isOpenClawPresent: vi.fn(() => true),
}));

const qwenOAuthMock = vi.hoisted(() => ({
  loginQwenPortalOAuth: vi.fn(async () => ({
    access: 'access-token',
    refresh: 'refresh-token',
    expires: 1234567890,
    resourceUrl: 'https://portal.qwen.ai',
  })),
}));

const minimaxOAuthMock = vi.hoisted(() => ({
  loginMiniMaxPortalOAuth: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  shell: {
    openExternal: vi.fn(),
  },
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('@electron/utils/secure-storage', () => secureStorageMock);
vi.mock('@electron/utils/provider-registry', () => providerRegistryMock);
vi.mock('@electron/utils/paths', () => pathsMock);
vi.mock('@electron/utils/openclaw-auth', () => openclawAuthMock);
vi.mock('../../node_modules/openclaw/extensions/qwen-portal-auth/oauth', () => qwenOAuthMock);
vi.mock('../../node_modules/openclaw/extensions/minimax-portal-auth/oauth', () => minimaxOAuthMock);

describe('device OAuth provider persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    secureStorageMock.getProvider.mockResolvedValue(null);
    secureStorageMock.saveProvider.mockResolvedValue(undefined);
    openclawAuthMock.saveOAuthTokenToOpenClaw.mockResolvedValue(undefined);
  });

  it('persists OAuth tokens and provider config without rewriting OpenClaw global default model', async () => {
    const { deviceOAuthManager } = await import('@electron/utils/device-oauth');
    const mainWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        send: vi.fn(),
      },
    };

    deviceOAuthManager.setWindow(mainWindow as never);

    const success = await deviceOAuthManager.startFlow('qwen-portal');

    expect(success).toBe(true);
    expect(openclawAuthMock.saveOAuthTokenToOpenClaw).toHaveBeenCalledWith('qwen-portal', {
      access: 'access-token',
      refresh: 'refresh-token',
      expires: 1234567890,
    });
    expect(secureStorageMock.saveProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'qwen-portal',
        type: 'qwen-portal',
        baseUrl: 'https://portal.qwen.ai/v1',
        model: 'qwen-portal/coder-model',
      })
    );
    expect(openclawAuthMock.setOpenClawDefaultModelWithOverride).not.toHaveBeenCalled();
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('oauth:success', {
      provider: 'qwen-portal',
      success: true,
    });
  });
});
