/**
 * after-pack.cjs
 *
 * electron-builder afterPack hook.
 *
 * Problem: electron-builder respects .gitignore when copying extraResources.
 * Since .gitignore contains "node_modules/", the openclaw bundle's
 * node_modules directory is silently skipped during the extraResources copy.
 *
 * Solution: This hook runs AFTER electron-builder finishes packing. It manually
 * copies build/openclaw/node_modules/ into the output resources directory,
 * bypassing electron-builder's glob filtering entirely.
 *
 * Additionally it performs two rounds of cleanup:
 *   1. General cleanup — removes dev artifacts (type defs, source maps, docs,
 *      test dirs) from both the openclaw root and its node_modules.
 *   2. Platform-specific cleanup — strips native binaries for non-target
 *      platforms (koffi multi-platform prebuilds, @napi-rs/canvas, @img/sharp,
 *      @mariozechner/clipboard).
 */

const { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync, chmodSync } = require('fs');
const { basename, dirname, join } = require('path');
const {
  patchOpenClawBundleCompat,
  patchOpenClawWebSearchRuntime,
  patchOpenClawWindowsSpawnRuntime,
} = require('./openclaw-bundle-compat.cjs');

function getBundledUvPath(resourcesDir, platform) {
  const binName = platform === 'win32' ? 'uv.exe' : 'uv';
  return join(resourcesDir, 'bin', binName);
}

