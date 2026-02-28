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
 * Additionally, it removes unnecessary files (type definitions, source maps, docs)
 * to reduce the number of files that need to be code-signed on macOS.
 */

const { cpSync, existsSync, readdirSync, rmSync } = require('fs');
const { join } = require('path');

function getBundledUvPath(resourcesDir, platform) {
  const binName = platform === 'win32' ? 'uv.exe' : 'uv';
  return join(resourcesDir, 'bin', binName);
}

/**
 * Recursively remove unnecessary files to reduce code signing overhead
 */
function cleanupUnnecessaryFiles(dir) {
  let removedCount = 0;
  
  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        // Remove entire test directories
        if (entry.name === 'test' || entry.name === 'tests' || 
            entry.name === '__tests__' || entry.name === '.github' ||
            entry.name === 'docs' || entry.name === 'examples') {
          try {
            rmSync(fullPath, { recursive: true, force: true });
            removedCount++;
          } catch (err) {
            // Ignore errors
          }
        } else {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const name = entry.name;
        // Remove unnecessary file types
        if (name.endsWith('.d.ts') || name.endsWith('.d.ts.map') ||
            name.endsWith('.js.map') || name.endsWith('.mjs.map') ||
            name.endsWith('.ts.map') || name === '.DS_Store' ||
            name === 'README.md' || name === 'CHANGELOG.md' ||
            name === 'LICENSE.md' || name === 'CONTRIBUTING.md' ||
            name.endsWith('.md.txt') || name.endsWith('.markdown') ||
            name === 'tsconfig.json' || name === '.npmignore' ||
            name === '.eslintrc' || name === '.prettierrc') {
          try {
            rmSync(fullPath, { force: true });
            removedCount++;
          } catch (err) {
            // Ignore errors
          }
        }
      }
    }
  }
  
  walk(dir);
  return removedCount;
}

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const platform = context.electronPlatformName; // 'win32' | 'darwin' | 'linux'

  const src = join(__dirname, '..', 'build', 'openclaw', 'node_modules');

  // On macOS, resources live inside the .app bundle
  let resourcesDir;
  if (platform === 'darwin') {
    const appName = context.packager.appInfo.productFilename;
    resourcesDir = join(appOutDir, `${appName}.app`, 'Contents', 'Resources');
  } else {
    resourcesDir = join(appOutDir, 'resources');
  }

  const uvPath = getBundledUvPath(resourcesDir, platform);
  if (!existsSync(uvPath)) {
    const platformHint = platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : 'linux';
    throw new Error(
      `[after-pack] Missing bundled uv binary at ${uvPath}. Run "pnpm run uv:ensure:${platformHint}" before packaging.`
    );
  }

  const dest = join(resourcesDir, 'openclaw', 'node_modules');

  if (!existsSync(src)) {
    console.warn('[after-pack] ⚠️  build/openclaw/node_modules not found. Run "pnpm run bundle:openclaw" first.');
    return;
  }

  const depCount = readdirSync(src, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '.bin')
    .length;

  console.log(`[after-pack] Copying ${depCount} openclaw dependencies to ${dest} ...`);
  cpSync(src, dest, { recursive: true });
  console.log('[after-pack] ✅ openclaw node_modules copied successfully.');
  
  // Clean up unnecessary files to reduce code signing overhead (especially on macOS)
  console.log('[after-pack] 🧹 Cleaning up unnecessary files (type definitions, source maps, docs)...');
  const removedCount = cleanupUnnecessaryFiles(dest);
  console.log(`[after-pack] ✅ Removed ${removedCount} unnecessary files/directories.`);
};
