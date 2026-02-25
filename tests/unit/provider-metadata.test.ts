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

  it('uses official Kimi Coding metadata and keeps GLM config editable defaults', () => {
    const moonshotCodePlan = PROVIDER_TYPE_INFO.find((provider) => provider.id === 'moonshot_code_plan');
    const glmCodePlan = PROVIDER_TYPE_INFO.find((provider) => provider.id === 'glm_code_plan');

    expect(moonshotCodePlan).toMatchObject({
      name: 'Kimi Coding（官方）',
      requiresApiKey: true,
      defaultBaseUrl: 'https://api.kimi.com/coding/v1',
      defaultModelId: 'kimi-coding/k2p5',
      showBaseUrl: false,
      showModelId: false,
    });
    expect(glmCodePlan).toMatchObject({
      requiresApiKey: true,
      defaultBaseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
      defaultModelId: 'glm-4.7',
    });
  });

  it('keeps legacy moonshot provider and pins jurismind endpoint/model defaults', () => {
    const legacyMoonshot = PROVIDER_TYPE_INFO.find((provider) => provider.id === 'moonshot');
    const jurismind = PROVIDER_TYPE_INFO.find((provider) => provider.id === 'jurismind');

    expect(legacyMoonshot?.name).toBe('Moonshot (CN)');
    expect(jurismind).toMatchObject({
      requiresApiKey: true,
      defaultBaseUrl: 'http://101.132.245.215:3001/v1',
      defaultModelId: 'kimi-k2.5',
    });
    expect(jurismind?.showBaseUrl).not.toBe(true);
    expect(jurismind?.showModelId).not.toBe(true);
  });
});
