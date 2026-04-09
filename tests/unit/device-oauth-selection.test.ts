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
    if (provider === 'minimax-portal') {
      return 'minimax-portal/MiniMax-M2.7';
    }
    return undefined;
  }),
}));

const pathsMock = vi.hoisted(() => ({
  isOpenClawPresent: vi.fn(() => true),
}));

const minimaxOAuthMock = vi.hoisted(() => ({
  loginMiniMaxPortalOAuth: vi.fn(async () => ({
    access: 'access-token',
    refresh: 'refresh-token',
    expires: 1234567890,
    resourceUrl: 'https://api.minimax.io',
  })),
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
vi.mock('../../node_modules/openclaw/dist/extensions/minimax/oauth.js', () => minimaxOAuthMock);

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

    const success = await deviceOAuthManager.startFlow('minimax-portal');

    expect(success).toBe(true);
    expect(openclawAuthMock.saveOAuthTokenToOpenClaw).toHaveBeenCalledWith('minimax-portal', {
      access: 'access-token',
      refresh: 'refresh-token',
      expires: 1234567890,
    });
    expect(secureStorageMock.saveProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'minimax-portal',
        type: 'minimax-portal',
        baseUrl: 'https://api.minimax.io/anthropic',
        model: 'minimax-portal/MiniMax-M2.7',
      })
    );
    expect(openclawAuthMock.setOpenClawDefaultModelWithOverride).not.toHaveBeenCalled();
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('oauth:success', {
      provider: 'minimax-portal',
      success: true,
    });
  });
});
