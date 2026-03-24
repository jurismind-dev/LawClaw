const { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { spawnSync } = require('child_process');

const TOP_LEVEL_NODE_MODULE_PATTERN = /^node_modules\/((?:@[^/]+\/)?[^/]+)$/;
const LOCKFILE_SKIP_PACKAGE_PREFIXES = ['@types/'];
const LOCKFILE_SKIP_PACKAGES = new Set(['typescript', '@playwright/test']);
const FEISHU_BUNDLED_PLUGIN_REQUIRED_RUNTIME_PATHS = [
  'package.json',
  'openclaw.plugin.json',
  'index.js',
  'node_modules/@larksuiteoapi/node-sdk/package.json',
  'node_modules/@sinclair/typebox/build/cjs/index.js',
  'node_modules/zod/package.json',
];

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
}

function parseJsonObject(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return asObject(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

function collectLockfileRootDependencies(packageDir) {
  const packageLock = parseJsonObject(join(packageDir, 'package-lock.json'));
  const packages = asObject(packageLock && packageLock.packages);
  if (!packages) {
    return {};
  }

  const entries = Object.entries(packages)
    .map(([lockPath, entry]) => {
      const match = lockPath.match(TOP_LEVEL_NODE_MODULE_PATTERN);
      const packageEntry = asObject(entry);
      if (!match || !match[1] || !packageEntry || typeof packageEntry.version !== 'string' || !packageEntry.version.trim()) {
        return null;
      }

      const packageName = match[1];
      if (
        LOCKFILE_SKIP_PACKAGES.has(packageName)
        || LOCKFILE_SKIP_PACKAGE_PREFIXES.some((prefix) => packageName.startsWith(prefix))
      ) {
        return null;
      }

      return [packageName, packageEntry.version.trim()];
    })
    .filter(Boolean);

  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

function hydratePluginManifestDependenciesFromLockfile(packageDir) {
  const manifestPath = join(packageDir, 'package.json');
  const manifest = parseJsonObject(manifestPath);
  if (!manifest) {
    throw new Error(`Plugin package manifest not found or invalid: ${manifestPath}`);
  }

  const existingDependencies = asObject(manifest.dependencies);
  if (existingDependencies && Object.keys(existingDependencies).length > 0) {
    return {
      changed: false,
      dependencyCount: Object.keys(existingDependencies).length,
    };
  }

  const lockfileDependencies = collectLockfileRootDependencies(packageDir);
  const dependencyNames = Object.keys(lockfileDependencies);
  if (dependencyNames.length === 0) {
    return {
      changed: false,
      dependencyCount: 0,
    };
  }

  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      ...manifest,
      dependencies: lockfileDependencies,
    }, null, 2)}\n`,
    'utf8'
  );

  return {
    changed: true,
    dependencyCount: dependencyNames.length,
  };
}

function sanitizePluginPackageManifestForLocalInstall(packageDir) {
  const manifestPath = join(packageDir, 'package.json');
  const manifest = parseJsonObject(manifestPath);
  if (!manifest) {
    throw new Error(`Plugin package manifest not found or invalid: ${manifestPath}`);
  }

  const dependencies = asObject(manifest.dependencies);
  if (!dependencies || Object.keys(dependencies).length === 0) {
    return { changed: false };
  }

  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      ...manifest,
      dependencies: {},
    }, null, 2)}\n`,
    'utf8'
  );

  return { changed: true };
}

function getBundledFeishuPluginMissingRuntimePaths(packageDir) {
  return FEISHU_BUNDLED_PLUGIN_REQUIRED_RUNTIME_PATHS
    .filter((relativePath) => !existsSync(join(packageDir, relativePath)));
}

function formatMissingRuntimePaths(missingPaths) {
  return missingPaths.map((entry) => `"${entry}"`).join(', ');
}

function runNpmInstall(packageDir, options = {}) {
  const args = ['install', '--omit=dev', '--omit=peer', '--silent', '--ignore-scripts'];
  const result = options.npmCliPath
    ? spawnSync(process.execPath, [options.npmCliPath, ...args], {
      cwd: packageDir,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
      cwd: packageDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const details = [result.stderr, result.stdout]
      .filter(Boolean)
      .join('\n')
      .trim();
    throw new Error(details || `npm install failed with exit code ${String(result.status)}`);
  }
}

function prepareBundledFeishuResourcePlugin(options) {
  const sourceDir = options.sourceDir;
  if (!existsSync(sourceDir)) {
    throw new Error(`Bundled Feishu resource plugin not found: ${sourceDir}`);
  }

  const tempDir = mkdtempSync(join(options.tmpRoot || tmpdir(), 'lawclaw-bundled-feishu-plugin-'));
  const preparedDir = join(tempDir, 'openclaw-lark');

  try {
    cpSync(sourceDir, preparedDir, { recursive: true, dereference: true });

    const missingPaths = getBundledFeishuPluginMissingRuntimePaths(preparedDir);
    if (missingPaths.length > 0) {
      const hydrated = hydratePluginManifestDependenciesFromLockfile(preparedDir);
      if (hydrated.dependencyCount === 0) {
        throw new Error('package-lock.json does not provide any installable runtime dependencies');
      }

      const nodeModulesDir = join(preparedDir, 'node_modules');
      if (existsSync(nodeModulesDir)) {
        rmSync(nodeModulesDir, { recursive: true, force: true });
      }

      if (typeof options.installDependencies === 'function') {
        options.installDependencies(preparedDir);
      } else {
        runNpmInstall(preparedDir, { npmCliPath: options.npmCliPath });
      }

      sanitizePluginPackageManifestForLocalInstall(preparedDir);

      const missingAfterInstall = getBundledFeishuPluginMissingRuntimePaths(preparedDir);
      if (missingAfterInstall.length > 0) {
        throw new Error(
          `Bundled Feishu plugin is still missing runtime files after install: ${formatMissingRuntimePaths(missingAfterInstall)}`
        );
      }
    }

    return {
      preparedDir,
      tempDir,
    };
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  FEISHU_BUNDLED_PLUGIN_REQUIRED_RUNTIME_PATHS,
  getBundledFeishuPluginMissingRuntimePaths,
  prepareBundledFeishuResourcePlugin,
};
