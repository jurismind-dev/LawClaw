const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const {
  parsePositiveIntEnv,
  pollNotarization,
  resolveDeveloperIdApplicationIdentity,
  resolveSubmissionId,
  run,
  runJson,
} = require('./macos-notary-utils.cjs');

function findMacArtifacts(rootDir) {
  const appPaths = [];
  const dmgPaths = [];
  const stack = [{ dir: rootDir, depth: 0 }];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current.dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.endsWith('.app')) {
          appPaths.push(fullPath);
          continue;
        }
        if (current.depth < 3) {
          stack.push({ dir: fullPath, depth: current.depth + 1 });
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.dmg')) {
        dmgPaths.push(fullPath);
      }
    }
  }

  return {
    appPaths: appPaths.sort(),
    dmgPaths: dmgPaths.sort(),
  };
}

module.exports = async function afterAllArtifactBuild(buildResult) {
  if (process.platform !== 'darwin') {
    return [];
  }

  const {
    buildNotarytoolAuthArgs,
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
    console.log('[after-all-artifact-build] macOS signing/notarization credentials not configured; skipping artifact verification.');
    return [];
  }

  const { appPaths, dmgPaths } = findMacArtifacts(buildResult.outDir);
  if (appPaths.length === 0) {
    throw new Error(`[after-all-artifact-build] No .app bundles found under ${buildResult.outDir}`);
  }

  for (const appPath of appPaths) {
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=1', appPath]);
    run('spctl', ['-a', '-vv', '-t', 'execute', appPath]);
    run('xcrun', ['stapler', 'validate', appPath]);
  }

  if (dmgPaths.length === 0) {
    throw new Error(`[after-all-artifact-build] No .dmg artifacts found under ${buildResult.outDir}`);
  }

  let appleApiKeyPath;
  if (state.mode === 'api-key') {
    appleApiKeyPath = await ensureAppleApiKeyPath(state.appleApiKey, state.appleApiKeyId);
  }

  const authArgs = buildNotarytoolAuthArgs(state, appleApiKeyPath);
  const timeoutMinutes = parsePositiveIntEnv('LAWCLAW_MAC_NOTARY_TIMEOUT_MINUTES', 60);
  const pollSeconds = parsePositiveIntEnv('LAWCLAW_MAC_NOTARY_POLL_SECONDS', 30);
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const intervalMs = pollSeconds * 1000;
  const signingIdentity = resolveDeveloperIdApplicationIdentity(appPaths[0], process.env, '[after-all-artifact-build]');

  for (const dmgPath of dmgPaths) {
    let submissionId = '';

    try {
      run('codesign', ['--force', '--sign', signingIdentity, '--timestamp', dmgPath]);
      run('codesign', ['--verify', '--verbose=1', dmgPath]);

      const submission = runJson('xcrun', [
        'notarytool',
        'submit',
        dmgPath,
        '--output-format',
        'json',
        ...authArgs,
      ], {}, '[after-all-artifact-build]');

      submissionId = resolveSubmissionId(submission);
      if (!submissionId) {
        throw new Error(`[after-all-artifact-build] Apple notarization response did not include a submission id for ${dmgPath}`);
      }

      console.log(`[after-all-artifact-build] DMG notary submission created for ${dmgPath}: ${submissionId}`);
      await pollNotarization(
        submissionId,
        authArgs,
        timeoutMs,
        intervalMs,
        '[after-all-artifact-build]'
      );

      run('xcrun', ['notarytool', 'log', submissionId, ...authArgs]);
      run('xcrun', ['stapler', 'staple', '-v', dmgPath]);
      run('xcrun', ['stapler', 'validate', dmgPath]);
      run('spctl', ['-a', '-vv', '-t', 'open', '--context', 'context:primary-signature', dmgPath]);
    } catch (error) {
      if (submissionId) {
        try {
          run('xcrun', ['notarytool', 'log', submissionId, ...authArgs]);
        } catch (logError) {
          console.warn(`[after-all-artifact-build] Failed to fetch notary log for ${submissionId}: ${logError.message}`);
        }
      }
      throw error;
    }
  }

  return [];
};
