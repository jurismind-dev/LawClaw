const { execFileSync } = require('node:child_process');
const os = require('node:os');
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

function getNotarytoolAuthArgs(state, appleApiKeyPath) {
  switch (state.mode) {
    case 'apple-id':
      return [
        '--apple-id',
        state.appleId,
        '--password',
        state.appleIdPassword,
        '--team-id',
        state.teamId,
      ];
    case 'api-key':
      return [
        '--key',
        appleApiKeyPath,
        '--key-id',
        state.appleApiKeyId,
        '--issuer',
        state.appleApiIssuer,
      ];
    case 'keychain': {
      const args = ['--keychain-profile', state.keychainProfile];
      if (state.keychain) {
        args.push('--keychain', state.keychain);
      }
      return args;
    }
    default:
      throw new Error(`Unsupported notarization mode: ${state.mode}`);
  }
}

module.exports = async function afterAllArtifactBuild(buildResult) {
  if (process.platform !== 'darwin') {
    return [];
  }

  if (buildResult?.configuration?.mac?.notarize === false) {
    console.log('[after-all-artifact-build] macOS notarization disabled in build config; skipping artifact verification.');
    return [];
  }

  const {
    ensureAppleApiKeyPath,
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
    console.log('[after-all-artifact-build] macOS signing/notarization credentials not configured; skipping DMG notarization.');
    return [];
  }

  let appleApiKeyPath;
  if (state.mode === 'api-key') {
    appleApiKeyPath = await ensureAppleApiKeyPath(
      state.appleApiKey,
      state.appleApiKeyId,
      join(os.tmpdir(), 'lawclaw-apple-api-key')
    );
  }

  const notarytoolAuthArgs = getNotarytoolAuthArgs(state, appleApiKeyPath);
  const artifactPaths = Array.isArray(buildResult?.artifactPaths) ? buildResult.artifactPaths : [];
  const dmgPaths = artifactPaths.filter((artifactPath) => artifactPath.endsWith('.dmg')).sort();
  const appPaths = findAppBundles(buildResult.outDir);

  for (const appPath of appPaths) {
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
    run('spctl', ['-a', '-vv', '-t', 'execute', appPath]);
    run('xcrun', ['stapler', 'validate', appPath]);
  }

  for (const dmgPath of dmgPaths) {
    run('xcrun', ['notarytool', 'submit', dmgPath, '--wait', ...notarytoolAuthArgs]);
    run('xcrun', ['stapler', 'staple', '-v', dmgPath]);
    run('xcrun', ['stapler', 'validate', dmgPath]);
    run('spctl', ['-a', '-vv', '-t', 'open', dmgPath]);
  }

  return [];
};
