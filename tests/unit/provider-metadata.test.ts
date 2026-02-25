import { describe, expect, it } from 'vitest';
import { PROVIDER_TYPE_INFO, SETUP_PROVIDERS } from '@/lib/providers';

describe('provider metadata', () => {
  it('keeps the new setup provider order with Jurismind and Code Plan options first', () => {
    const setupProviderIds = SETUP_PROVIDERS.map((provider) => provider.id);
    expect(setupProviderIds.slice(0, 3)).toEqual([
      'jurismind',
      'moonshot_code_plan',
      'glm_code_plan',
    ]);
  });

  it('defines fixed endpoint/model metadata for code plan providers', () => {
    const moonshotCodePlan = PROVIDER_TYPE_INFO.find((provider) => provider.id === 'moonshot_code_plan');
    const glmCodePlan = PROVIDER_TYPE_INFO.find((provider) => provider.id === 'glm_code_plan');

    expect(moonshotCodePlan).toMatchObject({
      requiresApiKey: true,
      defaultBaseUrl: 'https://api.kimi.com/coding/v1',
      defaultModelId: 'kimi-for-coding',
    });
    expect(glmCodePlan).toMatchObject({
      requiresApiKey: true,
      defaultBaseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
      defaultModelId: 'glm-5.0',
    });
  });

  it('keeps legacy moonshot provider and custom-like jurismind config options', () => {
    const legacyMoonshot = PROVIDER_TYPE_INFO.find((provider) => provider.id === 'moonshot');
    const jurismind = PROVIDER_TYPE_INFO.find((provider) => provider.id === 'jurismind');

    expect(legacyMoonshot?.name).toBe('Moonshot (CN)');
    expect(jurismind).toMatchObject({
      requiresApiKey: true,
      showBaseUrl: true,
      showModelId: true,
    });
  });
});
