const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { basename, dirname, extname, isAbsolute, join, relative } = require('node:path');

function readEnv(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : '';
}

function requireEnv(name) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`[racent-sign] Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveSignToolPath() {
  return readEnv('RACENT_SIGNTOOL_PATH') || join(process.cwd(), 'signtool', 'signtool.exe');
}

function timestampArgs() {
  const timestampUrl = readEnv('RACENT_TIMESTAMP_URL') || 'http://timestamp.sectigo.com';
  const rfc3161TimestampUrl = readEnv('RACENT_TIMESTAMP_RFC3161_URL') || timestampUrl;
  return ['--timestamp', timestampUrl, '--timestamp-rfc3161', rfc3161TimestampUrl];
}

function buildSignArgs(inputPath, outputPath) {
  return [
    'sign',
    '-k',
    requireEnv('SIGNTOOL_ACCESS_KEY'),
    '-s',
    requireEnv('SIGNTOOL_ACCESS_SECRET'),
    '-c',
    requireEnv('SIGNTOOL_CERT_CODE'),
    '-f',
    inputPath,
    '-o',
    outputPath,
    '--nest=true',
    '--sha1=false',
    '--sha2=true',
    ...timestampArgs(),
  ];
}

function redactArgs(args) {
  return args.map((arg, index) => {
    const previous = index > 0 ? args[index - 1] : '';
    if (previous === '-k' || previous === '-s') {
      return '***';
    }
    return /\s/.test(String(arg)) ? `"${arg}"` : String(arg);
  });
}

async function sign(configuration) {
  const srcPath = configuration.path;
  const cwd = process.cwd();
  const relPath = relative(cwd, srcPath);
  const signToolPath = resolveSignToolPath();

  if (isAbsolute(signToolPath) && !existsSync(signToolPath)) {
    throw new Error(`[racent-sign] SignTool not found: ${signToolPath}`);
  }

  const dir = dirname(srcPath);
  const ext = extname(srcPath);
  const name = basename(srcPath, ext);
  const tempPath = join(dir, `${name}-${randomBytes(4).toString('hex')}${ext}`);
  const logDir = join(cwd, 'signtool');
  const logFilePath = join(logDir, `${name}.log`);
  const args = buildSignArgs(tempPath, srcPath);

  mkdirSync(logDir, { recursive: true });
  writeFileSync(logFilePath, `Source: ${srcPath}\nTime: ${new Date().toISOString()}\n\n`);

  console.log(`[racent-sign] Signing ${relPath}`);
  console.log(`[racent-sign] Command: ${signToolPath} ${redactArgs(args).join(' ')}`);
  console.log(`[racent-sign] Log: ${relative(cwd, logFilePath)}`);

  let sourceMoved = false;
  const logFd = openSync(logFilePath, 'a');
  const startedAt = Date.now();

  try {
    // Racent SignTool does not overwrite the input file. Move the original
    // aside and ask SignTool to write the signed file back to the original path.
    renameSync(srcPath, tempPath);
    sourceMoved = true;

    execFileSync(signToolPath, args, {
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    });

    sourceMoved = false;
    rmSync(tempPath, { force: true });

    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    console.log(`[racent-sign] Signed ${relPath} in ${durationSeconds}s`);
  } catch (error) {
    if (sourceMoved && !existsSync(srcPath) && existsSync(tempPath)) {
      renameSync(tempPath, srcPath);
    }

    console.error(`[racent-sign] Failed to sign ${relPath}`);
    console.error(`[racent-sign] Check log: ${relative(cwd, logFilePath)}`);
    throw error;
  } finally {
    closeSync(logFd);
  }
}

module.exports = sign;
module.exports.default = sign;
