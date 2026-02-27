/**
 * OpenClaw config env fallback helpers.
 * Some OpenClaw CLI commands read the full config and fail fast when
 * referenced env vars are missing, even if those vars are unrelated
 * to the command being executed (e.g., plugins install).
 */

const ENV_REF_REGEX = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

const PLACEHOLDER_VALUE = '__CLAWX_PLACEHOLDER__';

export function applyOpenClawConfigEnvFallbacks(
  configRaw: string,
  baseEnv: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = { ...baseEnv };
  const seen = new Set<string>();

  for (const match of configRaw.matchAll(ENV_REF_REGEX)) {
    const varName = match[1];
    if (seen.has(varName)) {
      continue;
    }
    seen.add(varName);

    if (!nextEnv[varName]) {
      nextEnv[varName] = PLACEHOLDER_VALUE;
    }
  }

  return nextEnv;
}
