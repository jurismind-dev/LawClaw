#!/usr/bin/env zx

import 'zx/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT_DIR = path.resolve(__dirname, '..');
const PLUGIN_ID = 'feishu-openclaw-plugin';
const PACKAGE_NAME = '@larksuite/openclaw-lark';
const PLUGIN_VERSION = '2026.3.10';
const OUTPUT_DIR = path.join(ROOT_DIR, 'resources', 'plugins', PLUGIN_ID);

const force = Boolean(argv.force);

function sanitizeManifestDependencies(packageDir) {
  const manifestPath = path.join(packageDir, 'package.json');
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(raw);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`Invalid package.json at ${manifestPath}`);
  }

  if (!manifest.dependencies || typeof manifest.dependencies !== 'object' || Array.isArray(manifest.dependencies)) {
    return;
  }

  manifest.dependencies = {};
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

function removeIfExists(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function readInstalledVersion(packageDir) {
  const manifestPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return typeof manifest?.version === 'string' ? manifest.version : null;
  } catch {
    return null;
  }
}

if (!force && fs.existsSync(path.join(OUTPUT_DIR, 'node_modules'))) {
  const installedVersion = readInstalledVersion(OUTPUT_DIR);
  if (installedVersion === PLUGIN_VERSION) {
    echo(`[bundle-feishu-plugin] found existing offline bundle: ${OUTPUT_DIR}`);
    process.exit(0);
  }
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lawclaw-feishu-plugin-'));
const extractRoot = path.join(tempDir, 'extract');
const outputParentDir = path.dirname(OUTPUT_DIR);

await fs.promises.mkdir(extractRoot, { recursive: true });
await fs.promises.mkdir(outputParentDir, { recursive: true });

try {
  echo(`[bundle-feishu-plugin] packing ${PACKAGE_NAME}@${PLUGIN_VERSION}`);
  await $({ cwd: tempDir })`npm pack ${`${PACKAGE_NAME}@${PLUGIN_VERSION}`} --silent`;

  const archiveName = fs.readdirSync(tempDir).find((entry) => entry.endsWith('.tgz'));
  if (!archiveName) {
    throw new Error('npm pack produced no .tgz archive');
  }

  const archivePath = path.join(tempDir, archiveName);
  echo(`[bundle-feishu-plugin] extracting ${archiveName}`);
  await $({ cwd: tempDir })`tar -xzf ${archivePath} -C ${extractRoot}`;

  const extractedPackageDir = path.join(extractRoot, 'package');
  if (!fs.existsSync(path.join(extractedPackageDir, 'package.json'))) {
    throw new Error(`Extracted package.json missing: ${extractedPackageDir}`);
  }

  removeIfExists(OUTPUT_DIR);
  fs.cpSync(extractedPackageDir, OUTPUT_DIR, { recursive: true, dereference: true });

  echo('[bundle-feishu-plugin] installing runtime dependencies');
  await $({ cwd: OUTPUT_DIR })`npm install --omit=dev --omit=peer --silent --ignore-scripts`;

  sanitizeManifestDependencies(OUTPUT_DIR);

  removeIfExists(path.join(OUTPUT_DIR, 'package-lock.json'));
  removeIfExists(path.join(OUTPUT_DIR, 'npm-shrinkwrap.json'));

  echo(`[bundle-feishu-plugin] bundled ${PACKAGE_NAME}@${PLUGIN_VERSION} -> ${OUTPUT_DIR}`);
} finally {
  removeIfExists(tempDir);
}
