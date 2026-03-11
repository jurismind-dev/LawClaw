#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
export const PRESET_ROOT = join(ROOT_DIR, 'resources', 'preset-installs');
export const MANIFEST_PATH = join(PRESET_ROOT, 'manifest.json');
export const JURISHUB_CONVEX_ACTION_URL = 'https://convex-api-lawhub.jurismind.com/api/action';
export const JURISHUB_SKILL_VALIDATION_LIMIT = 20;
export const JURISHUB_SKILL_VALIDATION_TIMEOUT_MS = 20_000;
export const SKIP_REMOTE_SKILL_VALIDATION_ARG = '--skip-remote-skill-validation';

function fail(message) {
  console.error(`[bundle-preset-artifacts] ${message}`);
  process.exit(1);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function collectFilesRecursively(rootDir, currentDir = rootDir, files = []) {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(rootDir, fullPath, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

export function computeDirectorySha256(dirPath) {
  const files = collectFilesRecursively(dirPath).sort((a, b) => a.localeCompare(b));
  const hash = createHash('sha256');
  for (const filePath of files) {
    const rel = relative(dirPath, filePath).replaceAll('\\', '/');
    hash.update(rel, 'utf-8');
    hash.update('\n', 'utf-8');
    hash.update(readFileSync(filePath));
    hash.update('\n', 'utf-8');
  }
  return hash.digest('hex');
}

export function computeArtifactSha256(artifactPath) {
  const artifactStat = statSync(artifactPath);
  if (artifactStat.isFile()) {
    const hash = createHash('sha256');
    hash.update(readFileSync(artifactPath));
    return hash.digest('hex');
  }
  if (artifactStat.isDirectory()) {
    return computeDirectorySha256(artifactPath);
  }
  throw new Error(`Unsupported artifact type: ${artifactPath}`);
}

export function loadManifest(manifestPath = MANIFEST_PATH) {
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest not found: ${manifestPath}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (error) {
    throw new Error(`manifest parse failed: ${String(error)}`);
  }

  if (!isRecord(manifest)) {
    throw new Error('manifest content must be an object');
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion: ${String(manifest.schemaVersion)}`);
  }
  if (!Array.isArray(manifest.items)) {
    throw new Error('manifest.items must be an array');
  }

  return manifest;
}

export function buildJurishubSkillValidationRequest(skillId) {
  return {
    url: JURISHUB_CONVEX_ACTION_URL,
    payload: {
      path: 'search:searchSkills',
      args: {
        query: skillId,
        limit: JURISHUB_SKILL_VALIDATION_LIMIT,
        highlightedOnly: true,
      },
    },
  };
}

export async function verifyJurishubOfficialHighlightedSkill(
  skillId,
  { fetchImpl = globalThis.fetch, timeoutMs = JURISHUB_SKILL_VALIDATION_TIMEOUT_MS } = {}
) {
  const { url, payload } = buildJurishubSkillValidationRequest(skillId);
  if (typeof fetchImpl !== 'function') {
    return {
      eligible: false,
      highlighted: false,
      official: false,
      url,
      error: 'fetch is not available in current Node.js runtime',
    };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutHandle);
    return {
      eligible: false,
      highlighted: false,
      official: false,
      url,
      error: `request failed: ${getErrorMessage(error)}`,
    };
  }
  clearTimeout(timeoutHandle);

  if (!response.ok) {
    return {
      eligible: false,
      highlighted: false,
      official: false,
      url,
      error: `HTTP ${String(response.status)} ${response.statusText || ''}`.trim(),
    };
  }

  let responsePayload;
  try {
    responsePayload = await response.json();
  } catch (error) {
    return {
      eligible: false,
      highlighted: false,
      official: false,
      url,
      error: `invalid JSON response: ${getErrorMessage(error)}`,
    };
  }

  if (!isRecord(responsePayload) || responsePayload.status !== 'success' || !Array.isArray(responsePayload.value)) {
    return {
      eligible: false,
      highlighted: false,
      official: false,
      url,
      error: 'invalid response shape: missing value[] or non-success status',
    };
  }

  const matched = responsePayload.value.find(
    (entry) => isRecord(entry) && isRecord(entry.skill) && entry.skill.slug === skillId
  );
  if (!matched || !isRecord(matched.skill)) {
    return {
      eligible: false,
      highlighted: false,
      official: false,
      url,
      error: `slug "${skillId}" not found in JurisHub highlighted search results`,
    };
  }

  const badges = isRecord(matched.skill.badges) ? matched.skill.badges : {};
  const highlighted = Boolean(badges.highlighted);
  const official = Boolean(badges.official);
  const eligible = highlighted && official;

  return {
    eligible,
    highlighted,
    official,
    url,
    error: eligible
      ? undefined
      : `badge check failed (highlighted=${String(highlighted)}, official=${String(official)})`,
  };
}

export async function validatePresetManifest(
  manifest,
  {
    presetRoot = PRESET_ROOT,
    fetchImpl = globalThis.fetch,
    timeoutMs = JURISHUB_SKILL_VALIDATION_TIMEOUT_MS,
    skipRemoteSkillValidation = false,
  } = {}
) {
  const seen = new Set();
  const errors = [];
  const officialHighlightedCache = new Map();

  for (const [index, item] of manifest.items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`items[${String(index)}] must be an object`);
      continue;
    }

    const kind = typeof item.kind === 'string' ? item.kind : '';
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const targetVersion = typeof item.targetVersion === 'string' ? item.targetVersion.trim() : '';
    const installMode =
      item.installMode === 'dir' || item.installMode === 'tgz' || item.installMode === 'market'
        ? item.installMode
        : undefined;
    const market = typeof item.market === 'string' ? item.market.trim() : '';
    const selection = typeof item.selection === 'string' ? item.selection.trim() : '';
    const artifactPath = typeof item.artifactPath === 'string' ? item.artifactPath.trim() : '';
    const sha256 = typeof item.sha256 === 'string' ? item.sha256.trim().toLowerCase() : '';

    if (kind !== 'skill' && kind !== 'plugin') {
      errors.push(`items[${String(index)}].kind must be skill|plugin`);
      continue;
    }
    if (!id) {
      errors.push(`items[${String(index)}].id is required`);
      continue;
    }
    if (!targetVersion) {
      errors.push(`items[${String(index)}](${kind}:${id}) missing targetVersion`);
      continue;
    }

    const dedupeKey = `${kind}:${id}`;
    if (seen.has(dedupeKey)) {
      errors.push(`duplicate item id: ${dedupeKey}`);
      continue;
    }
    seen.add(dedupeKey);

    const isMarketInstall = installMode === 'market';
    if (isMarketInstall) {
      if (kind !== 'skill') {
        errors.push(`items[${String(index)}](${dedupeKey}) installMode=market only supports kind=skill`);
        continue;
      }
      if (market !== 'jurismindhub') {
        errors.push(
          `items[${String(index)}](${dedupeKey}) installMode=market requires market=jurismindhub`
        );
        continue;
      }
      if (selection && selection !== 'official-highlighted') {
        errors.push(
          `items[${String(index)}](${dedupeKey}) installMode=market selection must be official-highlighted`
        );
        continue;
      }
      if (artifactPath || sha256) {
        errors.push(
          `items[${String(index)}](${dedupeKey}) installMode=market must not define artifactPath/sha256`
        );
        continue;
      }
    } else {
      if (!artifactPath) {
        errors.push(`items[${String(index)}](${dedupeKey}) missing artifactPath`);
        continue;
      }
      if (!sha256 || !/^[a-f0-9]{64}$/.test(sha256)) {
        errors.push(`items[${String(index)}](${dedupeKey}) has invalid sha256`);
        continue;
      }

      const resolvedPath = resolve(presetRoot, artifactPath);
      const rel = relative(presetRoot, resolvedPath);
      if (isAbsolute(rel) || rel.startsWith('..')) {
        errors.push(`items[${String(index)}](${dedupeKey}) artifactPath escapes preset root: ${artifactPath}`);
        continue;
      }
      if (!existsSync(resolvedPath)) {
        errors.push(`items[${String(index)}](${dedupeKey}) artifact not found: ${resolvedPath}`);
        continue;
      }

      let actualHash;
      try {
        actualHash = computeArtifactSha256(resolvedPath);
      } catch (error) {
        errors.push(`items[${String(index)}](${dedupeKey}) hash failed: ${String(error)}`);
        continue;
      }

      if (actualHash !== sha256) {
        errors.push(
          `items[${String(index)}](${dedupeKey}) sha256 mismatch: expected ${sha256}, actual ${actualHash}`
        );
        continue;
      }
    }

    if (kind !== 'skill') {
      continue;
    }

    if (skipRemoteSkillValidation) {
      continue;
    }

    if (isMarketInstall && selection === 'official-highlighted') {
      continue;
    }

    let officialHighlightedResult = officialHighlightedCache.get(id);
    if (!officialHighlightedResult) {
      officialHighlightedResult = await verifyJurishubOfficialHighlightedSkill(id, {
        fetchImpl,
        timeoutMs,
      });
      officialHighlightedCache.set(id, officialHighlightedResult);
    }
    if (!officialHighlightedResult.eligible) {
      errors.push(
        `items[${String(index)}](${dedupeKey}) JurisHub official+highlighted validation failed: ${officialHighlightedResult.error}. endpoint=${officialHighlightedResult.url}. fix hint: only JurisHub highlighted and official skills are allowed in preset manifest.`
      );
    }
  }

  return errors;
}

export async function runBundlePresetArtifacts(
  {
    manifestPath = MANIFEST_PATH,
    presetRoot = PRESET_ROOT,
    fetchImpl = globalThis.fetch,
    timeoutMs = JURISHUB_SKILL_VALIDATION_TIMEOUT_MS,
    skipRemoteSkillValidation = false,
  } = {}
) {
  const manifest = loadManifest(manifestPath);
  const errors = await validatePresetManifest(manifest, {
    presetRoot,
    fetchImpl,
    timeoutMs,
    skipRemoteSkillValidation,
  });
  return {
    manifest,
    errors,
  };
}

function isExecutedAsCli() {
  if (!process.argv[1]) {
    return false;
  }
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

async function main() {
  try {
    const skipRemoteSkillValidation = process.argv.includes(SKIP_REMOTE_SKILL_VALIDATION_ARG);
    const { manifest, errors } = await runBundlePresetArtifacts({
      skipRemoteSkillValidation,
    });
    if (errors.length > 0) {
      console.error('[bundle-preset-artifacts] validation failed:');
      for (const error of errors) {
        console.error(`- ${error}`);
      }
      process.exit(1);
    }
    console.log(
      `[bundle-preset-artifacts] validated ${String(manifest.items.length)} preset artifacts successfully${skipRemoteSkillValidation ? ' (remote skill validation skipped)' : ''}`
    );
  } catch (error) {
    fail(getErrorMessage(error));
  }
}

if (isExecutedAsCli()) {
  await main();
}
