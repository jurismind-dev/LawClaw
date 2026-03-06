import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { logger } from './logger';
import { getResourcesDir } from './paths';

export interface JurismindProviderBindingConfig {
  ssoLoginUrl: string;
  ssoApiBaseUrl: string;
  ssoClientId: string;
  ssoCheckTicketPath: string;
  ssoCheckTicketMethod: 'GET' | 'POST';
  ssoTimeoutMs: number;
  creditsBaseUrl: string;
  creditsBindPath: string;
  creditsTokenQueryPathTemplate: string;
  creditsApiKey: string;
}

interface JurismindProviderBindingConfigFile {
  profile?: string;
  common?: Partial<JurismindProviderBindingConfig>;
  profiles?: Record<string, Partial<JurismindProviderBindingConfig>>;
}

const DEFAULT_PROFILE = 'test';
const DEFAULT_FILE_RELATIVE_PATH = join('config', 'jurismind-provider.json');
const DEFAULT_COMMON: JurismindProviderBindingConfig = {
  ssoLoginUrl: 'https://sso.fyjw.cn',
  ssoApiBaseUrl: 'https://testapi.fyjw.cn',
  ssoClientId: 'lawclaw-app',
  ssoCheckTicketPath: '/api/auth/sso/checkTicket',
  ssoCheckTicketMethod: 'POST',
  ssoTimeoutMs: 180000,
  creditsBaseUrl: 'http://106.15.43.4:8070',
  creditsBindPath: '/api/v2/newapi/bind',
  creditsTokenQueryPathTemplate: '/api/v2/newapi/{open_id}/token',
  creditsApiKey: '',
};

const DEFAULT_PROFILE_CONFIGS: Record<string, Partial<JurismindProviderBindingConfig>> = {
  test: {
    ssoLoginUrl: 'https://sso.fyjw.cn',
    ssoApiBaseUrl: 'https://testapi.fyjw.cn',
  },
  production: {
    ssoLoginUrl: 'https://sso.jurismind.com',
    ssoApiBaseUrl: 'https://api.jurismind.com',
  },
  prod: {
    ssoLoginUrl: 'https://sso.jurismind.com',
    ssoApiBaseUrl: 'https://api.jurismind.com',
  },
};

function normalizeBaseUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '');
}

