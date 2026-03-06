import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStorageMock = vi.hoisted(() => ({
  getProvider: vi.fn(),
  getAllProviders: vi.fn(),
  getApiKey: vi.fn(),
  setDefaultProvider: vi.fn(),
  clearDefaultProvider: vi.fn(),
}));

const openclawAuthMock = vi.hoisted(() => ({
  setOpenClawAgentModel: vi.fn(),
  setOpenClawAgentModelWithOverride: vi.fn(),
  clearOpenClawAgentModelPrimary: vi.fn(),
  saveProviderKeyToOpenClaw: vi.fn(),
  getOAuthTokenFromOpenClaw: vi.fn(),
}));

const providerRegistryMock = vi.hoisted(() => ({
  getProviderConfig: vi.fn(),
  getProviderEnvVar: vi.fn(),
}));

vi.mock('@electron/utils/secure-storage', () => secureStorageMock);
vi.mock('@electron/utils/openclaw-auth', () => openclawAuthMock);
vi.mock('@electron/utils/provider-registry', () => providerRegistryMock);
vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('lawclaw provider selection helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('applies dedicated agent model for standard providers without touching global defaults', async () => {
    secureStorageMock.getProvider.mockResolvedValue({
      id: 'provider-openai',
      type: 'openai',
      name: 'OpenAI',
      model: 'gpt-4.1',
      enabled: true,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    });
    secureStorageMock.getApiKey.mockResolvedValue('sk-live');

    const restartGateway = vi.fn();
    const mod = await import('@electron/utils/lawclaw-provider-selection');

    await mod.applyLawClawProviderSelection('provider-openai', { restartGateway });

    expect(secureStorageMock.setDefaultProvider).toHaveBeenCalledWith('provider-openai');
    expect(openclawAuthMock.setOpenClawAgentModel).toHaveBeenCalledWith(
      'lawclaw-main',
      'openai',
      'openai/gpt-4.1'
    );
    expect(openclawAuthMock.setOpenClawAgentModelWithOverride).not.toHaveBeenCalled();
    expect(openclawAuthMock.saveProviderKeyToOpenClaw).toHaveBeenNthCalledWith(1, 'openai', 'sk-live');
    expect(openclawAuthMock.saveProviderKeyToOpenClaw).toHaveBeenNthCalledWith(
      2,
      'openai',
      'sk-live',
      'lawclaw-main'
    );
    expect(restartGateway).toHaveBeenCalledTimes(1);
  });

  it('uses registry default baseUrl for runtime providers when provider config omits it', async () => {
    secureStorageMock.getProvider.mockResolvedValue({
      id: 'cafebabe-1234-5678',
      type: 'ollama',
      name: 'Ollama',
      model: 'qwen3:latest',
      enabled: true,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    });
    secureStorageMock.getApiKey.mockResolvedValue(null);
    providerRegistryMock.getProviderConfig.mockReturnValue({
      baseUrl: 'http://localhost:11434',
      api: 'openai-completions',
    });
    providerRegistryMock.getProviderEnvVar.mockReturnValue(undefined);

    const mod = await import('@electron/utils/lawclaw-provider-selection');

    await mod.applyLawClawProviderSelection('cafebabe-1234-5678');

    expect(openclawAuthMock.setOpenClawAgentModelWithOverride).toHaveBeenCalledWith(
      'lawclaw-main',
      'ollama-cafebabe',
      'ollama-cafebabe/qwen3:latest',
      {
        baseUrl: 'http://localhost:11434',
        api: 'openai-completions',
        apiKeyEnv: undefined,
        headers: undefined,
      }
    );
  });

  it('clears the selected provider and dedicated agent model when no fallback remains', async () => {
    const restartGateway = vi.fn();
    const mod = await import('@electron/utils/lawclaw-provider-selection');

    await mod.clearLawClawProviderSelection({ restartGateway });

    expect(secureStorageMock.clearDefaultProvider).toHaveBeenCalledTimes(1);
    expect(openclawAuthMock.clearOpenClawAgentModelPrimary).toHaveBeenCalledWith('lawclaw-main');
    expect(restartGateway).toHaveBeenCalledTimes(1);
  });

  it('checks OAuth availability on lawclaw-main first and falls back to main', async () => {
    openclawAuthMock.getOAuthTokenFromOpenClaw
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('oauth-token');

    const mod = await import('@electron/utils/lawclaw-provider-selection');

    const available = await mod.isProviderAvailableForLawClaw({
      id: 'qwen-portal',
      type: 'qwen-portal',
      name: 'Qwen',
      enabled: true,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    });

    expect(available).toBe(true);
    expect(openclawAuthMock.getOAuthTokenFromOpenClaw).toHaveBeenNthCalledWith(
      1,
      'qwen-portal',
      'lawclaw-main'
    );
    expect(openclawAuthMock.getOAuthTokenFromOpenClaw).toHaveBeenNthCalledWith(
      2,
      'qwen-portal',
      'main'
    );
  });

  it('picks the most recently updated available provider as fallback', async () => {
    secureStorageMock.getAllProviders.mockResolvedValue([
      {
        id: 'provider-openai',
        type: 'openai',
        name: 'OpenAI',
        enabled: true,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-03T00:00:00.000Z',
      },
      {
        id: 'provider-qwen',
        type: 'qwen-portal',
        name: 'Qwen',
        enabled: true,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-05T00:00:00.000Z',
      },
      {
        id: 'provider-ollama',
        type: 'ollama',
        name: 'Ollama',
        enabled: true,
        createdAt: '2026-03-02T00:00:00.000Z',
        updatedAt: '2026-03-05T00:00:00.000Z',
      },
    ]);
    secureStorageMock.getApiKey.mockImplementation(async (providerId: string) =>
      providerId === 'provider-openai' ? 'sk-live' : null
    );
    openclawAuthMock.getOAuthTokenFromOpenClaw.mockResolvedValue('oauth-token');

    const mod = await import('@electron/utils/lawclaw-provider-selection');

    const fallback = await mod.pickFallbackLawClawProvider(['provider-ollama']);

    expect(fallback?.id).toBe('provider-qwen');
  });
});
