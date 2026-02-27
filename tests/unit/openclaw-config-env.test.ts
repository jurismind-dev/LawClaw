import { describe, expect, it } from 'vitest';
import { applyOpenClawConfigEnvFallbacks } from '../../electron/utils/openclaw-config-env';

describe('openclaw config env fallbacks', () => {
  it('injects placeholder values for missing referenced env vars', () => {
    const configRaw = JSON.stringify({
      models: {
        providers: {
          glm_code_plan: { apiKey: '${GLM_CODE_PLAN_API_KEY}' },
          jurismind: { apiKey: '${JURISMIND_API_KEY}' },
        },
      },
    });

    const result = applyOpenClawConfigEnvFallbacks(configRaw, {});

    expect(result.GLM_CODE_PLAN_API_KEY).toBe('__CLAWX_PLACEHOLDER__');
    expect(result.JURISMIND_API_KEY).toBe('__CLAWX_PLACEHOLDER__');
  });

  it('keeps existing env vars unchanged', () => {
    const configRaw = JSON.stringify({
      models: {
        providers: {
          glm_code_plan: { apiKey: '${GLM_CODE_PLAN_API_KEY}' },
        },
      },
    });

    const result = applyOpenClawConfigEnvFallbacks(configRaw, {
      GLM_CODE_PLAN_API_KEY: 'real-key',
    });

    expect(result.GLM_CODE_PLAN_API_KEY).toBe('real-key');
  });
});
