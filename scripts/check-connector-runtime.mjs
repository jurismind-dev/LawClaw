#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_FILES = [
  'clawapp/connector/index.js',
  'clawapp/connector/package.json',
  'clawapp/connector/.env.example',
];

const missing = [];
const invalid = [];

for (const relPath of REQUIRED_FILES) {
  const fullPath = resolve(process.cwd(), relPath);
  if (!existsSync(fullPath)) {
    missing.push(relPath);
    continue;
  }

  try {
    const stat = statSync(fullPath);
    if (!stat.isFile() || stat.size <= 0) {
      invalid.push(relPath);
    }
  } catch {
    invalid.push(relPath);
  }
}

if (missing.length > 0 || invalid.length > 0) {
  console.error('[connector-check] Jurismind connector runtime validation failed.');
  if (missing.length > 0) {
    console.error('[connector-check] Missing files:');
    for (const item of missing) {
      console.error(`  - ${item}`);
    }
  }
  if (invalid.length > 0) {
    console.error('[connector-check] Invalid files (empty or unreadable):');
    for (const item of invalid) {
      console.error(`  - ${item}`);
    }
  }
  process.exit(1);
}

console.log('[connector-check] OK: all required connector runtime files are present.');
