#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const BLOCKED_TERM = process.env.BRAND_SCAN_TERM || 'ClawX';

const SCAN_TARGETS = [
  'src/i18n',
  'src/pages',
  'electron/main',
  'README.md',
  'README.zh-CN.md',
  'PRODUCT_SPECIFICATION.md',
  '.github/workflows',
  'scripts',
];

const IGNORED_FILES = new Set(['scripts/brand-scan.mjs']);

const ALLOWLIST = [
  { path: /^README\.md$/, line: /ValueCell-ai\/ClawX/ },
  { path: /^README\.md$/, line: /Based on.*ClawX/ },
  { path: /^README\.md$/, line: /The upstream project this is based on.*ClawX/ },
  { path: /^README\.md$/, line: /<a href="https:\/\/github\.com\/ValueCell-ai\/ClawX">ClawX<\/a>/ },
  { path: /^README\.md$/, line: /^cd ClawX$/ },
  { path: /^README\.zh-CN\.md$/, line: /ValueCell-ai\/ClawX/ },
  { path: /^README\.zh-CN\.md$/, line: /基于项目.*ClawX/ },
  { path: /^README\.zh-CN\.md$/, line: /上游基础.*ClawX/ },
  { path: /^README\.zh-CN\.md$/, line: /<a href="https:\/\/github\.com\/ValueCell-ai\/ClawX">ClawX<\/a>/ },
  { path: /^README\.zh-CN\.md$/, line: /^cd ClawX$/ },
  { path: /^PRODUCT_SPECIFICATION\.md$/, line: /基于项目.*ClawX/ },
  { path: /^PRODUCT_SPECIFICATION\.md$/, line: /上游 ClawX/ },
  { path: /^src\/pages\/Settings\/index\.tsx$/, line: /ValueCell-ai\/ClawX/ },
  { path: /^electron\/main\/menu\.ts$/, line: /ValueCell-ai\/ClawX\/issues/ },
  { path: /^scripts\/linux\/after-install\.sh$/, line: /\/opt\/ClawX\/clawx/ },
];

async function listFiles(targetPath) {
  const absolutePath = path.join(PROJECT_ROOT, targetPath);
  const stat = await fs.stat(absolutePath);
  if (stat.isFile()) return [targetPath];

  const files = [];

  async function walk(currentRelativePath) {
    const currentAbsolutePath = path.join(PROJECT_ROOT, currentRelativePath);
    const entries = await fs.readdir(currentAbsolutePath, { withFileTypes: true });
    for (const entry of entries) {
      const nextRelativePath = path.join(currentRelativePath, entry.name);
      if (entry.isDirectory()) {
        await walk(nextRelativePath);
        continue;
      }
      if (entry.isFile()) files.push(nextRelativePath.replace(/\\/g, '/'));
    }
  }

  await walk(targetPath);
  return files;
}

function isAllowed(file, line) {
  return ALLOWLIST.some((rule) => rule.path.test(file) && rule.line.test(line.trim()));
}

async function run() {
  const allFiles = [];
  for (const target of SCAN_TARGETS) {
    try {
      const files = await listFiles(target);
      allFiles.push(...files);
    } catch (error) {
      console.error(`[brand-scan] Failed to scan target "${target}":`, error);
      process.exit(1);
    }
  }

  const findings = [];

  for (const file of allFiles) {
    if (IGNORED_FILES.has(file)) continue;
    const content = await fs.readFile(path.join(PROJECT_ROOT, file), 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (!line.includes(BLOCKED_TERM)) return;
      if (isAllowed(file, line)) return;
      findings.push({
        file,
        line: index + 1,
        text: line.trim(),
      });
    });
  }

  if (findings.length === 0) {
    console.log(`[brand-scan] OK: no disallowed "${BLOCKED_TERM}" found.`);
    return;
  }

  console.error(`[brand-scan] Found ${findings.length} disallowed "${BLOCKED_TERM}" occurrence(s):`);
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.text}`);
  }
  process.exit(1);
}

run().catch((error) => {
  console.error('[brand-scan] Unexpected error:', error);
  process.exit(1);
});
