#!/usr/bin/env zx

import 'zx/globals';

const ROOT_DIR = path.resolve(__dirname, '..');
const PLUGIN_NAME = '@sliverp/qqbot';
const PLUGIN_VERSION = '1.5.0';
const OUTPUT_DIR = path.join(ROOT_DIR, 'resources', 'plugins', 'qqbot');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'qqbot-1.5.0.tgz');

const force = Boolean(argv.force);

if (!force && await fs.pathExists(OUTPUT_FILE)) {
  echo(`[bundle-qq-plugin] found existing package: ${OUTPUT_FILE}`);
  process.exit(0);
}

await fs.ensureDir(OUTPUT_DIR);

const packagePath = encodeURIComponent(PLUGIN_NAME).replace('%40', '@');
const metadataUrl = `https://registry.npmjs.org/${packagePath}/${PLUGIN_VERSION}`;

echo(`[bundle-qq-plugin] fetching metadata: ${metadataUrl}`);
const metadataResponse = await fetch(metadataUrl);
if (!metadataResponse.ok) {
  throw new Error(`Failed to fetch metadata: HTTP ${metadataResponse.status}`);
}

const metadata = await metadataResponse.json();
const tarballUrl = metadata?.dist?.tarball;
if (!tarballUrl || typeof tarballUrl !== 'string') {
  throw new Error('Invalid npm metadata: missing dist.tarball');
}

echo(`[bundle-qq-plugin] downloading tarball: ${tarballUrl}`);
const tarballResponse = await fetch(tarballUrl);
if (!tarballResponse.ok) {
  throw new Error(`Failed to download tarball: HTTP ${tarballResponse.status}`);
}

const tarballBuffer = Buffer.from(await tarballResponse.arrayBuffer());
await fs.writeFile(OUTPUT_FILE, tarballBuffer);

echo(`[bundle-qq-plugin] bundled ${PLUGIN_NAME}@${PLUGIN_VERSION} -> ${OUTPUT_FILE}`);
