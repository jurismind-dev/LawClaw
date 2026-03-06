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
export const JURISHUB_HIGHLIGHTED_SEARCH_BASE_URL = 'https://lawhub.jurismind.com/api/v1/search';
export const JURISHUB_HIGHLIGHTED_SEARCH_LIMIT = 20;
export const JURISHUB_HIGHLIGHTED_TIMEOUT_MS = 20_000;

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

export function buildJurishubHighlightedSearchUrl(skillId) {
  const url = new URL(JURISHUB_HIGHLIGHTED_SEARCH_BASE_URL);
  url.searchParams.set('q', skillId);
  url.searchParams.set('limit', String(JURISHUB_HIGHLIGHTED_SEARCH_LIMIT));
  url.searchParams.set('highlightedOnly', 'true');
  return url.toString();
}

export async function verifyJurishubHighlightedSkill(
  skillId,
  { fetchImpl = globalThis.fetch, timeoutMs = JURISHUB_HIGHLIGHTED_TIMEOUT_MS } = {}
) {
  const url = buildJurishubHighlightedSearchUrl(skillId);
  if (typeof fetchImpl !== 'function') {
    return {
      highlighted: false,
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
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutHandle);
    return {
      highlighted: false,
      url,
      error: `request failed: ${getErrorMessage(error)}`,
    };
  }
  clearTimeout(timeoutHandle);

  if (!response.ok) {
    return {
      highlighted: false,
      url,
      error: `HTTP ${String(response.status)} ${response.statusText || ''}`.trim(),
    };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    return {
      highlighted: false,
      url,
      error: `invalid JSON response: ${getErrorMessage(error)}`,
    };
  }

  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return {
      highlighted: false,
      url,
      error: 'invalid response shape: missing results[]',
    };
  }

  const highlighted = payload.results.some((entry) => isRecord(entry) && entry.slug === skillId);
  if (!highlighted) {
    return {
      highlighted: false,
      url,
      error: `slug "${skillId}" not found in highlighted results`,
    };
  }

  return {
    highlighted: true,
    url,
  };
}

export async function validatePresetManifest(
  manifest,
  {
    presetRoot = PRESET_ROOT,
    fetchImpl = globalThis.fetch,
    timeoutMs = JURISHUB_HIGHLIGHTED_TIMEOUT_MS,
  } = {}
) {
  const seen = new Set();
  const errors = [];
  const highlightedCache = new Map();

  for (const [index, item] of manifest.items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`items[${String(index)}] must be an object`);
      continue;
    }

    const kind = typeof item.kind === 'string' ? item.kind : '';
    const id = typeof item.id === 'string' ? item.id.trim() : '';
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

    const dedupeKey = `${kind}:${id}`;
    if (seen.has(dedupeKey)) {
      errors.push(`duplicate item id: ${dedupeKey}`);
      continue;
    }
    seen.add(dedupeKey);

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

    if (kind !== 'skill') {
      continue;
    }

    let highlightedResult = highlightedCache.get(id);
    if (!highlightedResult) {
      highlightedResult = await verifyJurishubHighlightedSkill(id, { fetchImpl, timeoutMs });
      highlightedCache.set(id, highlightedResult);
    }
    if (!highlightedResult.highlighted) {
      errors.push(
        `items[${String(index)}](${dedupeKey}) JurisHub highlighted validation failed: ${highlightedResult.error}. endpoint=${highlightedResult.url}. fix hint: only JurisHub highlighted skills are allowed in preset manifest.`
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
    timeoutMs = JURISHUB_HIGHLIGHTED_TIMEOUT_MS,
  } = {}
) {
  const manifest = loadManifest(manifestPath);
  const errors = await validatePresetManifest(manifest, { presetRoot, fetchImpl, timeoutMs });
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
    const { manifest, errors } = await runBundlePresetArtifacts();
    if (errors.length > 0) {
      console.error('[bundle-preset-artifacts] validation failed:');
      for (const error of errors) {
        console.error(`- ${error}`);
      }
      process.exit(1);
    }
    console.log(
      `[bundle-preset-artifacts] validated ${String(manifest.items.length)} preset artifacts successfully`
    );
  } catch (error) {
    fail(getErrorMessage(error));
  }
}

if (isExecutedAsCli()) {
  await main();
}
