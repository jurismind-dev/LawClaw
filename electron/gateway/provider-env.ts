export interface ApplyProviderEnvFallbacksParams {
  providerEnv: Record<string, string>;
  providerTypes: string[];
  getEnvVar: (providerType: string) => string | undefined;
  baseEnv?: Record<string, string | undefined>;
}

const PLACEHOLDER_PREFIX = '__CLAWX_PLACEHOLDER_';
const PLACEHOLDER_SUFFIX = '__';
const PLACEHOLDER_UNSAFE_ENV_VARS = new Set([
  // Codex ACP treats OPENAI_API_KEY as an auth method. A placeholder here
  // overrides `codex login` / ~/.codex/auth.json and causes 401s.
  'OPENAI_API_KEY',
]);
const LAWCLAW_MANAGED_PROVIDER_ENV_BLOCKLIST = new Set([
  // Codex ACP inherits the Gateway process environment. Do not inject LawClaw's
  // OpenAI provider key here; Codex should use the user's own `codex login`.
  'OPENAI_API_KEY',
]);

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
    if (PLACEHOLDER_UNSAFE_ENV_VARS.has(envVar)) continue;

    if (hasNonEmptyValue(nextProviderEnv[envVar])) continue;
    if (hasNonEmptyValue(baseEnv[envVar])) continue;

    nextProviderEnv[envVar] = `${PLACEHOLDER_PREFIX}${envVar}${PLACEHOLDER_SUFFIX}`;
    fallbackCount++;
  }

  return { providerEnv: nextProviderEnv, fallbackCount };
}

export function shouldInjectLawClawProviderEnv(envVar: string | undefined): boolean {
  return Boolean(envVar && !LAWCLAW_MANAGED_PROVIDER_ENV_BLOCKLIST.has(envVar));
}
