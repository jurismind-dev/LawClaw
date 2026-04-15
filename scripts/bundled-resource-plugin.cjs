const { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { dirname, join } = require('path');
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
const RELATIVE_JS_IMPORT_PATTERN =
  /(from\s+['"])(\.\.?\/[^'"?#]+)(['"])|(import\s*\(\s*['"])(\.\.?\/[^'"?#]+)(['"]\s*\))/g;
const FEISHU_MONITOR_DYNAMIC_IMPORT =
  "const { monitorFeishuProvider } = await import('./monitor.js');";
const FEISHU_MONITOR_STATIC_IMPORT =
  "import { monitorFeishuProvider } from './monitor.js';";
const FEISHU_PLUGIN_SDK_IMPORT_REWRITES = [
  {
    relativePath: 'index.js',
    before: "import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';",
    after: "import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk/plugin-entry';",
  },
  {
    relativePath: 'src/channel/plugin.js',
    before: "import { DEFAULT_ACCOUNT_ID, PAIRING_APPROVED_MESSAGE } from 'openclaw/plugin-sdk';",
    after: [
      "import { DEFAULT_ACCOUNT_ID } from 'openclaw/plugin-sdk/account-id';",
      "import { PAIRING_APPROVED_MESSAGE } from 'openclaw/plugin-sdk/channel-status';",
    ].join('\n'),
  },
  {
    relativePath: 'src/channel/config-adapter.js',
    before: "import { DEFAULT_ACCOUNT_ID } from 'openclaw/plugin-sdk';",
    after: "import { DEFAULT_ACCOUNT_ID } from 'openclaw/plugin-sdk/account-id';",
  },
  {
    relativePath: 'src/channel/onboarding.js',
    before: "import { DEFAULT_ACCOUNT_ID, formatDocsLink } from 'openclaw/plugin-sdk';",
    after: [
      "import { DEFAULT_ACCOUNT_ID } from 'openclaw/plugin-sdk/account-id';",
      "import { formatDocsLink } from 'openclaw/plugin-sdk/setup-tools';",
    ].join('\n'),
  },
  {
    relativePath: 'src/channel/onboarding-config.js',
    before: "import { addWildcardAllowFrom } from 'openclaw/plugin-sdk';",
    after: "import { addWildcardAllowFrom } from 'openclaw/plugin-sdk/setup';",
  },
  {
    relativePath: 'src/core/accounts.js',
    before: "import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from 'openclaw/plugin-sdk';",
    after: "import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from 'openclaw/plugin-sdk/account-id';",
  },
  {
    relativePath: 'src/messaging/outbound/actions.js',
    before: "import { extractToolSend, jsonResult, readStringParam, readReactionParams } from 'openclaw/plugin-sdk';",
    after: [
      "import { jsonResult, readStringParam, readReactionParams } from 'openclaw/plugin-sdk/channel-actions';",
      "import { extractToolSend } from 'openclaw/plugin-sdk/tool-send';",
    ].join('\n'),
  },
  {
    relativePath: 'src/card/streaming-card-controller.js',
    before: "import { SILENT_REPLY_TOKEN } from 'openclaw/plugin-sdk';",
    after: "import { SILENT_REPLY_TOKEN } from 'openclaw/plugin-sdk/reply-runtime';",
  },
  {
    relativePath: 'src/card/reply-dispatcher.js',
    before: "import { createReplyPrefixContext, createTypingCallbacks, logTypingFailure, } from 'openclaw/plugin-sdk';",
    after: [
      "import { logTypingFailure } from 'openclaw/plugin-sdk/channel-feedback';",
      "import { createReplyPrefixContext, createTypingCallbacks } from 'openclaw/plugin-sdk/channel-reply-pipeline';",
    ].join('\n'),
  },
  {
    relativePath: 'src/messaging/inbound/handler.js',
    before: "import { recordPendingHistoryEntryIfEnabled, DEFAULT_GROUP_HISTORY_LIMIT, resolveSenderCommandAuthorization, isNormalizedSenderAllowed, } from 'openclaw/plugin-sdk';",
    after: [
      "import { isNormalizedSenderAllowed } from 'openclaw/plugin-sdk/allow-from';",
      "import { resolveSenderCommandAuthorization } from 'openclaw/plugin-sdk/command-auth';",
      "import { DEFAULT_GROUP_HISTORY_LIMIT, recordPendingHistoryEntryIfEnabled } from 'openclaw/plugin-sdk/reply-history';",
    ].join('\n'),
  },
  {
    relativePath: 'src/messaging/inbound/dispatch-builders.js',
    before: "import { buildPendingHistoryContextFromMap } from 'openclaw/plugin-sdk';",
    after: "import { buildPendingHistoryContextFromMap } from 'openclaw/plugin-sdk/reply-history';",
  },
  {
    relativePath: 'src/messaging/inbound/dispatch-context.js',
    before: "import { resolveThreadSessionKeys } from 'openclaw/plugin-sdk';",
    after: "import { resolveThreadSessionKeys } from 'openclaw/plugin-sdk/routing';",
  },
  {
    relativePath: 'src/messaging/inbound/dispatch.js',
    before: "import { clearHistoryEntriesIfEnabled } from 'openclaw/plugin-sdk';",
    after: "import { clearHistoryEntriesIfEnabled } from 'openclaw/plugin-sdk/reply-history';",
  },
  {
    relativePath: 'src/messaging/inbound/reaction-handler.js',
    before: "import { DEFAULT_GROUP_HISTORY_LIMIT } from 'openclaw/plugin-sdk';",
    after: "import { DEFAULT_GROUP_HISTORY_LIMIT } from 'openclaw/plugin-sdk/reply-history';",
  },
  {
    relativePath: 'src/tools/tat/im/resource.js',
    before: "import { buildRandomTempFilePath } from 'openclaw/plugin-sdk';",
    after: "import { buildRandomTempFilePath } from 'openclaw/plugin-sdk/temp-path';",
  },
  {
    relativePath: 'src/tools/oapi/im/resource.js',
    before: "import { buildRandomTempFilePath } from 'openclaw/plugin-sdk';",
    after: "import { buildRandomTempFilePath } from 'openclaw/plugin-sdk/temp-path';",
  },
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

function rewriteExtensionlessRelativeJsImports(filePath) {
  const original = readFileSync(filePath, 'utf8');
  let changed = false;
  const next = original.replace(
    RELATIVE_JS_IMPORT_PATTERN,
    (match, staticPrefix, staticSpec, staticSuffix, dynamicPrefix, dynamicSpec, dynamicSuffix) => {
      const spec = staticSpec || dynamicSpec;
      if (!spec || /\.[a-z0-9]+$/i.test(spec)) return match;

      const candidateJsPath = `${spec}.js`;
      if (!existsSync(join(dirname(filePath), candidateJsPath))) return match;

      changed = true;
      if (staticSpec) return `${staticPrefix}${candidateJsPath}${staticSuffix}`;
      return `${dynamicPrefix}${candidateJsPath}${dynamicSuffix}`;
    }
  );

  if (!changed) return false;
  writeFileSync(filePath, next, 'utf8');
  return true;
}

function normalizeFeishuPluginEsmImports(packageDir) {
  const srcDir = join(packageDir, 'src');
  if (!existsSync(srcDir)) return { changed: false, fileCount: 0 };

  let changed = false;
  let fileCount = 0;
  const stack = [srcDir, packageDir];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      if (rewriteExtensionlessRelativeJsImports(fullPath)) {
        changed = true;
        fileCount++;
      }
    }
  }

  return { changed, fileCount };
}

