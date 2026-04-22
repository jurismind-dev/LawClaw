#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function resolveStorePath() {
  const envPath = process.env.LAWCLAW_PROVIDER_STORE_PATH?.trim();
  if (envPath) {
    return envPath;
  }

  const home = homedir();
  const candidates = process.platform === 'win32'
    ? [
      join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'LawClaw', 'clawx-providers.json'),
      join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'lawclaw', 'clawx-providers.json'),
      join(home, '.LawClaw', 'clawx-providers.json'),
    ]
    : process.platform === 'darwin'
      ? [
        join(home, 'Library', 'Application Support', 'LawClaw', 'clawx-providers.json'),
        join(home, 'Library', 'Application Support', 'lawclaw', 'clawx-providers.json'),
        join(home, '.LawClaw', 'clawx-providers.json'),
      ]
      : [
        join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'LawClaw', 'clawx-providers.json'),
        join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'lawclaw', 'clawx-providers.json'),
        join(home, '.LawClaw', 'clawx-providers.json'),
      ];

  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

function parseArgs(argv) {
  const options = {
    format: 'json',
    envNamesOnly: false,
  };

  for (const arg of argv) {
    if (arg === '--export') options.format = 'export';
    else if (arg === '--cmd') options.format = 'cmd';
    else if (arg === '--powershell') options.format = 'powershell';
    else if (arg === '--json') options.format = 'json';
    else if (arg === '--path') options.format = 'path';
    else if (arg === '--env-names') options.envNamesOnly = true;
  }

  return options;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, `''`)}'`;
}

function cmdQuote(value) {
  return String(value).replace(/"/g, '""');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const options = parseArgs(process.argv.slice(2));
const storePath = resolveStorePath();

if (options.format === 'path') {
  console.log(storePath);
  process.exit(0);
}

if (!existsSync(storePath)) {
  fail(`LawClaw provider store not found: ${storePath}`);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(storePath, 'utf-8'));
} catch (error) {
  fail(`Failed to parse provider store: ${String(error)}`);
}

const binding = parsed?.jurismindSsoBinding;
if (!binding || typeof binding !== 'object' || !String(binding.openId || '').trim()) {
  fail('jurismindSsoBinding not found. Please complete Jurismind SSO binding first.');
}

const payload = {
  openId: String(binding.openId || ''),
  token: typeof binding.token === 'string' ? binding.token : '',
  tokenKey: typeof binding.tokenKey === 'string' ? binding.tokenKey : '',
  tokenId: binding.tokenId ?? null,
  avatar: typeof binding.avatar === 'string' ? binding.avatar : '',
  updatedAt: typeof binding.updatedAt === 'string' ? binding.updatedAt : '',
};

if (options.envNamesOnly) {
  console.log('JURISMIND_OPENID');
  console.log('JURISMIND_TOKEN');
  console.log('JURISMIND_TOKEN_KEY');
  console.log('JURISMIND_TOKEN_ID');
  console.log('JURISMIND_AVATAR');
  process.exit(0);
}

if (options.format === 'json') {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

if (options.format === 'export') {
  console.log(`export JURISMIND_OPENID=${shellQuote(payload.openId)}`);
  console.log(`export JURISMIND_TOKEN=${shellQuote(payload.token)}`);
  console.log(`export JURISMIND_TOKEN_KEY=${shellQuote(payload.tokenKey)}`);
  console.log(`export JURISMIND_TOKEN_ID=${shellQuote(payload.tokenId == null ? '' : String(payload.tokenId))}`);
  console.log(`export JURISMIND_AVATAR=${shellQuote(payload.avatar)}`);
  process.exit(0);
}

if (options.format === 'cmd') {
  console.log(`set "JURISMIND_OPENID=${cmdQuote(payload.openId)}"`);
  console.log(`set "JURISMIND_TOKEN=${cmdQuote(payload.token)}"`);
  console.log(`set "JURISMIND_TOKEN_KEY=${cmdQuote(payload.tokenKey)}"`);
  console.log(`set "JURISMIND_TOKEN_ID=${cmdQuote(payload.tokenId == null ? '' : String(payload.tokenId))}"`);
  console.log(`set "JURISMIND_AVATAR=${cmdQuote(payload.avatar)}"`);
  process.exit(0);
}

if (options.format === 'powershell') {
  console.log(`$env:JURISMIND_OPENID = ${psQuote(payload.openId)}`);
  console.log(`$env:JURISMIND_TOKEN = ${psQuote(payload.token)}`);
  console.log(`$env:JURISMIND_TOKEN_KEY = ${psQuote(payload.tokenKey)}`);
  console.log(`$env:JURISMIND_TOKEN_ID = ${psQuote(payload.tokenId == null ? '' : String(payload.tokenId))}`);
  console.log(`$env:JURISMIND_AVATAR = ${psQuote(payload.avatar)}`);
  process.exit(0);
}

fail(`Unsupported format: ${options.format}`);
