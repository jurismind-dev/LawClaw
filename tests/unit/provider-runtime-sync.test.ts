import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStorageMock = vi.hoisted(() => ({
  getAllProviders: vi.fn(),
  getApiKey: vi.fn(),
}));

const agentConfigMock = vi.hoisted(() => ({
  listAgentsSnapshot: vi.fn(),
}));

const openclawAuthMock = vi.hoisted(() => ({
  removeProviderFromOpenClaw: vi.fn(),
  removeProviderKeyFromOpenClaw: vi.fn(),
  saveProviderKeyToOpenClaw: vi.fn(),
  syncProviderAuthProfileToOpenClawAgents: vi.fn(() => false),
  syncProviderConfigToOpenClaw: vi.fn(),
  updateAgentModelProvider: vi.fn(),
  updateSingleAgentModelProvider: vi.fn(),
}));

const providerRegistryMock = vi.hoisted(() => ({
  getProviderConfig: vi.fn((type: string) => {
    if (type === 'jurismind') {
      return {
        baseUrl: 'http://101.132.245.215:3001/v1',
        api: 'openai-completions',
        apiKeyEnv: 'JURISMIND_API_KEY',
        models: [
          { id: 'jurismind', name: 'jurismind' },
          { id: 'doubao', name: 'doubao', input: ['text', 'image'] },
        ],
      };
    }

    if (type === 'openai') {
      return {
        baseUrl: 'https://api.openai.com/v1',
        api: 'openai-responses',
        apiKeyEnv: 'OPENAI_API_KEY',
      };
    }

    if (type === 'minimax-portal') {
      return {
        baseUrl: 'https://api.minimax.io/v1/anthropic',
        api: 'anthropic-chat',
        apiKeyEnv: 'MINIMAX_API_KEY',
      };
    }

    return undefined;
  }),
}));

const loggerMock = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@electron/utils/secure-storage', () => secureStorageMock);
vi.mock('@electron/utils/agent-config', () => agentConfigMock);
vi.mock('@electron/utils/openclaw-auth', () => openclawAuthMock);
vi.mock('@electron/utils/provider-registry', () => providerRegistryMock);
vi.mock('@electron/utils/logger', () => loggerMock);

