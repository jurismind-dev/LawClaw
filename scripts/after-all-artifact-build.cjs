const { execFileSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');

function run(command, args) {
  console.log(`[after-all-artifact-build] ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    stdio: 'inherit',
  });
}

function findAppBundles(rootDir) {
  const result = [];
  const stack = [{ dir: rootDir, depth: 0 }];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current.dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const fullPath = join(current.dir, entry.name);
      if (entry.name.endsWith('.app')) {
        result.push(fullPath);
        continue;
      }
      if (current.depth < 3) {
        stack.push({ dir: fullPath, depth: current.depth + 1 });
      }
    }
  }

  return result.sort();
}

module.exports = async function afterAllArtifactBuild(buildResult) {
  if (process.platform !== 'darwin') {
    return [];
  }

  const {
    resolveMacSigningState,
  } = await import('./macos-signing-utils.mjs');

  const state = resolveMacSigningState(process.env);
  if (state.warnings.length > 0) {
    for (const warning of state.warnings) {
      console.warn(`[after-all-artifact-build] ${warning}`);
    }
  }

  if (state.errors.length > 0) {
    throw new Error(state.errors.join('\n'));
  }

  if (!state.enabled) {
    console.log('[after-all-artifact-build] macOS signing/notarization credentials not configured; skipping artifact verification.');
    return [];
  }

  const appPaths = findAppBundles(buildResult.outDir);

  for (const appPath of appPaths) {
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
    run('spctl', ['-a', '-vv', '-t', 'execute', appPath]);
    run('xcrun', ['stapler', 'validate', appPath]);
  }

  return [];
};
