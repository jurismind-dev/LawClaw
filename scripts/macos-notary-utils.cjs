const { execFileSync, spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { homedir, tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

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

function parseUserKeychains(securityOutput) {
  if (typeof securityOutput !== 'string' || !securityOutput) {
    return [];
  }

  return securityOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^"|"$/g, ''));
}

function resolveCertificateFile(certificateLink, currentDir, tempDir) {
  const trimmed = typeof certificateLink === 'string' ? certificateLink.trim() : '';
  if (!trimmed) {
    throw new Error('Missing CSC_LINK or MAC_CERTS for temporary Developer ID keychain setup.');
  }

  let filePath = '';
  if ((trimmed.length > 3 && trimmed[1] === ':') || trimmed.startsWith('/') || trimmed.startsWith('.')) {
    filePath = trimmed;
  } else if (trimmed.startsWith('file://')) {
    filePath = trimmed.slice('file://'.length);
  } else if (trimmed.startsWith('~/')) {
    filePath = join(homedir(), trimmed.slice(2));
  } else {
    const mimeType = /data:.*;base64,/.exec(trimmed)?.[0];
    if (mimeType || trimmed.length > 2048 || trimmed.endsWith('=')) {
      const outputPath = join(tempDir, 'developer-id-application.p12');
      writeFileSync(
        outputPath,
        Buffer.from(trimmed.slice(mimeType ? mimeType.length : 0), 'base64')
      );
      return outputPath;
    }

    throw new Error(
      'Temporary Developer ID keychain setup only supports local/file/base64 CSC_LINK or MAC_CERTS values.'
    );
  }

  const resolvedPath = resolve(currentDir, filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`${resolvedPath} doesn't exist`);
  }

  const stats = statSync(resolvedPath);
  if (!stats.isFile()) {
    throw new Error(`${resolvedPath} not a file`);
  }

  return resolvedPath;
}

function createTemporaryDeveloperIdApplicationKeychain(
  env = process.env,
  options = {}
) {
  const logPrefix = options.logPrefix || '[macos-notary]';
  const currentDir = options.currentDir || process.cwd();
  const certificateLink = env.CSC_LINK || env.MAC_CERTS || '';
  const certificatePassword = env.CSC_KEY_PASSWORD ?? env.MAC_CERTS_PASSWORD;

  if (!certificateLink) {
    throw new Error('Missing CSC_LINK or MAC_CERTS for temporary Developer ID keychain setup.');
  }

  if (certificatePassword === undefined) {
    throw new Error(
      'Missing CSC_KEY_PASSWORD or MAC_CERTS_PASSWORD for temporary Developer ID keychain setup.'
    );
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'lawclaw-codesign-'));
  const keychainFile = join(tempDir, 'lawclaw-signing.keychain-db');
  const keychainPassword = String(certificatePassword);
  let keychainCreated = false;

  const cleanup = () => {
    try {
      if (keychainCreated) {
        run('security', ['delete-keychain', keychainFile], {}, logPrefix);
      }
    } catch (error) {
      console.warn(
        `${logPrefix} Failed to delete temporary keychain ${keychainFile}: ${error.message}`
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  };

  try {
    const certificateFile = resolveCertificateFile(certificateLink, currentDir, tempDir);
    const existingKeychains = parseUserKeychains(
      runText('security', ['list-keychains', '-d', 'user'], {}, logPrefix)
    );

    run('security', ['create-keychain', '-p', keychainPassword, keychainFile], {}, logPrefix);
    keychainCreated = true;
    run('security', ['unlock-keychain', '-p', keychainPassword, keychainFile], {}, logPrefix);
    run('security', ['set-keychain-settings', keychainFile], {}, logPrefix);

    if (!existingKeychains.includes(keychainFile)) {
      run(
        'security',
        ['list-keychains', '-d', 'user', '-s', keychainFile, ...existingKeychains],
        {},
        logPrefix
      );
    }

    run(
      'security',
      [
        'import',
        certificateFile,
        '-k',
        keychainFile,
        '-T',
        '/usr/bin/codesign',
        '-T',
        '/usr/bin/productbuild',
        '-P',
        keychainPassword,
      ],
      {},
      logPrefix
    );
    run(
      'security',
      [
        'set-key-partition-list',
        '-S',
        'apple-tool:,apple:',
        '-s',
        '-k',
        keychainPassword,
        keychainFile,
      ],
      {},
      logPrefix
    );

    return {
      keychainFile,
      cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

function resolveDeveloperIdApplicationIdentity(
  appPath,
  env = process.env,
  logPrefix = '[macos-notary]',
  options = {}
) {
  const runTextImpl = options.runTextImpl || runText;
  const keychainFile = options.keychainFile || env.CSC_KEYCHAIN || '';
  const codesignOutput = runTextImpl('codesign', ['-dv', '--verbose=4', appPath], {}, logPrefix);
  const teamIdentifier = parseTeamIdentifier(codesignOutput);
  const findIdentityArgs = ['find-identity', '-v', '-p', 'codesigning'];
  if (keychainFile) {
    findIdentityArgs.push(keychainFile);
  }

  const securityOutput = runTextImpl('security', findIdentityArgs, {}, logPrefix);
  const candidates = findDeveloperIdApplicationIdentities(securityOutput);
  return selectDeveloperIdApplicationIdentity({
    candidates,
    cscName: env.CSC_NAME,
    teamIdentifier,
  });
}

module.exports = {
  createTemporaryDeveloperIdApplicationKeychain,
  findDeveloperIdApplicationIdentities,
  parsePositiveIntEnv,
  parseTeamIdentifier,
  parseUserKeychains,
  pollNotarization,
  resolveDeveloperIdApplicationIdentity,
  resolveSubmissionId,
  run,
  runJson,
  runText,
  selectDeveloperIdApplicationIdentity,
};
