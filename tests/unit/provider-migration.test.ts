import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '0.0.0-test'),
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

import {
  migrateJurismindProviderModel,
  migrateMiniMaxProviderModel,
  migrateMoonshotCodePlanProvider,
  migrateQwenProvider,
} from '@electron/utils/provider-migration';

describe('provider migration', () => {
  it('migrates legacy moonshot_code_plan data and syncs canonical auth/default model', async () => {
    const providers = [
      {
        id: 'moonshot_code_plan',
        type: 'moonshot_code_plan' as const,
        name: 'Moonshot - Code Plan（月之暗面-编程包月）',
        baseUrl: 'https://api.kimi.com/coding/v1',
        model: 'moonshot_code_plan/kimi-for-coding',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'jurismind',
        type: 'jurismind' as const,
        name: 'Jurismind',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const savedProviders: Array<Record<string, unknown>> = [];
    const saveProvider = vi.fn(async (config: Record<string, unknown>) => {
      savedProviders.push(config);
    });
    const saveProviderKeyToOpenClaw = vi.fn();
    const setOpenClawAgentModel = vi.fn();
    const cleanupOpenClawProviderApiKeyConfig = vi.fn(() => false);
    const cleanupOpenClawAuthProfilesEncoding = vi.fn(() => false);

    const result = await migrateMoonshotCodePlanProvider({
      getAllProviders: vi.fn(async () => providers),
      getApiKey: vi.fn(async (providerId: string) => (providerId === 'moonshot_code_plan' ? 'sk-test' : null)),
      saveProvider,
      getDefaultProvider: vi.fn(async () => 'moonshot_code_plan'),
      saveProviderKeyToOpenClaw,
      cleanupLegacyProviderProfiles: vi.fn(() => true),
      cleanupLegacyOpenClawProviderAliases: vi.fn(() => false),
      setOpenClawAgentModel,
      cleanupOpenClawProviderEntries: vi.fn(() => true),
      getOpenClawAgentModelPrimary: vi.fn(() => undefined),
      cleanupOpenClawProviderApiKeyConfig,
      cleanupOpenClawAuthProfilesEncoding,
    });

    expect(result).toMatchObject({
      touchedProviders: 1,
      normalizedProviders: 1,
      syncedKeys: 1,
      cleanedLegacyProfiles: true,
      rewroteDefaultModel: true,
      removedStaleProviderEntries: true,
      cleanedInvalidApiKeyConfig: false,
      cleanedAuthProfileEncoding: false,
    });

    expect(saveProvider).toHaveBeenCalledTimes(1);
    expect(savedProviders[0]).toMatchObject({
      id: 'moonshot_code_plan',
      type: 'moonshot_code_plan',
      name: 'Kimi Coding（官方）',
      baseUrl: undefined,
      model: undefined,
    });
    expect(saveProviderKeyToOpenClaw).toHaveBeenCalledWith('moonshot_code_plan', 'sk-test');
    expect(saveProviderKeyToOpenClaw).toHaveBeenCalledWith(
      'moonshot_code_plan',
      'sk-test',
      'lawclaw-main'
    );
    expect(setOpenClawAgentModel).toHaveBeenCalledWith(
      'lawclaw-main',
      'moonshot_code_plan',
      'kimi-coding/k2p5'
    );
  });

  it('is idempotent when provider is already normalized and has no key', async () => {
    const saveProvider = vi.fn();
    const saveProviderKeyToOpenClaw = vi.fn();
    const setOpenClawAgentModel = vi.fn();
    const cleanupOpenClawProviderApiKeyConfig = vi.fn(() => false);
    const cleanupOpenClawAuthProfilesEncoding = vi.fn(() => false);

    const result = await migrateMoonshotCodePlanProvider({
      getAllProviders: vi.fn(async () => [
        {
          id: 'moonshot_code_plan',
          type: 'moonshot_code_plan' as const,
          name: 'Kimi Coding（官方）',
          enabled: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      getApiKey: vi.fn(async () => null),
      saveProvider,
      getDefaultProvider: vi.fn(async () => 'jurismind'),
      saveProviderKeyToOpenClaw,
      cleanupLegacyProviderProfiles: vi.fn(() => false),
      cleanupLegacyOpenClawProviderAliases: vi.fn(() => false),
      setOpenClawAgentModel,
      cleanupOpenClawProviderEntries: vi.fn(() => false),
      getOpenClawAgentModelPrimary: vi.fn(() => undefined),
      cleanupOpenClawProviderApiKeyConfig,
      cleanupOpenClawAuthProfilesEncoding,
    });

    expect(result).toMatchObject({
      touchedProviders: 1,
      normalizedProviders: 0,
      syncedKeys: 0,
      cleanedLegacyProfiles: false,
      rewroteDefaultModel: false,
      removedStaleProviderEntries: false,
      cleanedInvalidApiKeyConfig: false,
      cleanedAuthProfileEncoding: false,
    });
    expect(saveProvider).not.toHaveBeenCalled();
    expect(saveProviderKeyToOpenClaw).not.toHaveBeenCalled();
    expect(setOpenClawAgentModel).not.toHaveBeenCalled();
  });

  it('migrates jurismind model ids and rewrites lawclaw-main only when it still uses the managed legacy model', async () => {
    const savedProviders: Array<Record<string, unknown>> = [];
    const saveProvider = vi.fn(async (config: Record<string, unknown>) => {
      savedProviders.push(config);
    });
    const setOpenClawAgentModel = vi.fn();
    const cleanupOpenClawProviderApiKeyConfig = vi.fn(() => true);
    const saveProviderKeyToOpenClaw = vi.fn();
    const cleanupOpenClawAuthProfilesEncoding = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const result = await migrateJurismindProviderModel({
      getAllProviders: vi.fn(async () => [
        {
          id: 'jurismind',
          type: 'jurismind' as const,
          name: 'Jurismind',
          model: 'kimi-k2.5',
          enabled: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      getApiKey: vi.fn(async () => 'sk-jurismind'),
      saveProvider,
      getDefaultProvider: vi.fn(async () => 'jurismind'),
      saveProviderKeyToOpenClaw,
      cleanupLegacyProviderProfiles: vi.fn(() => false),
      cleanupLegacyOpenClawProviderAliases: vi.fn(() => false),
      setOpenClawAgentModel,
      cleanupOpenClawProviderEntries: vi.fn(() => false),
      getOpenClawAgentModelPrimary: vi.fn(() => 'jurismind/kimi-k2.5'),
      cleanupOpenClawProviderApiKeyConfig,
      cleanupOpenClawAuthProfilesEncoding,
    });

    expect(result).toMatchObject({
      touchedProviders: 1,
      normalizedProviders: 1,
      syncedKeys: 1,
      rewroteDefaultModel: true,
      cleanedInvalidApiKeyConfig: true,
      cleanedAuthProfileEncoding: true,
    });
    expect(savedProviders[0]).toMatchObject({
      id: 'jurismind',
      model: 'jurismind/jurismind',
    });
    expect(setOpenClawAgentModel).toHaveBeenCalledWith(
      'lawclaw-main',
      'jurismind',
      'jurismind/jurismind'
    );
    expect(cleanupOpenClawProviderApiKeyConfig).toHaveBeenCalledWith('jurismind');
    expect(cleanupOpenClawAuthProfilesEncoding).toHaveBeenNthCalledWith(1);
    expect(cleanupOpenClawAuthProfilesEncoding).toHaveBeenNthCalledWith(2, 'lawclaw-main');
    expect(saveProviderKeyToOpenClaw).toHaveBeenCalledWith('jurismind', 'sk-jurismind');
    expect(saveProviderKeyToOpenClaw).toHaveBeenCalledWith(
      'jurismind',
      'sk-jurismind',
      'lawclaw-main'
    );
  });

  it('preserves user-customized lawclaw-main model when migrating jurismind provider metadata', async () => {
    const saveProvider = vi.fn();
    const setOpenClawAgentModel = vi.fn();
    const cleanupOpenClawProviderApiKeyConfig = vi.fn(() => false);
    const cleanupOpenClawAuthProfilesEncoding = vi.fn(() => false);

    const result = await migrateJurismindProviderModel({
      getAllProviders: vi.fn(async () => [
        {
          id: 'jurismind',
          type: 'jurismind' as const,
          name: 'Jurismind',
          enabled: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      getApiKey: vi.fn(async () => null),
      saveProvider,
      getDefaultProvider: vi.fn(async () => 'jurismind'),
      saveProviderKeyToOpenClaw: vi.fn(),
      cleanupLegacyProviderProfiles: vi.fn(() => false),
      cleanupLegacyOpenClawProviderAliases: vi.fn(() => false),
      setOpenClawAgentModel,
      cleanupOpenClawProviderEntries: vi.fn(() => false),
      getOpenClawAgentModelPrimary: vi.fn(() => 'openai/gpt-5.2'),
      cleanupOpenClawProviderApiKeyConfig,
      cleanupOpenClawAuthProfilesEncoding,
    });

    expect(result).toMatchObject({
      touchedProviders: 1,
      normalizedProviders: 0,
      rewroteDefaultModel: false,
      cleanedInvalidApiKeyConfig: false,
      cleanedAuthProfileEncoding: false,
    });
    expect(saveProvider).not.toHaveBeenCalled();
    expect(setOpenClawAgentModel).not.toHaveBeenCalled();
  });

  it('migrates legacy qwen-portal providers to qwen and rewrites managed model pointers', async () => {
    const savedProviders: Array<Record<string, unknown>> = [];
    const saveProvider = vi.fn(async (config: Record<string, unknown>) => {
      savedProviders.push(config);
    });
    const saveProviderKeyToOpenClaw = vi.fn();
    const setOpenClawAgentModel = vi.fn();
    const cleanupOpenClawProviderApiKeyConfig = vi.fn(() => true);
    const cleanupOpenClawAuthProfilesEncoding = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const cleanupLegacyOpenClawProviderAliases = vi.fn(() => true);

    const result = await migrateQwenProvider({
      getAllProviders: vi.fn(async () => [
        {
          id: 'qwen-portal',
          type: 'qwen-portal' as never,
          name: 'Qwen',
          baseUrl: 'https://portal.qwen.ai/v1',
          model: 'qwen-portal/coder-model',
          enabled: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      getApiKey: vi.fn(async () => 'sk-qwen'),
      saveProvider,
      getDefaultProvider: vi.fn(async () => 'qwen-portal'),
      saveProviderKeyToOpenClaw,
      cleanupLegacyProviderProfiles: vi.fn(() => true),
      cleanupLegacyOpenClawProviderAliases,
      setOpenClawAgentModel,
      cleanupOpenClawProviderEntries: vi.fn(() => false),
      getOpenClawAgentModelPrimary: vi.fn(() => 'qwen-portal/coder-model'),
      cleanupOpenClawProviderApiKeyConfig,
      cleanupOpenClawAuthProfilesEncoding,
    });

    expect(result).toMatchObject({
      touchedProviders: 1,
      normalizedProviders: 1,
      syncedKeys: 1,
      cleanedLegacyProfiles: true,
      rewroteDefaultModel: true,
      removedStaleProviderEntries: true,
      cleanedInvalidApiKeyConfig: true,
      cleanedAuthProfileEncoding: true,
    });
    expect(savedProviders[0]).toMatchObject({
      id: 'qwen-portal',
      type: 'qwen',
      baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
      model: 'qwen/qwen3.5-plus',
    });
    expect(saveProviderKeyToOpenClaw).toHaveBeenCalledWith('qwen', 'sk-qwen');
    expect(saveProviderKeyToOpenClaw).toHaveBeenCalledWith('qwen', 'sk-qwen', 'lawclaw-main');
    expect(setOpenClawAgentModel).toHaveBeenCalledWith(
      'lawclaw-main',
      'qwen',
      'qwen/qwen3.5-plus'
    );
    expect(cleanupLegacyOpenClawProviderAliases).toHaveBeenCalledWith('qwen');
  });

  it('migrates managed minimax defaults for both global and cn providers', async () => {
    const savedProviders: Array<Record<string, unknown>> = [];
    const saveProvider = vi.fn(async (config: Record<string, unknown>) => {
      savedProviders.push(config);
    });
    const saveProviderKeyToOpenClaw = vi.fn();
    const setOpenClawAgentModel = vi.fn();

    const result = await migrateMiniMaxProviderModel({
      getAllProviders: vi.fn(async () => [
        {
          id: 'minimax-cn',
          type: 'minimax-portal-cn' as const,
          name: 'MiniMax (CN)',
          model: 'MiniMax-M2.5',
          enabled: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      getApiKey: vi.fn(async () => 'sk-minimax-cn'),
      saveProvider,
      getDefaultProvider: vi.fn(async () => 'minimax-cn'),
      saveProviderKeyToOpenClaw,
      cleanupLegacyProviderProfiles: vi.fn(() => false),
      cleanupLegacyOpenClawProviderAliases: vi.fn(() => false),
      setOpenClawAgentModel,
      cleanupOpenClawProviderEntries: vi.fn(() => false),
      getOpenClawAgentModelPrimary: vi.fn(() => 'minimax-portal/MiniMax-M2.5'),
      cleanupOpenClawProviderApiKeyConfig: vi.fn(() => false),
      cleanupOpenClawAuthProfilesEncoding: vi.fn(() => false),
    });

    expect(result).toMatchObject({
      touchedProviders: 1,
      normalizedProviders: 1,
      syncedKeys: 1,
      rewroteDefaultModel: true,
    });
    expect(savedProviders[0]).toMatchObject({
      id: 'minimax-cn',
      type: 'minimax-portal-cn',
      model: 'minimax-portal/MiniMax-M2.7',
    });
    expect(saveProviderKeyToOpenClaw).toHaveBeenCalledWith('minimax-portal', 'sk-minimax-cn');
    expect(saveProviderKeyToOpenClaw).toHaveBeenCalledWith(
      'minimax-portal',
      'sk-minimax-cn',
      'lawclaw-main'
    );
    expect(setOpenClawAgentModel).toHaveBeenCalledWith(
      'lawclaw-main',
      'minimax-portal',
      'minimax-portal/MiniMax-M2.7'
    );
  });
});