function normalizePath(path: string, fallback: string): string {
  const candidate = String(path || '').trim();
  if (!candidate) return fallback;
  return candidate.startsWith('/') ? candidate : `/${candidate}`;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getEnvString(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function getConfigFilePath(): string {
  const rawPath = getEnvString('JURISMIND_PROVIDER_CONFIG_PATH');
  if (rawPath) {
    return isAbsolute(rawPath) ? rawPath : join(process.cwd(), rawPath);
  }
  return join(getResourcesDir(), DEFAULT_FILE_RELATIVE_PATH);
}

function readConfigFile(configPath: string): JurismindProviderBindingConfigFile {
  if (!existsSync(configPath)) {
    logger.warn(`[JurismindProvider] 配置文件不存在，使用默认配置: ${configPath}`);
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as JurismindProviderBindingConfigFile;
    if (!parsed || typeof parsed !== 'object') {
      logger.warn(`[JurismindProvider] 配置文件格式无效，使用默认配置: ${configPath}`);
      return {};
    }
    return parsed;
  } catch (error) {
    logger.warn(`[JurismindProvider] 读取配置文件失败，使用默认配置: ${configPath} (${String(error)})`);
    return {};
  }
}

function resolveProfile(fileProfile: string | undefined): string {
  return String(getEnvString('JURISMIND_PROVIDER_PROFILE') || fileProfile || DEFAULT_PROFILE)
    .trim()
    .toLowerCase();
}

function getProfileConfig(
  profile: string,
  fileProfiles: Record<string, Partial<JurismindProviderBindingConfig>> | undefined
): Partial<JurismindProviderBindingConfig> {
  const fromFile = fileProfiles?.[profile];
  if (fromFile) {
    return fromFile;
  }
  return DEFAULT_PROFILE_CONFIGS[profile] || {};
}

function applyEnvOverride(
  target: Partial<JurismindProviderBindingConfig>,
  envName: string,
  configKey: keyof JurismindProviderBindingConfig
): void {
  const value = getEnvString(envName);
  if (value !== undefined) {
    target[configKey] = value as never;
  }
}

export function loadJurismindProviderBindingConfig(): JurismindProviderBindingConfig {
  const configPath = getConfigFilePath();
  const fileConfig = readConfigFile(configPath);
  const profile = resolveProfile(fileConfig.profile);

  const merged: Partial<JurismindProviderBindingConfig> = {
    ...DEFAULT_COMMON,
    ...(fileConfig.common || {}),
    ...getProfileConfig(profile, fileConfig.profiles),
  };

  applyEnvOverride(merged, 'JURISMIND_SSO_LOGIN_URL', 'ssoLoginUrl');
  applyEnvOverride(merged, 'JURISMIND_SSO_API_BASE_URL', 'ssoApiBaseUrl');
  applyEnvOverride(merged, 'JURISMIND_SSO_CLIENT_ID', 'ssoClientId');
  applyEnvOverride(merged, 'JURISMIND_SSO_CHECK_TICKET_PATH', 'ssoCheckTicketPath');
  applyEnvOverride(merged, 'JURISMIND_SSO_CHECK_TICKET_METHOD', 'ssoCheckTicketMethod');
  applyEnvOverride(merged, 'JURISMIND_CREDITS_BASE_URL', 'creditsBaseUrl');
  applyEnvOverride(merged, 'JURISMIND_CREDITS_BIND_PATH', 'creditsBindPath');
  applyEnvOverride(merged, 'JURISMIND_CREDITS_TOKEN_QUERY_PATH', 'creditsTokenQueryPathTemplate');
  applyEnvOverride(merged, 'JURISMIND_CREDITS_API_KEY', 'creditsApiKey');

  const methodRaw = String(merged.ssoCheckTicketMethod || 'POST')
    .trim()
    .toUpperCase();
  const ssoCheckTicketMethod = methodRaw === 'GET' ? 'GET' : 'POST';
  const timeoutFromEnv = getEnvString('JURISMIND_SSO_TIMEOUT_MS');
  const ssoTimeoutMs = parsePositiveInt(timeoutFromEnv ?? merged.ssoTimeoutMs, DEFAULT_COMMON.ssoTimeoutMs);

  const config: JurismindProviderBindingConfig = {
    ssoLoginUrl: normalizeBaseUrl(String(merged.ssoLoginUrl || DEFAULT_COMMON.ssoLoginUrl)),
    ssoApiBaseUrl: normalizeBaseUrl(String(merged.ssoApiBaseUrl || DEFAULT_COMMON.ssoApiBaseUrl)),
    ssoClientId: String(merged.ssoClientId || DEFAULT_COMMON.ssoClientId).trim(),
    ssoCheckTicketPath: normalizePath(
      String(merged.ssoCheckTicketPath || DEFAULT_COMMON.ssoCheckTicketPath),
      DEFAULT_COMMON.ssoCheckTicketPath
    ),
    ssoCheckTicketMethod,
    ssoTimeoutMs,
    creditsBaseUrl: normalizeBaseUrl(String(merged.creditsBaseUrl || DEFAULT_COMMON.creditsBaseUrl)),
    creditsBindPath: normalizePath(
      String(merged.creditsBindPath || DEFAULT_COMMON.creditsBindPath),
      DEFAULT_COMMON.creditsBindPath
    ),
    creditsTokenQueryPathTemplate: String(
      merged.creditsTokenQueryPathTemplate || DEFAULT_COMMON.creditsTokenQueryPathTemplate
    ).trim(),
    creditsApiKey: String(merged.creditsApiKey || '').trim(),
  };

  logger.info(
    `[JurismindProvider] 配置 profile=${profile} login=${config.ssoLoginUrl} api=${config.ssoApiBaseUrl}`
  );
  return config;
}
