import { access, chmod, mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { getOpenClawConfigDir } from './paths';

export const WEIXIN_CHANNEL_ID = 'openclaw-weixin';
export const WEIXIN_PLUGIN_VERSION = '1.0.3';
export const WEIXIN_PLUGIN_NPM_SPEC = `@tencent-weixin/openclaw-weixin@${WEIXIN_PLUGIN_VERSION}`;
export const WEIXIN_DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
export const WEIXIN_DEFAULT_CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';
export const WEIXIN_DEFAULT_BOT_TYPE = '3';
export const WEIXIN_DEFAULT_ACCOUNT_NAME = 'Weixin';

const VALID_ACCOUNT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_ACCOUNT_ID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;

export interface StoredWeixinAccountData {
  token?: string;
  baseUrl?: string;
  userId?: string;
  savedAt?: string;
}

export interface ClearWeixinStoredStateResult {
  remainingAccountIds: string[];
}

function canonicalizeAccountId(value: string): string {
  if (VALID_ACCOUNT_ID_RE.test(value)) {
    return value.toLowerCase();
  }

  return value
    .toLowerCase()
    .replace(INVALID_ACCOUNT_ID_CHARS_RE, '-')
    .replace(LEADING_DASH_RE, '')
    .replace(TRAILING_DASH_RE, '')
    .slice(0, 64);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function removeFileIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // ignore missing files
  }
}

function resolveWeixinStateDir(): string {
  return join(getOpenClawConfigDir(), WEIXIN_CHANNEL_ID);
}

function resolveWeixinAccountsDir(): string {
  return join(resolveWeixinStateDir(), 'accounts');
}

function resolveWeixinAccountIndexPath(): string {
  return join(resolveWeixinStateDir(), 'accounts.json');
}

function resolveWeixinLegacyCredentialsPath(): string {
  return join(getOpenClawConfigDir(), 'credentials', WEIXIN_CHANNEL_ID, 'credentials.json');
}

function resolveWeixinAccountPath(accountId: string): string {
  return join(resolveWeixinAccountsDir(), `${accountId}.json`);
}

export function normalizeWeixinAccountId(accountId: string | undefined | null): string {
  const trimmed = String(accountId || '').trim();
  if (!trimmed) {
    return 'default';
  }

  const normalized = canonicalizeAccountId(trimmed);
  return normalized || 'default';
}

export function deriveLegacyWeixinRawAccountId(accountId: string): string | undefined {
  if (accountId.endsWith('-im-bot')) {
    return `${accountId.slice(0, -7)}@im.bot`;
  }
  if (accountId.endsWith('-im-wechat')) {
    return `${accountId.slice(0, -10)}@im.wechat`;
  }
  return undefined;
}

export async function listIndexedWeixinAccountIds(): Promise<string[]> {
  const parsed = await readJsonFile<unknown>(resolveWeixinAccountIndexPath());
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => normalizeWeixinAccountId(value));
}

async function listWeixinAccountFileIds(): Promise<string[]> {
  try {
    const entries = await readdir(resolveWeixinAccountsDir(), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.slice(0, -5))
      .filter(Boolean)
      .map((value) => normalizeWeixinAccountId(value));
  } catch {
    return [];
  }
}

export async function listStoredWeixinAccountIds(): Promise<string[]> {
  const ids = new Set<string>();

  for (const accountId of await listIndexedWeixinAccountIds()) {
    ids.add(accountId);
  }
  for (const accountId of await listWeixinAccountFileIds()) {
    ids.add(accountId);
  }

  return Array.from(ids);
}

export async function registerWeixinAccountId(accountId: string): Promise<void> {
  const normalizedAccountId = normalizeWeixinAccountId(accountId);
  const ids = new Set(await listIndexedWeixinAccountIds());
  ids.add(normalizedAccountId);

  await mkdir(resolveWeixinStateDir(), { recursive: true });
  await writeFile(
    resolveWeixinAccountIndexPath(),
    JSON.stringify(Array.from(ids), null, 2),
    'utf-8'
  );
}

async function unregisterWeixinAccountId(accountId: string): Promise<void> {
  const normalizedAccountId = normalizeWeixinAccountId(accountId);
  const ids = (await listIndexedWeixinAccountIds()).filter((value) => value !== normalizedAccountId);
  const indexPath = resolveWeixinAccountIndexPath();

  if (ids.length === 0) {
    await removeFileIfExists(indexPath);
    return;
  }

  await mkdir(resolveWeixinStateDir(), { recursive: true });
  await writeFile(indexPath, JSON.stringify(ids, null, 2), 'utf-8');
}

