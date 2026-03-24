#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  FEISHU_BUNDLED_PLUGIN_REQUIRED_RUNTIME_PATHS,
} = require('./bundled-resource-plugin.cjs');

function findBundledPluginDirs(rootDir) {
  const matches = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const fullPath = join(currentDir, entry.name);
      const normalized = fullPath.replace(/\\/g, '/');
      if (normalized.endsWith('/openclaw-plugins/openclaw-lark')) {
        matches.push(fullPath);
        continue;
      }

      walk(fullPath);
    }
  }

  walk(rootDir);
  return matches.sort();
}

function getMissingRuntimePaths(packageDir) {
  return FEISHU_BUNDLED_PLUGIN_REQUIRED_RUNTIME_PATHS
    .filter((relativePath) => !existsSync(join(packageDir, relativePath)));
}

const rootDir = resolve(process.argv[2] || 'release');
if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
  console.error(`[feishu-plugin-check] Release directory not found: ${rootDir}`);
  process.exit(1);
}

const pluginDirs = findBundledPluginDirs(rootDir);
if (pluginDirs.length === 0) {
  console.error(`[feishu-plugin-check] No packaged openclaw-lark runtime found under ${rootDir}`);
  process.exit(1);
}

const failures = [];
for (const pluginDir of pluginDirs) {
  const missing = getMissingRuntimePaths(pluginDir);
  if (missing.length > 0) {
    failures.push(`${pluginDir}: ${missing.map((entry) => `"${entry}"`).join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error('[feishu-plugin-check] Packaged Feishu plugin runtime validation failed.');
  for (const failure of failures) {
    console.error(`[feishu-plugin-check] ${failure}`);
  }
  process.exit(1);
}

console.log(`[feishu-plugin-check] OK: validated ${pluginDirs.length} packaged openclaw-lark runtime director${pluginDirs.length === 1 ? 'y' : 'ies'}.`);