function patchFeishuGatewayMonitorImport(packageDir) {
  const pluginEntryPath = join(packageDir, 'src', 'channel', 'plugin.js');
  if (!existsSync(pluginEntryPath)) return false;

  const original = readFileSync(pluginEntryPath, 'utf8');
  if (!original.includes(FEISHU_MONITOR_DYNAMIC_IMPORT)) return false;

  let next = original.replace(FEISHU_MONITOR_DYNAMIC_IMPORT, '');
  if (!next.includes(FEISHU_MONITOR_STATIC_IMPORT)) {
    const anchor = "import { FEISHU_CONFIG_JSON_SCHEMA } from '../core/config-schema.js';";
    if (!next.includes(anchor)) {
      throw new Error(`Unable to patch Feishu plugin monitor import: anchor not found in ${pluginEntryPath}`);
    }
    next = next.replace(anchor, `${anchor}\n${FEISHU_MONITOR_STATIC_IMPORT}`);
  }

  writeFileSync(pluginEntryPath, next, 'utf8');
  return true;
}

function patchFeishuPluginSdkRootImports(packageDir) {
  let changed = false;
  let fileCount = 0;

  for (const rewrite of FEISHU_PLUGIN_SDK_IMPORT_REWRITES) {
    const filePath = join(packageDir, rewrite.relativePath);
    if (!existsSync(filePath)) continue;

    const original = readFileSync(filePath, 'utf8');
    if (!original.includes(rewrite.before)) continue;

    const next = original.replace(rewrite.before, rewrite.after);
    if (next === original) continue;

    writeFileSync(filePath, next, 'utf8');
    changed = true;
    fileCount++;
  }

  return { changed, fileCount };
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
    normalizeFeishuPluginEsmImports(preparedDir);
    patchFeishuGatewayMonitorImport(preparedDir);
    patchFeishuPluginSdkRootImports(preparedDir);

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
