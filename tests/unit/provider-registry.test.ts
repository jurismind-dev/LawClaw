import { describe, expect, it } from 'vitest';
import {
  getCanonicalProviderId,
  getKeyableProviderTypes,
  getProviderAliasIds,
  getProviderConfig,
  getProviderDefaultModel,
  getProviderEnvVar,
} from '@electron/utils/provider-registry';

describe('provider backend registry', () => {
  it('maps moonshot code plan to official kimi coding semantics', () => {
    expect(getCanonicalProviderId('moonshot_code_plan')).toBe('kimi-coding');
    expect(getProviderAliasIds('moonshot_code_plan')).toEqual(
      expect.arrayContaining(['moonshot_code_plan', 'kimi-coding'])
    );

    expect(getProviderEnvVar('moonshot_code_plan')).toBe('KIMI_API_KEY');
    expect(getProviderDefaultModel('moonshot_code_plan')).toBe('kimi-coding/k2p5');
    expect(getProviderConfig('moonshot_code_plan')).toBeUndefined();
  });

  it('maps legacy qwen-portal ids to qwen runtime metadata', () => {
    expect(getCanonicalProviderId('qwen-portal')).toBe('qwen');
    expect(getProviderAliasIds('qwen')).toEqual(expect.arrayContaining(['qwen', 'qwen-portal']));
    expect(getProviderAliasIds('qwen-portal')).toEqual(
      expect.arrayContaining(['qwen', 'qwen-portal'])
    );
    expect(getProviderEnvVar('qwen-portal')).toBe('QWEN_API_KEY');
    expect(getProviderDefaultModel('qwen-portal')).toBe('qwen/qwen3.5-plus');
    expect(getProviderConfig('qwen-portal')).toMatchObject({
      baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1',
      api: 'openai-completions',
      apiKeyEnv: 'QWEN_API_KEY',
    });
  });

  it('keeps jurismind and glm code plan metadata intact', () => {
    expect(getProviderEnvVar('glm_code_plan')).toBe('GLM_CODE_PLAN_API_KEY');
    expect(getProviderDefaultModel('glm_code_plan')).toBeTruthy();
    expect(getProviderConfig('glm_code_plan')).toMatchObject({
      baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
      api: 'openai-completions',
      apiKeyEnv: 'GLM_CODE_PLAN_API_KEY',
    });

    expect(getProviderEnvVar('jurismind')).toBe('JURISMIND_API_KEY');
    expect(getProviderDefaultModel('jurismind')).toBe('jurismind/jurismind');
    expect(getProviderConfig('jurismind')).toMatchObject({
      baseUrl: 'http://101.132.245.215:3001/v1',
      api: 'openai-completions',
      apiKeyEnv: 'JURISMIND_API_KEY',
    });
  });

  it('keeps keyable providers for gateway env injection', () => {
    const keyableProviderTypes = getKeyableProviderTypes();
    expect(keyableProviderTypes).toEqual(
      expect.arrayContaining(['jurismind', 'moonshot_code_plan', 'glm_code_plan'])
    );
  });
});
