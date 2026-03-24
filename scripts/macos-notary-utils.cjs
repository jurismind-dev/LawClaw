const { execFileSync, spawnSync } = require('node:child_process');

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

function run(command, args, options = {}, logPrefix = '[macos-notary]') {
  console.log(`${logPrefix} ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
}

function runJson(command, args, options = {}, logPrefix = '[macos-notary]') {
  console.log(`${logPrefix} ${command} ${args.join(' ')}`);
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

function runText(command, args, options = {}, logPrefix = '[macos-notary]') {
  console.log(`${logPrefix} ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  if (result.status !== 0) {
    if (stdout) {
      process.stdout.write(stdout);
    }
    if (stderr) {
      process.stderr.write(stderr);
    }
    throw new Error(`${command} exited with code ${result.status ?? 'unknown'}`);
  }

  return `${stdout}${stderr}`;
}

function resolveSubmissionId(result) {
  if (!result || typeof result !== 'object') {
    return '';
  }

  return result.id || result.submissionId || result.uuid || '';
}

async function pollNotarization(submissionId, authArgs, timeoutMs, intervalMs, logPrefix = '[macos-notary]') {
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
    ], {}, logPrefix);

    const status = String(info.status || info.statusSummary || 'unknown');
    console.log(`${logPrefix} Notary status (${attempt}): ${status}`);

    if (status === 'Accepted') {
      return info;
    }

    if (status === 'Invalid' || status === 'Rejected') {
      throw new Error(`Apple notarization failed with status: ${status}`);
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out waiting for Apple notarization after ${Math.round(timeoutMs / 60000)} minutes.`
  );
}

function parseTeamIdentifier(codesignOutput) {
  if (typeof codesignOutput !== 'string' || !codesignOutput) {
    return '';
  }

  const match = codesignOutput.match(/^\s*TeamIdentifier=(.+)\s*$/m);
  return match ? match[1].trim() : '';
}

function findDeveloperIdApplicationIdentities(securityOutput) {
  if (typeof securityOutput !== 'string' || !securityOutput) {
    return [];
  }

  const matches = securityOutput.matchAll(/"([^"\n]*Developer ID Application:[^"\n]+)"/g);
  return Array.from(matches, (match) => match[1].trim());
}

function selectDeveloperIdApplicationIdentity({ candidates, cscName, teamIdentifier }) {
  const explicitName = typeof cscName === 'string' ? cscName.trim() : '';
  if (explicitName) {
    return explicitName;
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('No Developer ID Application signing identity found in keychain.');
  }

  if (teamIdentifier) {
    const matchingTeam = candidates.filter((candidate) => candidate.includes(`(${teamIdentifier})`));
    if (matchingTeam.length === 1) {
      return matchingTeam[0];
    }
    if (matchingTeam.length > 1) {
      throw new Error(
        `Multiple Developer ID Application identities matched team ${teamIdentifier}: ${matchingTeam.join(', ')}`
      );
    }
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  throw new Error(
    `Multiple Developer ID Application identities found; set CSC_NAME explicitly: ${candidates.join(', ')}`
  );
}

function resolveDeveloperIdApplicationIdentity(appPath, env = process.env, logPrefix = '[macos-notary]') {
  const codesignOutput = runText('codesign', ['-dv', '--verbose=4', appPath], {}, logPrefix);
  const teamIdentifier = parseTeamIdentifier(codesignOutput);
  const securityOutput = runText('security', ['find-identity', '-v', '-p', 'codesigning'], {}, logPrefix);
  const candidates = findDeveloperIdApplicationIdentities(securityOutput);
  return selectDeveloperIdApplicationIdentity({
    candidates,
    cscName: env.CSC_NAME,
    teamIdentifier,
  });
}

module.exports = {
  findDeveloperIdApplicationIdentities,
  parsePositiveIntEnv,
  parseTeamIdentifier,
  pollNotarization,
  resolveDeveloperIdApplicationIdentity,
  resolveSubmissionId,
  run,
  runJson,
  runText,
  selectDeveloperIdApplicationIdentity,
};
