import { describe, expect, it } from 'vitest';
import {
  applyProviderEnvFallbacks,
  shouldInjectLawClawProviderEnv,
} from '../../electron/gateway/provider-env';

describe('gateway provider env fallbacks', () => {
  it('为缺失的 provider env 注入占位值', () => {
    const result = applyProviderEnvFallbacks({
      providerEnv: {},
      providerTypes: ['siliconflow'],
      getEnvVar: (type) => type === 'siliconflow' ? 'SILICONFLOW_API_KEY' : undefined,
      baseEnv: {},
    });

    expect(result.fallbackCount).toBe(1);
    expect(result.providerEnv.SILICONFLOW_API_KEY).toBe('__CLAWX_PLACEHOLDER_SILICONFLOW_API_KEY__');
  });

  it('已有真实值时不覆盖', () => {
    const result = applyProviderEnvFallbacks({
      providerEnv: { OPENAI_API_KEY: 'real-key' },
      providerTypes: ['openai', 'siliconflow'],
      getEnvVar: (type) => {
        if (type === 'openai') return 'OPENAI_API_KEY';
        if (type === 'siliconflow') return 'SILICONFLOW_API_KEY';
        return undefined;
      },
      baseEnv: { SILICONFLOW_API_KEY: 'from-process-env' },
    });

    expect(result.fallbackCount).toBe(0);
    expect(result.providerEnv.OPENAI_API_KEY).toBe('real-key');
    expect(result.providerEnv.SILICONFLOW_API_KEY).toBeUndefined();
  });

  it('不会为 OPENAI_API_KEY 注入占位值以免覆盖 Codex 登录态', () => {
    const result = applyProviderEnvFallbacks({
      providerEnv: {},
      providerTypes: ['openai', 'siliconflow'],
      getEnvVar: (type) => {
        if (type === 'openai') return 'OPENAI_API_KEY';
        if (type === 'siliconflow') return 'SILICONFLOW_API_KEY';
        return undefined;
      },
      baseEnv: {},
    });

    expect(result.fallbackCount).toBe(1);
    expect(result.providerEnv.OPENAI_API_KEY).toBeUndefined();
    expect(result.providerEnv.SILICONFLOW_API_KEY).toBe('__CLAWX_PLACEHOLDER_SILICONFLOW_API_KEY__');
  });

  it('不会把 LawClaw 管理的 OPENAI_API_KEY 注入 Gateway，避免 Codex ACP 继承它', () => {
    expect(shouldInjectLawClawProviderEnv('OPENAI_API_KEY')).toBe(false);
    expect(shouldInjectLawClawProviderEnv('JURISMIND_API_KEY')).toBe(true);
  });
});
