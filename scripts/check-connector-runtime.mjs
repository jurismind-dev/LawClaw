#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const REQUIRED_FILES = [
  'connector-runtime/index.js',
  'connector-runtime/package.json',
  'connector-runtime/.env.example',
];

const missing = [];
const invalid = [];
const indexIssues = [];

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

function checkGitIndex() {
  try {
    const staged = execSync('git ls-files -s clawapp connector-runtime scripts/check-connector-runtime.mjs', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    if (/^160000\s+\S+\s+\d+\s+clawapp$/m.test(staged)) {
      indexIssues.push('Detected stale gitlink entry: clawapp (mode 160000). Run: git rm --cached clawapp');
    }
  } catch {
    // no-op: allow running outside git context
  }

  try {
    const legacyTracked = execSync(
      'git ls-files clawapp/connector/index.js clawapp/connector/package.json clawapp/connector/.env.example',
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    )
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (legacyTracked.length > 0) {
      indexIssues.push(
        `Legacy connector files must not be tracked in this repo: ${legacyTracked.join(', ')}`
      );
    }
  } catch {
    // no-op: allow running outside git context
  }
}

checkGitIndex();

if (missing.length > 0 || invalid.length > 0 || indexIssues.length > 0) {
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
  if (indexIssues.length > 0) {
    console.error('[connector-check] Repository index issues:');
    for (const item of indexIssues) {
      console.error(`  - ${item}`);
    }
  }
  process.exit(1);
}

console.log('[connector-check] OK: all required connector runtime files are present.');