describe('provider runtime sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs provider auth and per-agent model registries for existing agents', async () => {
    secureStorageMock.getAllProviders.mockResolvedValue([
      {
        id: 'custom-e3aa7f90-1234-5678-9abc-def012345678',
        name: 'Custom E3',
        type: 'custom',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        model: 'qwen-max',
        enabled: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
      },
      {
        id: 'provider-openai',
        name: 'OpenAI',
        type: 'openai',
        model: 'gpt-4.1',
        enabled: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
      },
    ]);
    secureStorageMock.getApiKey.mockImplementation(async (providerId: string) => {
      if (providerId === 'custom-e3aa7f90-1234-5678-9abc-def012345678') {
        return 'sk-custom';
      }
      if (providerId === 'provider-openai') {
        return 'sk-openai';
      }
      return null;
    });
    agentConfigMock.listAgentsSnapshot.mockResolvedValue({
      agents: [
        {
          id: 'lawclaw-main',
          modelRef: 'custom-custome3/qwen3.6-plus',
        },
        {
          id: 'agent-2',
          modelRef: 'openai/gpt-4.1',
        },
      ],
      defaultAgentId: 'lawclaw-main',
      defaultModelRef: 'openai/gpt-4.1',
      configuredChannelTypes: [],
    });

    const { syncAllProvidersToRuntime } = await import('@electron/services/providers/provider-runtime-sync');

    await syncAllProvidersToRuntime();

    expect(openclawAuthMock.saveProviderKeyToOpenClaw).toHaveBeenCalledWith(
      'custom-custome3',
      'sk-custom',
      'main',
    );
    expect(openclawAuthMock.saveProviderKeyToOpenClaw).toHaveBeenCalledWith(
      'custom-custome3',
      'sk-custom',
      'lawclaw-main',
    );
    expect(openclawAuthMock.saveProviderKeyToOpenClaw).toHaveBeenCalledWith(
      'custom-custome3',
      'sk-custom',
      'agent-2',
    );
    expect(openclawAuthMock.saveProviderKeyToOpenClaw).toHaveBeenCalledWith(
      'openai',
      'sk-openai',
      'agent-2',
    );

    expect(openclawAuthMock.syncProviderConfigToOpenClaw).toHaveBeenCalledWith(
      'custom-custome3',
      'qwen-max',
      expect.objectContaining({
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        api: 'openai-completions',
      }),
    );
    expect(openclawAuthMock.updateAgentModelProvider).toHaveBeenCalledWith(
      'custom-custome3',
      expect.objectContaining({
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        api: 'openai-completions',
        apiKey: 'sk-custom',
      }),
    );
    expect(openclawAuthMock.updateSingleAgentModelProvider).toHaveBeenCalledWith(
      'lawclaw-main',
      'custom-custome3',
      expect.objectContaining({
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        models: [{ id: 'qwen3.6-plus', name: 'qwen3.6-plus' }],
        apiKey: 'sk-custom',
      }),
    );
    expect(openclawAuthMock.updateSingleAgentModelProvider).toHaveBeenCalledWith(
      'agent-2',
      'openai',
      expect.objectContaining({
        baseUrl: 'https://api.openai.com/v1',
        api: 'openai-responses',
        models: [{ id: 'gpt-4.1', name: 'gpt-4.1' }],
      }),
    );
  });

  it('preserves provider model metadata when syncing jurismind agents to runtime', async () => {
    secureStorageMock.getAllProviders.mockResolvedValue([
      {
        id: 'provider-jurismind',
        name: 'Jurismind',
        type: 'jurismind',
        model: 'jurismind',
        enabled: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
      },
    ]);
    secureStorageMock.getApiKey.mockResolvedValue('sk-jurismind');
    agentConfigMock.listAgentsSnapshot.mockResolvedValue({
      agents: [
        {
          id: 'lawclaw-main',
          modelRef: 'jurismind/jurismind',
        },
      ],
      defaultAgentId: 'lawclaw-main',
      defaultModelRef: 'jurismind/jurismind',
      configuredChannelTypes: [],
    });

    const { syncAllProvidersToRuntime } = await import('@electron/services/providers/provider-runtime-sync');

    await syncAllProvidersToRuntime();

    expect(openclawAuthMock.updateSingleAgentModelProvider).toHaveBeenCalledWith(
      'lawclaw-main',
      'jurismind',
      expect.objectContaining({
        baseUrl: 'http://101.132.245.215:3001/v1',
        api: 'openai-completions',
        apiKey: 'JURISMIND_API_KEY',
        models: [
          expect.objectContaining({ id: 'jurismind', name: 'jurismind' }),
          expect.objectContaining({ id: 'doubao', name: 'doubao', input: ['text', 'image'] }),
        ],
      }),
    );
  });

  it('removes provider keys from every runtime agent', async () => {
    agentConfigMock.listAgentsSnapshot.mockResolvedValue({
      agents: [
        { id: 'lawclaw-main', modelRef: null },
        { id: 'agent-2', modelRef: null },
      ],
      defaultAgentId: 'lawclaw-main',
      defaultModelRef: null,
      configuredChannelTypes: [],
    });

    const { syncDeletedProviderApiKeyToRuntime } = await import('@electron/services/providers/provider-runtime-sync');

    await syncDeletedProviderApiKeyToRuntime('custom', 'custom-e3aa7f90-1234-5678-9abc-def012345678');

    expect(openclawAuthMock.removeProviderKeyFromOpenClaw).toHaveBeenCalledWith('custom-custome3', 'main');
    expect(openclawAuthMock.removeProviderKeyFromOpenClaw).toHaveBeenCalledWith('custom-custome3', 'lawclaw-main');
    expect(openclawAuthMock.removeProviderKeyFromOpenClaw).toHaveBeenCalledWith('custom-custome3', 'agent-2');
  });

  it('copies existing OAuth auth profiles to every runtime agent when no API key exists', async () => {
    secureStorageMock.getAllProviders.mockResolvedValue([
      {
        id: 'minimax-portal',
        name: 'MiniMax',
        type: 'minimax-portal',
        baseUrl: 'https://api.minimax.io/v1/anthropic',
        model: 'minimax-portal/MiniMax-M2.7',
        enabled: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
      },
    ]);
    secureStorageMock.getApiKey.mockResolvedValue(null);
    agentConfigMock.listAgentsSnapshot.mockResolvedValue({
      agents: [
        {
          id: 'lawclaw-main',
          modelRef: 'minimax-portal/MiniMax-M2.7',
        },
        {
          id: 'agent-2',
          modelRef: 'minimax-portal/MiniMax-M2.7',
        },
      ],
      defaultAgentId: 'lawclaw-main',
      defaultModelRef: 'minimax-portal/MiniMax-M2.7',
      configuredChannelTypes: [],
    });
    openclawAuthMock.syncProviderAuthProfileToOpenClawAgents.mockReturnValue(true);

    const { syncAllProvidersToRuntime } = await import('@electron/services/providers/provider-runtime-sync');

    await syncAllProvidersToRuntime();

    expect(openclawAuthMock.syncProviderAuthProfileToOpenClawAgents).toHaveBeenCalledWith(
      'minimax-portal',
      ['main', 'lawclaw-main', 'agent-2'],
    );
    expect(openclawAuthMock.syncProviderConfigToOpenClaw).toHaveBeenCalledWith(
      'minimax-portal',
      'minimax-portal/MiniMax-M2.7',
      expect.objectContaining({
        baseUrl: 'https://api.minimax.io/v1/anthropic',
        api: 'anthropic-chat',
      }),
    );
  });
});