// On Windows, pnpm virtual store paths can exceed MAX_PATH.
function normWin(p) {
  if (process.platform !== 'win32') return p;
  if (p.startsWith('\\\\?\\')) return p;
  return '\\\\?\\' + p.replace(/\//g, '\\');
}

function realpathSafe(p) {
  try {
    return realpathSync(p);
  } catch (err) {
    if (process.platform !== 'win32') throw err;
    return realpathSync(normWin(p));
  }
}

function resolveArch(arch) {
  if (typeof arch === 'string') return arch;
  const archMap = {
    0: 'ia32',
    1: 'x64',
    2: 'armv7l',
    3: 'arm64',
    4: 'universal',
  };
  return archMap[arch] || String(arch);
}

function hasNpmCliDir(pkgDir) {
  return existsSync(join(pkgDir, 'bin', 'npm-cli.js')) && existsSync(join(pkgDir, 'bin', 'npx-cli.js'));
}

function resolveHostNpmPackageDir() {
  const nodeExecDir = dirname(process.execPath);
  const candidates = [
    join(nodeExecDir, 'node_modules', 'npm'),
    join(nodeExecDir, '..', 'lib', 'node_modules', 'npm'),
    join(dirname(nodeExecDir), 'lib', 'node_modules', 'npm'),
    join('/usr/local', 'lib', 'node_modules', 'npm'),
    join('/opt/homebrew', 'lib', 'node_modules', 'npm'),
  ];

  for (const candidate of candidates) {
    if (hasNpmCliDir(candidate)) {
      return candidate;
    }
  }

  return null;
}

function bundleWindowsNpmRuntime(appOutDir) {
  const sourceDir = resolveHostNpmPackageDir();
  if (!sourceDir) {
    throw new Error(
      '[after-pack] Unable to locate the host npm package. Windows plugin installation will fall back to npm.cmd and fail.'
    );
  }

  const destDir = join(appOutDir, 'node_modules', 'npm');
  if (existsSync(normWin(destDir))) {
    rmSync(normWin(destDir), { recursive: true, force: true });
  }

  mkdirSync(normWin(dirname(destDir)), { recursive: true });
  cpSync(normWin(sourceDir), normWin(destDir), { recursive: true, dereference: true });
  const removedCount = cleanupUnnecessaryFiles(destDir);
  console.log(
    `[after-pack] ✅ Bundled npm runtime for Windows: ${sourceDir} -> ${destDir} (removed ${removedCount} extra files).`
  );
}

function createPosixNpmWrapper(appName, cliScriptName) {
  return `#!/bin/sh
set -eu

BASEDIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
RESOURCES_DIR="$(CDPATH= cd -- "$BASEDIR/.." && pwd)"
NPM_CLI_JS="$RESOURCES_DIR/npm-runtime/node_modules/npm/bin/${cliScriptName}"

if [ ! -f "$NPM_CLI_JS" ]; then
  echo "Bundled npm runtime not found: $NPM_CLI_JS" >&2
  exit 1
fi

case "$(uname)" in
  Darwin)
    NODE_EXE="$RESOURCES_DIR/../Frameworks/${appName} Helper.app/Contents/MacOS/${appName} Helper"
    ;;
  *)
    NODE_EXE="$RESOURCES_DIR/../${appName}"
    ;;
esac

if [ ! -x "$NODE_EXE" ]; then
  NODE_EXE=node
fi

export ELECTRON_RUN_AS_NODE=1
exec "$NODE_EXE" "$NPM_CLI_JS" "$@"
`;
}

function bundlePosixNpmRuntime(resourcesDir, appName) {
  const sourceDir = resolveHostNpmPackageDir();
  if (!sourceDir) {
    throw new Error('[after-pack] Unable to locate the host npm package for the bundled POSIX runtime.');
  }

  const runtimeDir = join(resourcesDir, 'npm-runtime', 'node_modules', 'npm');
  if (existsSync(runtimeDir)) {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
  mkdirSync(dirname(runtimeDir), { recursive: true });
  cpSync(sourceDir, runtimeDir, { recursive: true, dereference: true });
  const removedCount = cleanupUnnecessaryFiles(runtimeDir);

  const wrapperDir = join(resourcesDir, 'npm-bin');
  mkdirSync(wrapperDir, { recursive: true });

  for (const [filename, cliScriptName] of [['npm', 'npm-cli.js'], ['npx', 'npx-cli.js']]) {
    const wrapperPath = join(wrapperDir, filename);
    writeFileSync(wrapperPath, createPosixNpmWrapper(appName, cliScriptName), 'utf8');
    chmodSync(wrapperPath, 0o755);
  }

  console.log(
    `[after-pack] ✅ Bundled npm runtime for POSIX: ${sourceDir} -> ${runtimeDir} (removed ${removedCount} extra files).`
  );
}

/**
 * Recursively remove unnecessary files to reduce code signing overhead
 */
function cleanupUnnecessaryFiles(dir) {
  let removedCount = 0;

  const REMOVE_DIRS = new Set([
    'test', 'tests', '__tests__', '.github', 'examples', 'example',
  ]);
  const REMOVE_FILE_EXTS = ['.d.ts', '.d.ts.map', '.js.map', '.mjs.map', '.ts.map', '.markdown'];
  const REMOVE_FILE_NAMES = new Set([
    '.DS_Store', 'README.md', 'CHANGELOG.md', 'LICENSE.md', 'CONTRIBUTING.md',
    'tsconfig.json', '.npmignore', '.eslintrc', '.prettierrc', '.editorconfig',
  ]);

  function walk(currentDir) {
    let entries;
    try { entries = readdirSync(currentDir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (REMOVE_DIRS.has(entry.name)) {
          try { rmSync(fullPath, { recursive: true, force: true }); removedCount++; } catch { /* */ }
        } else {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const name = entry.name;
        if (REMOVE_FILE_NAMES.has(name) || REMOVE_FILE_EXTS.some(e => name.endsWith(e))) {
          try { rmSync(fullPath, { force: true }); removedCount++; } catch { /* */ }
        }
      }
    }
  }

  walk(dir);
  return removedCount;
}

function removeBundledPluginNodeBins(resourcesPayloadDir) {
  const pluginsRoot = join(resourcesPayloadDir, 'plugins');
  if (!existsSync(pluginsRoot)) return 0;

  let removed = 0;
  let entries;
  try {
    entries = readdirSync(pluginsRoot, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const binDir = join(pluginsRoot, entry.name, 'node_modules', '.bin');
    if (!existsSync(normWin(binDir))) continue;
    try {
      rmSync(normWin(binDir), { recursive: true, force: true });
      removed++;
    } catch (error) {
      console.warn(`[after-pack] Failed to remove bundled plugin node_modules/.bin at ${binDir}: ${error.message}`);
    }
  }

  return removed;
}

function hasNodeModulesBinSegment(pathParts) {
  for (let index = 0; index < pathParts.length; index++) {
    if (pathParts[index] === '.bin') {
      return true;
    }
  }
  return false;
}

function normalizeFsPathForMatch(filePath) {
  return filePath
    .replace(/^\\\\\?\\/, '')
    .replace(/\\/g, '/');
}

function shouldCopyBundledPluginPath(sourceRoot, sourcePath) {
  const normalizedRoot = normalizeFsPathForMatch(sourceRoot);
  const normalizedSource = normalizeFsPathForMatch(sourcePath);
  const relative = normalizedSource.slice(normalizedRoot.length).replace(/^[\\/]+/, '');
  if (!relative) return true;

  const parts = relative.split(/[\\/]+/).filter(Boolean);
  return !hasNodeModulesBinSegment(parts);
}

function copyBundledResourcePlugin(sourceDir, destDir) {
  if (!existsSync(sourceDir)) {
    console.warn(`[after-pack] ⚠️  Bundled resource plugin not found: ${sourceDir}`);
    return false;
  }

  if (existsSync(normWin(destDir))) {
    rmSync(normWin(destDir), { recursive: true, force: true });
  }

  mkdirSync(normWin(dirname(destDir)), { recursive: true });
  cpSync(normWin(sourceDir), normWin(destDir), {
    recursive: true,
    dereference: true,
    filter: (sourcePath) => shouldCopyBundledPluginPath(sourceDir, sourcePath),
  });
  return true;
}

function removeBundledResourcePlugin(resourcesPayloadDir, pluginId) {
  const pluginDir = join(resourcesPayloadDir, 'plugins', pluginId);
  if (!existsSync(normWin(pluginDir))) return false;

  try {
    rmSync(normWin(pluginDir), { recursive: true, force: true });
    return true;
  } catch (error) {
    console.warn(`[after-pack] Failed to remove bundled resource plugin mirror at ${pluginDir}: ${error.message}`);
    return false;
  }
}

// ── Platform-specific: koffi ─────────────────────────────────────────────────
// koffi ships 18 platform pre-builds under koffi/build/koffi/{platform}_{arch}/.
// We only need the one matching the target.

function cleanupKoffi(nodeModulesDir, platform, arch) {
  const koffiDir = join(nodeModulesDir, 'koffi', 'build', 'koffi');
  if (!existsSync(koffiDir)) return 0;

  const keepTarget = `${platform}_${arch}`;
  let removed = 0;
  for (const entry of readdirSync(koffiDir)) {
    if (entry !== keepTarget) {
      try { rmSync(join(koffiDir, entry), { recursive: true, force: true }); removed++; } catch { /* */ }
    }
  }
  return removed;
}

// ── Platform-specific: scoped native packages ────────────────────────────────
// Packages like @napi-rs/canvas-darwin-arm64, @img/sharp-linux-x64, etc.
// Only the variant matching the target platform should survive.

const PLATFORM_NATIVE_SCOPES = {
  '@napi-rs': /^canvas-(darwin|linux|win32)-(x64|arm64)/,
  '@img': /^sharp(?:-libvips)?-(darwin|linux|win32)-(x64|arm64)/,
  '@mariozechner': /^clipboard-(darwin|linux|win32)-(x64|arm64|universal)/,
};

function cleanupNativePlatformPackages(nodeModulesDir, platform, arch) {
  let removed = 0;

  for (const [scope, pattern] of Object.entries(PLATFORM_NATIVE_SCOPES)) {
    const scopeDir = join(nodeModulesDir, scope);
    if (!existsSync(scopeDir)) continue;

    for (const entry of readdirSync(scopeDir)) {
      const match = entry.match(pattern);
      if (!match) continue; // not a platform-specific package, leave it

      const pkgPlatform = match[1];
      const pkgArch = match[2];

      const isMatch =
        pkgPlatform === platform &&
        (pkgArch === arch || pkgArch === 'universal');

      if (!isMatch) {
        try {
          rmSync(join(scopeDir, entry), { recursive: true, force: true });
          removed++;
        } catch { /* */ }
      }
    }
  }

  return removed;
}

// ── Plugin bundler ───────────────────────────────────────────────────────────
// Bundles a single OpenClaw plugin (and its transitive deps) from node_modules
// directly into the packaged resources directory.  Mirrors the logic in
// bundle-openclaw-plugins.mjs so the packaged app is self-contained even when
// build/openclaw-plugins/ was not pre-generated.

function getVirtualStoreNodeModules(realPkgPath) {
  let dir = realPkgPath;
  while (dir !== dirname(dir)) {
    if (basename(dir) === 'node_modules') return dir;
    dir = dirname(dir);
  }
  return null;
}

function listPkgs(nodeModulesDir) {
  const result = [];
  const nDir = normWin(nodeModulesDir);
  if (!existsSync(nDir)) return result;
  for (const entry of readdirSync(nDir)) {
    if (entry === '.bin') continue;
    // Use original (non-normWin) join for the logical path stored in result.fullPath,
    // so callers can still call getVirtualStoreNodeModules() on it correctly.
    const fullPath = join(nodeModulesDir, entry);
    if (entry.startsWith('@')) {
      let subs;
      try { subs = readdirSync(normWin(fullPath)); } catch { continue; }
      for (const sub of subs) {
        result.push({ name: `${entry}/${sub}`, fullPath: join(fullPath, sub) });
      }
    } else {
      result.push({ name: entry, fullPath });
    }
  }
  return result;
}

function bundlePlugin(nodeModulesRoot, npmName, destDir) {
  const pkgPath = join(nodeModulesRoot, ...npmName.split('/'));
  if (!existsSync(pkgPath)) {
    console.warn(`[after-pack] ⚠️  Plugin package not found: ${pkgPath}. Run pnpm install.`);
    return false;
  }

  let realPluginPath;
  try { realPluginPath = realpathSafe(pkgPath); } catch { realPluginPath = pkgPath; }

  // Copy plugin package itself
  if (existsSync(normWin(destDir))) rmSync(normWin(destDir), { recursive: true, force: true });
  mkdirSync(normWin(destDir), { recursive: true });
  cpSync(normWin(realPluginPath), normWin(destDir), { recursive: true, dereference: true });

  // Collect transitive deps via pnpm virtual store BFS
  const collected = new Map();
  const queue = [];

  const rootVirtualNM = getVirtualStoreNodeModules(realPluginPath);
  if (!rootVirtualNM) {
    console.warn(`[after-pack] ⚠️  Could not find virtual store for ${npmName}, skipping deps.`);
    return true;
  }
  queue.push({ nodeModulesDir: rootVirtualNM, skipPkg: npmName });

  // Read peerDependencies from the plugin's package.json so we don't bundle
  // packages that are provided by the host environment (e.g. openclaw itself).
  const SKIP_PACKAGES = new Set(['typescript', '@playwright/test']);
  const SKIP_SCOPES = ['@types/'];
  try {
    const pluginPkg = JSON.parse(readFileSync(join(destDir, 'package.json'), 'utf8'));
    for (const peer of Object.keys(pluginPkg.peerDependencies || {})) {
      SKIP_PACKAGES.add(peer);
    }
  } catch { /* ignore */ }

  while (queue.length > 0) {
    const { nodeModulesDir, skipPkg } = queue.shift();
    for (const { name, fullPath } of listPkgs(nodeModulesDir)) {
      if (name === skipPkg) continue;
      if (SKIP_PACKAGES.has(name) || SKIP_SCOPES.some(s => name.startsWith(s))) continue;
      let rp;
      try { rp = realpathSafe(fullPath); } catch { continue; }
      if (collected.has(rp)) continue;
      collected.set(rp, name);
      const depVirtualNM = getVirtualStoreNodeModules(rp);
      if (depVirtualNM && depVirtualNM !== nodeModulesDir) {
        queue.push({ nodeModulesDir: depVirtualNM, skipPkg: name });
      }
    }
  }

  // Copy flattened deps into destDir/node_modules
  const destNM = join(destDir, 'node_modules');
  mkdirSync(destNM, { recursive: true });
  const copiedNames = new Set();
  let count = 0;
  for (const [rp, pkgName] of collected) {
    if (copiedNames.has(pkgName)) continue;
    copiedNames.add(pkgName);
    const d = join(destNM, pkgName);
    try {
      mkdirSync(normWin(dirname(d)), { recursive: true });
      cpSync(normWin(rp), normWin(d), { recursive: true, dereference: true });
      count++;
    } catch (e) {
      console.warn(`[after-pack]   Skipped dep ${pkgName}: ${e.message}`);
    }
  }
  console.log(`[after-pack] ✅ Plugin ${npmName}: copied ${count} deps to ${destDir}`);
  return true;
}

// ── Main hook ────────────────────────────────────────────────────────────────

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const platform = context.electronPlatformName; // 'win32' | 'darwin' | 'linux'
  const arch = resolveArch(context.arch);
  const appName = context.packager.appInfo.productFilename;

  console.log(`[after-pack] Target: ${platform}/${arch}`);

  let resourcesDir;
  if (platform === 'darwin') {
    resourcesDir = join(appOutDir, `${appName}.app`, 'Contents', 'Resources');
  } else {
    resourcesDir = join(appOutDir, 'resources');
  }

  if (platform === 'win32') {
    bundleWindowsNpmRuntime(appOutDir);
  } else if (platform === 'darwin' || platform === 'linux') {
    bundlePosixNpmRuntime(resourcesDir, appName);
  }

  const uvPath = getBundledUvPath(resourcesDir, platform);
  if (!existsSync(uvPath)) {
    const platformHint = platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : 'linux';
    throw new Error(
      `[after-pack] Missing bundled uv binary at ${uvPath}. Run "pnpm run uv:ensure:${platformHint}" before packaging.`
    );
  }

  const src = join(__dirname, '..', 'build', 'openclaw', 'node_modules');
  const openclawRoot = join(resourcesDir, 'openclaw');
  const dest = join(openclawRoot, 'node_modules');
  const nodeModulesRoot = join(__dirname, '..', 'node_modules');
  const pluginsDestRoot = join(resourcesDir, 'openclaw-plugins');
  const bundledResourcesRoot = join(resourcesDir, 'resources');

  if (!existsSync(src)) {
    console.warn('[after-pack] ⚠️  build/openclaw/node_modules not found. Run bundle-openclaw first.');
    return;
  }

  // 1. Copy node_modules (electron-builder skips it due to .gitignore)
  const depCount = readdirSync(src, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '.bin')
    .length;

  mkdirSync(openclawRoot, { recursive: true });
  console.log(`[after-pack] Copying ${depCount} openclaw dependencies to ${dest} ...`);
  cpSync(src, dest, { recursive: true });
  console.log('[after-pack] ✅ openclaw node_modules copied.');

  const patchedRuntimeFiles = patchOpenClawWebSearchRuntime(openclawRoot);
  if (patchedRuntimeFiles.length > 0) {
    console.log(
      `[after-pack] ✅ Patched OpenClaw doubao web_search runtime: ${patchedRuntimeFiles.join(', ')}.`
    );
  }

  const patchedWindowsSpawnFiles = patchOpenClawWindowsSpawnRuntime(openclawRoot);
  if (patchedWindowsSpawnFiles.length > 0) {
    console.log(
      `[after-pack] ✅ Patched OpenClaw Windows spawn runtime: ${patchedWindowsSpawnFiles.join(', ')}.`
    );
  }

  const requireCompatPackages = patchOpenClawBundleCompat(dest);
  if (requireCompatPackages.length > 0) {
    console.log(
      `[after-pack] ✅ Patched require() compatibility for bundled packages: ${requireCompatPackages.join(', ')}.`
    );
  }

  // 1.1 Bundle OpenClaw plugins directly from node_modules into packaged resources.
  //     This is intentionally done in afterPack (not extraResources) because:
  //     - electron-builder silently skips extraResources entries whose source
  //       directory doesn't exist (build/openclaw-plugins/ may not be pre-generated)
  //     - node_modules/ is excluded by .gitignore so the deps copy must be manual
  const BUNDLED_PLUGINS = [
    { npmName: '@soimy/dingtalk', pluginId: 'dingtalk' },
  ];

  if (!existsSync(nodeModulesRoot)) {
    console.warn(`[after-pack] ⚠️  node_modules not found at ${nodeModulesRoot}, skipping plugin bundling.`);
  } else {
    mkdirSync(pluginsDestRoot, { recursive: true });
    for (const { npmName, pluginId } of BUNDLED_PLUGINS) {
      const pluginDestDir = join(pluginsDestRoot, pluginId);
      console.log(`[after-pack] Bundling plugin ${npmName} -> ${pluginDestDir}`);
      const ok = bundlePlugin(nodeModulesRoot, npmName, pluginDestDir);
      if (ok) {
        const pluginNM = join(pluginDestDir, 'node_modules');
        cleanupUnnecessaryFiles(pluginDestDir);
        if (existsSync(pluginNM)) {
          cleanupKoffi(pluginNM, platform, arch);
          cleanupNativePlatformPackages(pluginNM, platform, arch);
        }
      }
    }
  }

  const resourceBundledPlugins = [
    { pluginId: 'openclaw-lark', sourceDir: join(__dirname, '..', 'resources', 'plugins', 'openclaw-lark') },
  ];

  mkdirSync(pluginsDestRoot, { recursive: true });
  for (const { pluginId, sourceDir } of resourceBundledPlugins) {
    const pluginDestDir = join(pluginsDestRoot, pluginId);
    console.log(`[after-pack] Bundling resource plugin ${pluginId} -> ${pluginDestDir}`);
    const ok = copyBundledResourcePlugin(sourceDir, pluginDestDir);
    if (!ok) continue;

    cleanupUnnecessaryFiles(pluginDestDir);
    const pluginNM = join(pluginDestDir, 'node_modules');
    if (existsSync(pluginNM)) {
      cleanupKoffi(pluginNM, platform, arch);
      cleanupNativePlatformPackages(pluginNM, platform, arch);
    }
  }

  // 2. General cleanup on the full openclaw directory (not just node_modules)
  console.log('[after-pack] 🧹 Cleaning up unnecessary files ...');
  const removedRoot = cleanupUnnecessaryFiles(openclawRoot);
  console.log(`[after-pack] ✅ Removed ${removedRoot} unnecessary files/directories.`);

  let removedBundledPluginMirrors = 0;
  if (removeBundledResourcePlugin(bundledResourcesRoot, 'openclaw-lark')) {
    removedBundledPluginMirrors++;
  }
  if (removedBundledPluginMirrors > 0) {
    console.log(`[after-pack] ✅ Removed ${removedBundledPluginMirrors} duplicated bundled plugin resource mirrors.`);
  }

  const removedPluginBins = removeBundledPluginNodeBins(bundledResourcesRoot);
  if (removedPluginBins > 0) {
    console.log(`[after-pack] ✅ Removed ${removedPluginBins} bundled plugin node_modules/.bin directories.`);
  }

  // 3. Platform-specific: strip koffi non-target platform binaries
  const koffiRemoved = cleanupKoffi(dest, platform, arch);
  if (koffiRemoved > 0) {
    console.log(`[after-pack] ✅ koffi: removed ${koffiRemoved} non-target platform binaries (kept ${platform}_${arch}).`);
  }

  // 4. Platform-specific: strip wrong-platform native packages
  const nativeRemoved = cleanupNativePlatformPackages(dest, platform, arch);
  if (nativeRemoved > 0) {
    console.log(`[after-pack] ✅ Removed ${nativeRemoved} non-target native platform packages.`);
  }
};
