import { describe, expect, it, vi } from 'vitest';
import { migrateMoonshotCodePlanProvider } from '@electron/utils/provider-migration';

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

    const result = await migrateMoonshotCodePlanProvider({
      getAllProviders: vi.fn(async () => providers),
      getApiKey: vi.fn(async (providerId: string) => (providerId === 'moonshot_code_plan' ? 'sk-test' : null)),
      saveProvider,
      getDefaultProvider: vi.fn(async () => 'moonshot_code_plan'),
      saveProviderKeyToOpenClaw,
      cleanupLegacyProviderProfiles: vi.fn(() => true),
      setOpenClawAgentModel,
      cleanupOpenClawProviderEntries: vi.fn(() => true),
    });

    expect(result).toMatchObject({
      touchedProviders: 1,
      normalizedProviders: 1,
      syncedKeys: 1,
      cleanedLegacyProfiles: true,
      rewroteDefaultModel: true,
      removedStaleProviderEntries: true,
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
      setOpenClawAgentModel,
      cleanupOpenClawProviderEntries: vi.fn(() => false),
    });

    expect(result).toMatchObject({
      touchedProviders: 1,
      normalizedProviders: 0,
      syncedKeys: 0,
      cleanedLegacyProfiles: false,
      rewroteDefaultModel: false,
      removedStaleProviderEntries: false,
    });
    expect(saveProvider).not.toHaveBeenCalled();
    expect(saveProviderKeyToOpenClaw).not.toHaveBeenCalled();
    expect(setOpenClawAgentModel).not.toHaveBeenCalled();
  });
});
