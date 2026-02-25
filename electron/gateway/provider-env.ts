export interface ApplyProviderEnvFallbacksParams {
  providerEnv: Record<string, string>;
  providerTypes: string[];
  getEnvVar: (providerType: string) => string | undefined;
  baseEnv?: Record<string, string | undefined>;
}

const PLACEHOLDER_PREFIX = '__CLAWX_PLACEHOLDER_';
const PLACEHOLDER_SUFFIX = '__';

function hasNonEmptyValue(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function applyProviderEnvFallbacks(
  params: ApplyProviderEnvFallbacksParams
): { providerEnv: Record<string, string>; fallbackCount: number } {
  const nextProviderEnv: Record<string, string> = { ...params.providerEnv };
  let fallbackCount = 0;
  const baseEnv = params.baseEnv ?? process.env;

  for (const providerType of params.providerTypes) {
    const envVar = params.getEnvVar(providerType);
    if (!envVar) continue;

    if (hasNonEmptyValue(nextProviderEnv[envVar])) continue;
    if (hasNonEmptyValue(baseEnv[envVar])) continue;

    nextProviderEnv[envVar] = `${PLACEHOLDER_PREFIX}${envVar}${PLACEHOLDER_SUFFIX}`;
    fallbackCount++;
  }

  return { providerEnv: nextProviderEnv, fallbackCount };
}
