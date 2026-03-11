#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const PRESET_ROOT = join(ROOT_DIR, 'resources', 'preset-installs');
const MANIFEST_PATH = join(PRESET_ROOT, 'manifest.json');
const JURISHUB_CONVEX_QUERY_URL = 'https://convex-api-lawhub.jurismind.com/api/query';
const DEFAULT_LIMIT = 2000;
const REQUEST_TIMEOUT_MS = 20_000;

function fail(message) {
  console.error(`[sync-jurismind-preset-skills] ${message}`);
  process.exit(1);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseCliArgs(argv) {
  const result = {
    presetVersion: '',
    limit: DEFAULT_LIMIT,
    dryRun: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }
    if (arg.startsWith('--preset-version=')) {
      result.presetVersion = arg.slice('--preset-version='.length).trim();
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const value = Number.parseInt(arg.slice('--limit='.length), 10);
      if (Number.isFinite(value) && value > 0) {
        result.limit = value;
      }
      continue;
    }
  }

  return result;
}

function nextPresetVersion(currentVersion) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yyyy}.${mm}.${dd}`;
  const match = /^(\d{4}\.\d{2}\.\d{2})\.(\d+)$/.exec(currentVersion || '');

  if (!match || match[1] !== datePart) {
    return `${datePart}.1`;
  }

  const currentCounter = Number.parseInt(match[2], 10);
  if (!Number.isFinite(currentCounter) || currentCounter < 1) {
    return `${datePart}.1`;
  }
  return `${datePart}.${String(currentCounter + 1)}`;
}

async function fetchOfficialHighlightedSkills(limit) {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('fetch is not available in this Node.js runtime');
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(JURISHUB_CONVEX_QUERY_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: 'skills:listHighlightedPublic',
        args: { limit },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    throw new Error(`JurisHub query failed: HTTP ${String(response.status)} ${response.statusText || ''}`.trim());
  }

  const payload = await response.json();
  if (!isRecord(payload) || payload.status !== 'success' || !Array.isArray(payload.value)) {
    throw new Error('JurisHub query response format invalid');
  }

  const resultMap = new Map();
  for (const entry of payload.value) {
    if (!isRecord(entry) || !isRecord(entry.skill)) {
      continue;
    }
    const skill = entry.skill;
    const badges = isRecord(skill.badges) ? skill.badges : {};
    const highlighted = Boolean(badges.highlighted);
    const official = Boolean(badges.official);
    if (!highlighted || !official) {
      continue;
    }

    const slug = typeof skill.slug === 'string' ? skill.slug.trim() : '';
    const displayName = typeof skill.displayName === 'string' ? skill.displayName.trim() : '';
    const version = isRecord(entry.latestVersion) && typeof entry.latestVersion.version === 'string'
      ? entry.latestVersion.version.trim()
      : '';
    if (!slug || !version) {
      continue;
    }

    resultMap.set(slug, {
      kind: 'skill',
      id: slug,
      displayName: displayName || slug,
      targetVersion: version,
      installMode: 'market',
      market: 'jurismindhub',
    });
  }

  return Array.from(resultMap.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function loadManifest() {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.items)) {
    throw new Error(`Invalid manifest format: ${MANIFEST_PATH}`);
  }
  return raw;
}

async function main() {
  const args = parseCliArgs(process.argv);
  const manifest = loadManifest();
  const remoteSkills = await fetchOfficialHighlightedSkills(args.limit);
  if (remoteSkills.length === 0) {
    throw new Error('No official+highlighted JurisHub skills were found');
  }

  const preservedPluginItems = manifest.items.filter(
    (item) => isRecord(item) && item.kind === 'plugin'
  );

  const nextVersion = args.presetVersion || nextPresetVersion(
    typeof manifest.presetVersion === 'string' ? manifest.presetVersion : ''
  );

  const nextManifest = {
    schemaVersion: 1,
    presetVersion: nextVersion,
    items: [...remoteSkills, ...preservedPluginItems],
  };

  if (!args.dryRun) {
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf-8');
  }

  const pluginCount = preservedPluginItems.length;
  const mode = args.dryRun ? 'DRY RUN' : 'UPDATED';
  console.log(
    `[sync-jurismind-preset-skills] ${mode} manifest (${MANIFEST_PATH}) with ${String(remoteSkills.length)} official+highlighted skill(s), ${String(pluginCount)} plugin preset(s), presetVersion=${nextVersion}`
  );
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