export async function loadWeixinAccountData(
  accountId: string | undefined | null
): Promise<StoredWeixinAccountData | null> {
  const normalizedAccountId = normalizeWeixinAccountId(accountId);
  const primary = await readJsonFile<StoredWeixinAccountData>(resolveWeixinAccountPath(normalizedAccountId));
  if (primary) {
    return primary;
  }

  const legacyRawAccountId = deriveLegacyWeixinRawAccountId(normalizedAccountId);
  if (legacyRawAccountId) {
    const compat = await readJsonFile<StoredWeixinAccountData>(resolveWeixinAccountPath(legacyRawAccountId));
    if (compat) {
      return compat;
    }
  }

  const legacyCredentials = await readJsonFile<{ token?: unknown }>(resolveWeixinLegacyCredentialsPath());
  if (typeof legacyCredentials?.token === 'string' && legacyCredentials.token.trim()) {
    return {
      token: legacyCredentials.token.trim(),
    };
  }

  return null;
}

export async function saveWeixinAccountData(
  accountId: string,
  update: { token?: string; baseUrl?: string; userId?: string }
): Promise<void> {
  const normalizedAccountId = normalizeWeixinAccountId(accountId);
  const existing = (await loadWeixinAccountData(normalizedAccountId)) || {};

  const nextData: StoredWeixinAccountData = {
    ...(update.token?.trim() || existing.token?.trim()
      ? { token: update.token?.trim() || existing.token?.trim(), savedAt: new Date().toISOString() }
      : {}),
    ...(update.baseUrl?.trim() || existing.baseUrl?.trim()
      ? { baseUrl: update.baseUrl?.trim() || existing.baseUrl?.trim() }
      : {}),
    ...(update.userId !== undefined
      ? update.userId.trim()
        ? { userId: update.userId.trim() }
        : {}
      : existing.userId?.trim()
        ? { userId: existing.userId.trim() }
        : {}),
  };

  await mkdir(resolveWeixinAccountsDir(), { recursive: true });
  const accountPath = resolveWeixinAccountPath(normalizedAccountId);
  await writeFile(accountPath, JSON.stringify(nextData, null, 2), 'utf-8');
  try {
    await chmod(accountPath, 0o600);
  } catch {
    // best-effort only
  }
}

export async function hasStoredWeixinCredentials(): Promise<boolean> {
  for (const accountId of await listStoredWeixinAccountIds()) {
    const account = await loadWeixinAccountData(accountId);
    if (typeof account?.token === 'string' && account.token.trim()) {
      return true;
    }
  }

  const legacyCredentials = await readJsonFile<{ token?: unknown }>(resolveWeixinLegacyCredentialsPath());
  return typeof legacyCredentials?.token === 'string' && legacyCredentials.token.trim().length > 0;
}

export async function getPrimaryWeixinAccountId(): Promise<string | null> {
  for (const accountId of await listStoredWeixinAccountIds()) {
    const account = await loadWeixinAccountData(accountId);
    if (typeof account?.token === 'string' && account.token.trim()) {
      return accountId;
    }
  }

  const indexedAccountIds = await listIndexedWeixinAccountIds();
  return indexedAccountIds[0] || null;
}

export async function clearWeixinStoredState(
  accountId?: string
): Promise<ClearWeixinStoredStateResult> {
  if (!accountId) {
    await rm(resolveWeixinStateDir(), { recursive: true, force: true }).catch(() => undefined);
    await removeFileIfExists(resolveWeixinLegacyCredentialsPath());
    return {
      remainingAccountIds: [],
    };
  }

  const normalizedAccountId = normalizeWeixinAccountId(accountId);
  await removeFileIfExists(resolveWeixinAccountPath(normalizedAccountId));

  const legacyRawAccountId = deriveLegacyWeixinRawAccountId(normalizedAccountId);
  if (legacyRawAccountId) {
    await removeFileIfExists(resolveWeixinAccountPath(legacyRawAccountId));
  }

  await unregisterWeixinAccountId(normalizedAccountId);
  await removeFileIfExists(resolveWeixinLegacyCredentialsPath());

  const remainingAccountIds = await listStoredWeixinAccountIds();
  if (remainingAccountIds.length === 0) {
    await rm(resolveWeixinStateDir(), { recursive: true, force: true }).catch(() => undefined);
  }

  return {
    remainingAccountIds,
  };
}

export async function isWeixinPluginInstalledDirPresent(): Promise<boolean> {
  return fileExists(join(getOpenClawConfigDir(), 'extensions', WEIXIN_CHANNEL_ID));
}

export async function getInstalledWeixinPluginVersion(): Promise<string | null> {
  const manifest = await readJsonFile<{ version?: unknown }>(
    join(getOpenClawConfigDir(), 'extensions', WEIXIN_CHANNEL_ID, 'package.json')
  );

  return typeof manifest?.version === 'string' && manifest.version.trim()
    ? manifest.version.trim()
    : null;
}
