const { execFileSync } = require('node:child_process');
const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const { join } = require('node:path');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function run(command, args, options = {}) {
  console.log(`[after-sign] ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
}

function runJson(command, args, options = {}) {
  console.log(`[after-sign] ${command} ${args.join(' ')}`);
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    return JSON.parse(output);
  } catch (error) {
    if (typeof error?.stderr === 'string' && error.stderr) {
      process.stderr.write(error.stderr);
    }
    throw error;
  }
}

function resolveSubmissionId(result) {
  if (!result || typeof result !== 'object') {
    return '';
  }

  return result.id || result.submissionId || result.uuid || '';
}

async function pollNotarization(submissionId, authArgs, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    const info = runJson('xcrun', [
      'notarytool',
      'info',
      submissionId,
      '--output-format',
      'json',
      ...authArgs,
    ]);

    const status = String(info.status || info.statusSummary || 'unknown');
    console.log(`[after-sign] Notary status (${attempt}): ${status}`);

    if (status === 'Accepted') {
      return info;
    }

    if (status === 'Invalid' || status === 'Rejected') {
      throw new Error(`Apple notarization failed with status: ${status}`);
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for Apple notarization after ${Math.round(timeoutMs / 60000)} minutes.`);
}

exports.default = async function afterSign(context) {
  if (process.platform !== 'darwin' || context.electronPlatformName !== 'darwin') {
    return;
  }

  const {
    buildNotarytoolAuthArgs,
    ensureAppleApiKeyPath,
    resolveMacSigningState,
  } = await import('./macos-signing-utils.mjs');

  const state = resolveMacSigningState(process.env);
  if (state.warnings.length > 0) {
    for (const warning of state.warnings) {
      console.warn(`[after-sign] ${warning}`);
    }
  }

  if (state.errors.length > 0) {
    throw new Error(state.errors.join('\n'));
  }

  if (!state.enabled) {
    console.log('[after-sign] macOS signing/notarization credentials not configured; skipping notarization.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = join(context.appOutDir, `${appName}.app`);
  if (!existsSync(appPath)) {
    throw new Error(`[after-sign] Expected signed app bundle at ${appPath}`);
  }

  let appleApiKeyPath;
  if (state.mode === 'api-key') {
    appleApiKeyPath = await ensureAppleApiKeyPath(
      state.appleApiKey,
      state.appleApiKeyId,
      join(os.tmpdir(), 'lawclaw-apple-api-key')
    );
  }

  const authArgs = buildNotarytoolAuthArgs(state, appleApiKeyPath);
  const timeoutMinutes = parsePositiveIntEnv('LAWCLAW_MAC_NOTARY_TIMEOUT_MINUTES', 60);
  const pollSeconds = parsePositiveIntEnv('LAWCLAW_MAC_NOTARY_POLL_SECONDS', 30);
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const intervalMs = pollSeconds * 1000;

  const tempDir = mkdtempSync(join(os.tmpdir(), 'lawclaw-notary-'));
  const zipPath = join(tempDir, `${appName}.zip`);
  let submissionId = '';

  try {
    run('ditto', [
      '-c',
      '-k',
      '--sequesterRsrc',
      '--keepParent',
      `${appName}.app`,
      zipPath,
    ], {
      cwd: context.appOutDir,
    });

    const submission = runJson('xcrun', [
      'notarytool',
      'submit',
      zipPath,
      '--output-format',
      'json',
      ...authArgs,
    ]);

    submissionId = resolveSubmissionId(submission);
    if (!submissionId) {
      throw new Error('[after-sign] Apple notarization response did not include a submission id.');
    }

    console.log(`[after-sign] Notary submission created: ${submissionId}`);
    await pollNotarization(submissionId, authArgs, timeoutMs, intervalMs);

    run('xcrun', ['notarytool', 'log', submissionId, ...authArgs]);
    run('xcrun', ['stapler', 'staple', '-v', appPath]);
    run('xcrun', ['stapler', 'validate', appPath]);
  } catch (error) {
    if (submissionId) {
      try {
        run('xcrun', ['notarytool', 'log', submissionId, ...authArgs]);
      } catch (logError) {
        console.warn(`[after-sign] Failed to fetch notary log for ${submissionId}: ${logError.message}`);
      }
    }
    console.error(`[after-sign] ${error.message}`);
    throw error;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};
