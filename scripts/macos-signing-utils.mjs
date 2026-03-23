import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

function hasOwn(env, key) {
  return Object.prototype.hasOwnProperty.call(env, key) && env[key] !== undefined;
}

function readDefined(env, ...keys) {
  for (const key of keys) {
    if (hasOwn(env, key)) {
      return String(env[key]);
    }
  }
  return undefined;
}

function readNonEmpty(env, ...keys) {
  const value = readDefined(env, ...keys);
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function formatMissing(keys) {
  return keys.map((key) => `\`${key}\``).join(', ');
}

function normalizeAppleApiKeyContent(value) {
  const trimmed = value.trim();
  return trimmed.includes('\\n') ? trimmed.replace(/\\n/g, '\n') : trimmed;
}

export function resolveMacSigningState(env = process.env) {
  const certificateLink = readNonEmpty(env, 'MAC_CERTS', 'CSC_LINK');
  const certificatePassword = readDefined(env, 'MAC_CERTS_PASSWORD', 'CSC_KEY_PASSWORD');
  const hasCertificatePassword = certificatePassword !== undefined;

  const appleId = readNonEmpty(env, 'APPLE_ID');
  const appleIdPassword = readNonEmpty(env, 'APPLE_APP_SPECIFIC_PASSWORD');
  const teamId = readNonEmpty(env, 'APPLE_TEAM_ID');

  const appleApiKey = readNonEmpty(env, 'APPLE_API_KEY');
  const appleApiKeyId = readNonEmpty(env, 'APPLE_API_KEY_ID');
  const appleApiIssuer = readNonEmpty(env, 'APPLE_API_ISSUER');

  const keychainProfile = readNonEmpty(env, 'APPLE_KEYCHAIN_PROFILE');
  const keychain = readNonEmpty(env, 'APPLE_KEYCHAIN');

  const appleIdProvided = Boolean(appleId || appleIdPassword || teamId);
  const apiKeyProvided = Boolean(appleApiKey || appleApiKeyId || appleApiIssuer);
  const keychainProvided = Boolean(keychainProfile || keychain);
  const certsProvided = Boolean(certificateLink || hasCertificatePassword);

  const appleIdMissing = [];
  if (appleIdProvided) {
    if (!appleId) appleIdMissing.push('APPLE_ID');
    if (!appleIdPassword) appleIdMissing.push('APPLE_APP_SPECIFIC_PASSWORD');
    if (!teamId) appleIdMissing.push('APPLE_TEAM_ID');
  }

  const apiKeyMissing = [];
  if (apiKeyProvided) {
    if (!appleApiKey) apiKeyMissing.push('APPLE_API_KEY');
    if (!appleApiKeyId) apiKeyMissing.push('APPLE_API_KEY_ID');
    if (!appleApiIssuer) apiKeyMissing.push('APPLE_API_ISSUER');
  }

  const errors = new Set();
  if (certsProvided) {
    if (!certificateLink) {
      errors.add(`Missing macOS signing certificate secret ${formatMissing(['MAC_CERTS'])}.`);
    }
    if (!hasCertificatePassword) {
      errors.add(
        `Missing macOS signing certificate password secret ${formatMissing(['MAC_CERTS_PASSWORD'])}.`
      );
    }
  }

  if (appleIdMissing.length > 0) {
    errors.add(`Incomplete Apple ID notarization credentials: missing ${formatMissing(appleIdMissing)}.`);
  }
  if (apiKeyMissing.length > 0) {
    errors.add(`Incomplete App Store Connect API key credentials: missing ${formatMissing(apiKeyMissing)}.`);
  }
  if (keychainProvided && !keychainProfile) {
    errors.add(`Incomplete keychain notarization credentials: missing ${formatMissing(['APPLE_KEYCHAIN_PROFILE'])}.`);
  }

  const appleIdComplete = appleIdProvided && appleIdMissing.length === 0;
  const apiKeyComplete = apiKeyProvided && apiKeyMissing.length === 0;
  const keychainComplete = keychainProvided && Boolean(keychainProfile);

  const warnings = [];
  const completeAuthModes = [
    appleIdComplete ? 'apple-id' : null,
    apiKeyComplete ? 'api-key' : null,
    keychainComplete ? 'keychain' : null,
  ].filter(Boolean);

  if (completeAuthModes.length > 1) {
    warnings.push(
      `Multiple notarization credential sets are configured (${completeAuthModes.join(', ')}); electron-builder will use Apple ID first, then API key, then keychain.`
    );
  }

  let mode = 'none';
  if (appleIdComplete) {
    mode = 'apple-id';
  } else if (apiKeyComplete) {
    mode = 'api-key';
  } else if (keychainComplete) {
    mode = 'keychain';
  }

  const hasAnyMacSigningSecrets = Boolean(
    certsProvided || appleIdProvided || apiKeyProvided || keychainProvided
  );

  if ((appleIdComplete || apiKeyComplete || keychainComplete) && !certificateLink) {
    errors.add(`Missing macOS signing certificate secret ${formatMissing(['MAC_CERTS'])}.`);
  }
  if ((appleIdComplete || apiKeyComplete || keychainComplete) && !hasCertificatePassword) {
    errors.add(
      `Missing macOS signing certificate password secret ${formatMissing(['MAC_CERTS_PASSWORD'])}.`
    );
  }

  return {
    enabled: mode !== 'none' && Boolean(certificateLink) && hasCertificatePassword,
    mode,
    warnings,
    errors: Array.from(errors),
    hasAnyMacSigningSecrets,
    certificateLink,
    certificatePassword: certificatePassword ?? '',
    appleId,
    appleIdPassword,
    teamId,
    appleApiKey,
    appleApiKeyId,
    appleApiIssuer,
    keychainProfile,
    keychain,
  };
}

export function resolveMacBuilderMode(env = process.env) {
  const requestedMode = readNonEmpty(env, 'LAWCLAW_MAC_SIGN');
  const state = resolveMacSigningState(env);

  if (state.errors.length > 0) {
    throw new Error(state.errors.join('\n'));
  }

  if (requestedMode === '0') {
    return { useSignedConfig: false, state };
  }

  if (requestedMode === '1') {
    if (!state.enabled) {
      throw new Error(
        'LAWCLAW_MAC_SIGN=1 was requested, but macOS signing and notarization secrets are incomplete.'
      );
    }
    return { useSignedConfig: true, state };
  }

  return {
    useSignedConfig: state.enabled,
    state,
  };
}

export async function buildMacSigningEnvEntries(state, options = {}) {
  if (!state?.enabled) {
    return [];
  }

  const apiKeyDirectory = options.apiKeyDirectory || join(os.tmpdir(), 'lawclaw-apple-api-key');
  const envEntries = [
    ['LAWCLAW_MAC_SIGN', '1'],
    ['CSC_LINK', state.certificateLink],
    ['CSC_KEY_PASSWORD', state.certificatePassword],
  ];

  if (state.mode === 'apple-id') {
    envEntries.push(['APPLE_ID', state.appleId]);
    envEntries.push(['APPLE_APP_SPECIFIC_PASSWORD', state.appleIdPassword]);
    envEntries.push(['APPLE_TEAM_ID', state.teamId]);
  } else if (state.mode === 'api-key') {
    const keyPath = await ensureAppleApiKeyPath(
      state.appleApiKey,
      state.appleApiKeyId,
      apiKeyDirectory
    );
    envEntries.push(['APPLE_API_KEY', keyPath]);
    envEntries.push(['APPLE_API_KEY_ID', state.appleApiKeyId]);
    envEntries.push(['APPLE_API_ISSUER', state.appleApiIssuer]);
  } else if (state.mode === 'keychain') {
    envEntries.push(['APPLE_KEYCHAIN_PROFILE', state.keychainProfile]);
    if (state.keychain) {
      envEntries.push(['APPLE_KEYCHAIN', state.keychain]);
    }
  }

  return envEntries;
}

export function applyEnvEntries(baseEnv, entries) {
  const nextEnv = { ...baseEnv };
  for (const [key, value] of entries) {
    nextEnv[key] = value;
  }
  return nextEnv;
}

export async function ensureAppleApiKeyPath(apiKeyValue, apiKeyId, directory) {
  const value = typeof apiKeyValue === 'string' ? apiKeyValue : '';
  const normalized = normalizeAppleApiKeyContent(value);
  if (!normalized) {
    throw new Error('APPLE_API_KEY must be set.');
  }

  if (existsSync(normalized)) {
    return normalized;
  }

  if (!normalized.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      'APPLE_API_KEY must be an existing .p8 file path or the raw contents of the AuthKey_*.p8 file.'
    );
  }

  const outputDir = directory || join(os.tmpdir(), 'lawclaw-apple-api-key');
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `AuthKey_${apiKeyId || 'temp'}.p8`);
  const pemContents = normalized.endsWith('\n') ? normalized : `${normalized}\n`;
  await writeFile(outputPath, pemContents, { mode: 0o600 });
  return outputPath;
}

export function buildNotarytoolAuthArgs(state, appleApiKeyPath) {
  switch (state.mode) {
    case 'apple-id':
      return [
        '--apple-id',
        state.appleId,
        '--password',
        state.appleIdPassword,
        '--team-id',
        state.teamId,
      ];
    case 'api-key':
      return [
        '--key',
        appleApiKeyPath,
        '--key-id',
        state.appleApiKeyId,
        '--issuer',
        state.appleApiIssuer,
      ];
    case 'keychain': {
      const args = ['--keychain-profile', state.keychainProfile];
      if (state.keychain) {
        args.push('--keychain', state.keychain);
      }
      return args;
    }
    default:
      throw new Error(`Unsupported notarization mode: ${state.mode}`);
  }
}
