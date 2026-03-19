import { shell } from 'electron';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { logger } from './logger';
import { getProviderConfig, getProviderDefaultModel } from './provider-registry';
import {
  type JurismindProviderBindingConfig,
  loadJurismindProviderBindingConfig,
} from './jurismind-provider-binding-config';

export interface JurismindProviderBindingResult {
  openId: string;
  tokenKey: string;
  tokenId: number | null;
}

interface SsoAuthContext {
  openId: string;
  bearerToken: string | null;
  cookieHeader: string | null;
}

interface JurismindTokenRecord {
  tokenKey: string;
  tokenId: number | null;
}

function normalizePath(path: string, fallback: string): string {
  const candidate = String(path || '').trim();
  if (!candidate) return fallback;
  return candidate.startsWith('/') ? candidate : `/${candidate}`;
}

function getResponseMessage(payload: unknown, status?: number): string {
  const data = payload as
    | {
      detail?: string;
      message?: string;
      msg?: string;
      error?: string;
      code?: number | string;
    }
    | null
    | undefined;
  return (
    data?.detail
    || data?.message
    || data?.msg
    || data?.error
    || (typeof status === 'number' ? `HTTP ${status}` : 'request failed')
  );
}

function extractBusinessError(payload: unknown): string | null {
  const queue: unknown[] = [payload];
  const visited = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const data = current as Record<string, unknown>;
    const success = data.success;
    const code = data.code;
    const message = String(data.detail || data.message || data.msg || data.error || '').trim();

    if (success === false) {
      return message || '业务返回 success=false';
    }
    if (typeof code === 'number' && code !== 0 && code !== 200) {
      return message || `业务返回异常 code=${code}`;
    }
    if (typeof code === 'string' && code && code !== '0' && code !== '200') {
      return message || `业务返回异常 code=${code}`;
    }

    for (const value of Object.values(data)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
}

function extractBoundFlag(payload: unknown): boolean | null {
  const queue: unknown[] = [payload];
  const visited = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const data = current as Record<string, unknown>;
    if (typeof data.bound === 'boolean') {
      return data.bound;
    }

    for (const value of Object.values(data)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
}

function extractOpenIdFromAnyLevel(payload: unknown): string {
  const queue: unknown[] = [payload];
  const visited = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const data = current as Record<string, unknown>;
    const openId = String(data.open_id || data.openId || '').trim();
    if (openId) {
      return openId;
    }

    for (const value of Object.values(data)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return '';
}

function extractOpenId(payload: unknown): string {
  return extractOpenIdFromAnyLevel(payload);
}

function extractSsoToken(payload: unknown): string | null {
  const tokenFieldNames = new Set([
    'token',
    'accesstoken',
    'access_token',
    'satoken',
    'sa_token',
    'sso_token',
    'ssotoken',
    'tokenvalue',
    'token_value',
    'logintoken',
    'login_token',
  ]);

  const queue: unknown[] = [payload];
  const visited = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const data = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      const normalizedKey = key.toLowerCase();
      if (tokenFieldNames.has(normalizedKey)) {
        const token = String(value || '').trim();
        if (token && token.length >= 8 && !/\s/.test(token)) {
          return token;
        }
      }
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
}

function normalizeBearerToken(token: string): string {
  const raw = String(token || '').trim();
  if (!raw) return '';
  if (/^Bearer\s+/i.test(raw)) {
    return raw.replace(/^Bearer\s+/i, 'Bearer ').trim();
  }
  return `Bearer ${raw}`;
}

function extractCookieHeader(response: Response): string | null {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const rawSetCookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [String(response.headers.get('set-cookie'))] : []);

  if (!rawSetCookies.length) return null;

  const cookiePairs: string[] = [];
  for (const setCookie of rawSetCookies) {
    const pair = String(setCookie || '')
      .split(';')[0]
      ?.trim();
    if (pair && pair.includes('=')) {
      cookiePairs.push(pair);
    }
  }

  return cookiePairs.length > 0 ? cookiePairs.join('; ') : null;
}

export function normalizeJurismindProviderToken(token: string): string {
  const trimmed = String(token || '').trim();
  if (!trimmed) return '';

  const withoutBearer = trimmed.replace(/^Bearer\s+/i, '').trim();
  const withoutQuotes = withoutBearer.replace(/^['"`]+|['"`]+$/g, '').trim();
  const normalized = withoutQuotes.replace(/[，。,；;]+$/g, '').trim();

  if (!normalized) return '';
  return /^sk-/i.test(normalized) ? normalized : `sk-${normalized}`;
}

function extractTokenCandidateFromText(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!text) return null;

  const skMatch = text.match(/(sk-[A-Za-z0-9._~-]+)/);
  if (skMatch?.[1]) {
    return normalizeJurismindProviderToken(skMatch[1]);
  }

  const labeledTokenMatch = text.match(
    /(?:用户已绑定)?token(?:_key)?\s*[:：=]\s*([A-Za-z0-9._~-]{16,})/i
  );
  if (labeledTokenMatch?.[1]) {
    return normalizeJurismindProviderToken(labeledTokenMatch[1]);
  }

  if (!/\s/.test(text) && !text.includes('://') && /^[A-Za-z0-9._~-]{16,}$/.test(text)) {
    return normalizeJurismindProviderToken(text);
  }

  return null;
}

export function extractTokenFromPayload(
  payload: unknown
): { tokenKey: string; tokenId: number | null } | null {
  const normalizeToken = (value: unknown): string => String(value || '').trim();
  const isNonEmptyToken = (token: string): boolean => token.length > 0 && !/\s/.test(token);
  const isLikelyGenericToken = (token: string): boolean => token.length >= 16 && !/\s/.test(token);

  const queue: unknown[] = [payload];
  const visited = new Set<object>();
  let foundTokenId: number | null = null;
  let foundByMessage: string | null = null;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (typeof current === 'string') {
      const token = extractTokenCandidateFromText(current);
      if (token) {
        foundByMessage = token;
      }
      continue;
    }

    if (typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const data = current as Record<string, unknown>;

    // 优先读取明确的 token_key 字段（不强制 sk- 前缀）
    const explicitCandidates = [data.token_key, data.tokenKey, data.newapi_token_key, data.newapiTokenKey];
    for (const candidate of explicitCandidates) {
      const token = normalizeToken(candidate);
      if (isNonEmptyToken(token)) {
        const tokenIdRaw = data.token_id ?? data.tokenId ?? data.newapi_token_id ?? data.newapiTokenId ?? null;
        const tokenId = Number.isFinite(Number(tokenIdRaw)) ? Number(tokenIdRaw) : foundTokenId;
        return { tokenKey: normalizeJurismindProviderToken(token), tokenId: tokenId ?? null };
      }
    }

    // 兼容某些接口使用 key/token 字段承载密钥
    const genericCandidates = [data.key, data.token];
    for (const candidate of genericCandidates) {
      const token = normalizeToken(candidate);
      if (token.startsWith('sk-') || isLikelyGenericToken(token)) {
        const tokenIdRaw = data.token_id ?? data.tokenId ?? data.newapi_token_id ?? data.newapiTokenId ?? null;
        const tokenId = Number.isFinite(Number(tokenIdRaw)) ? Number(tokenIdRaw) : foundTokenId;
        return { tokenKey: normalizeJurismindProviderToken(token), tokenId: tokenId ?? null };
      }
    }

    const tokenIdRaw = data.token_id ?? data.tokenId ?? data.newapi_token_id ?? data.newapiTokenId ?? null;
    if (Number.isFinite(Number(tokenIdRaw))) {
      foundTokenId = Number(tokenIdRaw);
    }

    const messageCandidates = [data.detail, data.message, data.msg, data.error];
    for (const messageCandidate of messageCandidates) {
      const token = extractTokenCandidateFromText(messageCandidate);
      if (token) {
        foundByMessage = token;
      }
    }

    for (const value of Object.values(data)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  if (foundByMessage) {
    return { tokenKey: normalizeJurismindProviderToken(foundByMessage), tokenId: foundTokenId };
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function validateJurismindReusableToken(
  tokenKey: string
): Promise<{ valid: boolean; authInvalid: boolean; error?: string }> {
  const normalizedTokenKey = normalizeJurismindProviderToken(tokenKey);
  if (!normalizedTokenKey) {
    return {
      valid: false,
      authInvalid: false,
      error: 'token_key is empty',
    };
  }

  const providerConfig = getProviderConfig('jurismind');
  const baseUrl = String(providerConfig?.baseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    return {
      valid: false,
      authInvalid: false,
      error: 'Jurismind base URL is not configured',
    };
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${normalizedTokenKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getProviderDefaultModel('jurismind') || 'jurismind/jurismind',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    });
    const body = await response.json().catch(() => null);

    if ((response.status >= 200 && response.status < 300) || response.status === 429) {
      return { valid: true, authInvalid: false };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        valid: false,
        authInvalid: true,
        error: 'Invalid API key',
      };
    }

    return {
      valid: false,
      authInvalid: false,
      error: getResponseMessage(body, response.status),
    };
  } catch (error) {
    return {
      valid: false,
      authInvalid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveUsableJurismindToken(
  token: JurismindTokenRecord | null,
  sourceLabel: string,
  options: { allowUnverified?: boolean } = {}
): Promise<{
  token: JurismindTokenRecord | null;
  invalidAuth: boolean;
  validationError?: string;
  unverified?: boolean;
}> {
  if (!token?.tokenKey) {
    return { token: null, invalidAuth: false };
  }

  const normalizedTokenKey = normalizeJurismindProviderToken(token.tokenKey);
  if (!normalizedTokenKey) {
    return { token: null, invalidAuth: false };
  }

  const normalizedToken =
    normalizedTokenKey === token.tokenKey ? token : { ...token, tokenKey: normalizedTokenKey };

  const validation = await validateJurismindReusableToken(normalizedTokenKey);
  if (validation.valid) {
    return { token: normalizedToken, invalidAuth: false };
  }

  if (options.allowUnverified && !validation.authInvalid) {
    logger.warn(
      `[JurismindProvider] ${sourceLabel} token_key 校验未通过，但接受绑定接口返回值: ${validation.error || 'unknown'}`
    );
    return {
      token: normalizedToken,
      invalidAuth: false,
      validationError: validation.error,
      unverified: true,
    };
  }

  if (validation.authInvalid) {
    logger.warn(
      `[JurismindProvider] ${sourceLabel} token_key 校验失败，准备重新绑定: ${validation.error || 'Invalid API key'}`
    );
    return {
      token: null,
      invalidAuth: true,
      validationError: validation.error,
    };
  }

  logger.warn(
    `[JurismindProvider] ${sourceLabel} token_key 无法确认可用，继续尝试重新绑定: ${validation.error || 'unknown'}`
  );
  return {
    token: null,
    invalidAuth: false,
    validationError: validation.error,
  };
}

async function openSsoAndWaitTicket(config: JurismindProviderBindingConfig): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let listenPort = 0;

    const done = (error?: Error, ticket?: string) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      timeoutTimer = null;
      try {
        server.close();
      } catch {
        // ignore
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(ticket || '');
    };

    const successHtml = '<html><body><h3>登录成功</h3><p>请返回 LawClaw 继续。</p></body></html>';
    const failHtml = '<html><body><h3>登录失败</h3><p>回调缺少 ticket，请重试。</p></body></html>';

    const server = createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${listenPort || 80}`);
        if (reqUrl.pathname !== '/callback') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body><h3>LawClaw 登录中...</h3></body></html>');
          return;
        }

        const ticket = String(reqUrl.searchParams.get('ticket') || '').trim();
        if (!ticket) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(failHtml);
          done(new Error('SSO 回调缺少 ticket'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(successHtml);
        done(undefined, ticket);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('callback parse failed');
        done(new Error(`处理 SSO 回调失败: ${String(error)}`));
      }
    });

    server.on('error', (error) => {
      done(new Error(`启动本地 SSO 回调服务失败: ${String(error)}`));
    });

    server.listen(0, '127.0.0.1', async () => {
      const addr = server.address() as AddressInfo | null;
      if (!addr || typeof addr.port !== 'number') {
        done(new Error('无法获取本地回调端口'));
        return;
      }
      listenPort = addr.port;

      const redirectUrl = `http://127.0.0.1:${listenPort}/callback`;
      const loginUrl = new URL(config.ssoLoginUrl);
      loginUrl.searchParams.set('clientId', config.ssoClientId);
      loginUrl.searchParams.set('redirectUrl', redirectUrl);

      timeoutTimer = setTimeout(() => {
        done(new Error('SSO 登录超时，请重试'));
      }, config.ssoTimeoutMs);

      try {
        await shell.openExternal(loginUrl.toString());
        logger.info(`[JurismindProvider] 已打开 SSO 登录页: ${loginUrl.toString()}`);
      } catch (error) {
        done(new Error(`打开浏览器失败: ${String(error)}`));
      }
    });
  });
}

async function checkSsoTicket(
  ticket: string,
  config: JurismindProviderBindingConfig
): Promise<SsoAuthContext> {
  const requestByMethod = async (method: 'GET' | 'POST') => {
    const url = new URL(`${config.ssoApiBaseUrl}${config.ssoCheckTicketPath}`);
    const options: RequestInit = { method, headers: {} };

    if (method === 'GET') {
      url.searchParams.set('ticket', ticket);
      url.searchParams.set('clientId', config.ssoClientId);
      url.searchParams.set('client_id', config.ssoClientId);
      (options.headers as Record<string, string>).Accept = 'application/json';
    } else {
      (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
      options.body = JSON.stringify({
        ticket,
        clientId: config.ssoClientId,
      });
    }

    const response = await fetch(url.toString(), options);
    const body = await response.json().catch(() => null);
    return { response, body, method };
  };

  const initialMethod = config.ssoCheckTicketMethod;
  const method = initialMethod;
  let { response, body } = await requestByMethod(initialMethod);
  if (response.status === 405) {
    const fallback = initialMethod === 'POST' ? 'GET' : 'POST';
    logger.warn(`[JurismindProvider] checkTicket ${method} 返回 405，回退 ${fallback}`);
    ({ response, body } = await requestByMethod(fallback));
  }

  if (!response.ok) {
    throw new Error(`SSO 校验失败 (${response.status}): ${getResponseMessage(body, response.status)}`);
  }

  const openId = extractOpenId(body);
  if (!openId) {
    throw new Error(`SSO 校验成功但未返回 open_id: ${getResponseMessage(body)}`);
  }

  const bearerTokenFromBody = extractSsoToken(body);
  const bearerTokenFromHeader = String(response.headers.get('authorization') || '').trim();
  const bearerToken = bearerTokenFromBody || bearerTokenFromHeader || null;
  const cookieHeader = extractCookieHeader(response);

  if (!bearerToken && !cookieHeader) {
    logger.warn('[JurismindProvider] checkTicket 未返回可复用的 Bearer/Cookie，将尝试回退模式');
  }

  return {
    openId,
    bearerToken,
    cookieHeader,
  };
}

function buildCreditsHeaders(
  config: JurismindProviderBindingConfig,
  auth: Pick<SsoAuthContext, 'bearerToken' | 'cookieHeader'>
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.bearerToken) {
    headers.Authorization = normalizeBearerToken(auth.bearerToken);
  }
  if (auth.cookieHeader) {
    headers.Cookie = auth.cookieHeader;
  }
  if (!auth.bearerToken && !auth.cookieHeader && config.creditsApiKey) {
    logger.warn('[JurismindProvider] 未提取到用户 SSO 凭证，回退使用 X-API-Key');
    headers['X-API-Key'] = config.creditsApiKey;
  }
  return headers;
}

function buildTokenQueryPath(template: string, openId: string): string {
  const encoded = encodeURIComponent(openId);
  if (template.includes('{open_id}')) {
    return template.replace(/\{open_id\}/g, encoded);
  }
  const normalized = template.replace(/\/+$/, '');
  return `${normalized}/${encoded}/token`;
}

async function queryBoundToken(
  openId: string,
  config: JurismindProviderBindingConfig,
  auth: Pick<SsoAuthContext, 'bearerToken' | 'cookieHeader'>
): Promise<{ tokenKey: string; tokenId: number | null } | null> {
  const path = normalizePath(
    buildTokenQueryPath(config.creditsTokenQueryPathTemplate, openId),
    `/api/v2/newapi/${encodeURIComponent(openId)}/token`
  );
  const url = `${config.creditsBaseUrl}${path}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...buildCreditsHeaders(config, auth),
    },
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`查询 token 失败 (${response.status}): ${getResponseMessage(body, response.status)}`);
  }

  const businessError = extractBusinessError(body);
  if (businessError) {
    throw new Error(`查询 token 失败: ${businessError}`);
  }

  const token = extractTokenFromPayload(body);
  if (token?.tokenKey) {
    return token;
  }

  const bound = extractBoundFlag(body);
  if (bound === false) {
    return null;
  }

  return null;
}

async function bindTokenByOpenId(
  openId: string,
  config: JurismindProviderBindingConfig,
  auth: Pick<SsoAuthContext, 'bearerToken' | 'cookieHeader'>
): Promise<{ token: { tokenKey: string; tokenId: number | null } | null; message: string }> {
  const url = `${config.creditsBaseUrl}${config.creditsBindPath}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildCreditsHeaders(config, auth),
    },
    body: JSON.stringify({ open_id: openId }),
  });
  const body = await response.json().catch(() => null);
  const parsed = extractTokenFromPayload(body);
  const responseMessage = getResponseMessage(body, response.status);

  if (parsed?.tokenKey) {
    return { token: parsed, message: responseMessage };
  }

  if (!response.ok) {
    throw new Error(`绑定 token 失败 (${response.status}): ${getResponseMessage(body, response.status)}`);
  }

  const businessError = extractBusinessError(body);
  if (businessError) {
    throw new Error(`绑定 token 失败: ${businessError}`);
  }

  return { token: null, message: responseMessage };
}

async function queryBoundTokenWithRetry(
  openId: string,
  config: JurismindProviderBindingConfig,
  auth: Pick<SsoAuthContext, 'bearerToken' | 'cookieHeader'>,
  retryTimes = 20,
  intervalMs = 1000
): Promise<{ tokenKey: string; tokenId: number | null } | null> {
  for (let i = 0; i < retryTimes; i++) {
    const token = await queryBoundToken(openId, config, auth);
    if (token?.tokenKey) {
      return token;
    }
    if (i < retryTimes - 1) {
      await delay(intervalMs);
    }
  }
  return null;
}

export async function bindJurismindProviderToken(): Promise<JurismindProviderBindingResult> {
  const config = loadJurismindProviderBindingConfig();
  const ticket = await openSsoAndWaitTicket(config);
  if (!ticket) {
    throw new Error('未获取到 SSO ticket');
  }

  const auth = await checkSsoTicket(ticket, config);
  const openId = auth.openId;
  logger.info(`[JurismindProvider] SSO 登录成功 open_id=${openId}`);
  let lastInvalidTokenError: string | null = null;

  const existing = await queryBoundToken(openId, config, auth);
  const validatedExisting = await resolveUsableJurismindToken(existing, '复用已绑定');
  if (validatedExisting.token?.tokenKey) {
    logger.info('[JurismindProvider] 复用已绑定 token_key');
    return {
      openId,
      tokenKey: validatedExisting.token.tokenKey,
      tokenId: validatedExisting.token.tokenId,
    };
  }
  if (validatedExisting.invalidAuth) {
    lastInvalidTokenError = validatedExisting.validationError || lastInvalidTokenError;
  }

  const bindResult = await bindTokenByOpenId(openId, config, auth);
  const validatedBindToken = await resolveUsableJurismindToken(bindResult.token, '新绑定返回', {
    allowUnverified: true,
  });
  if (validatedBindToken.token?.tokenKey) {
    logger.info('[JurismindProvider] 绑定新 token_key 成功');
    return {
      openId,
      tokenKey: validatedBindToken.token.tokenKey,
      tokenId: validatedBindToken.token.tokenId,
    };
  }
  if (validatedBindToken.invalidAuth) {
    lastInvalidTokenError = validatedBindToken.validationError || lastInvalidTokenError;
  }

  logger.warn(`[JurismindProvider] 绑定接口未直接返回 token_key，开始轮询查询: ${bindResult.message}`);
  const fallback = await queryBoundTokenWithRetry(openId, config, auth, 6, 600);
  const validatedFallback = await resolveUsableJurismindToken(fallback, '轮询查询', {
    allowUnverified: true,
  });
  if (validatedFallback.token?.tokenKey) {
    return {
      openId,
      tokenKey: validatedFallback.token.tokenKey,
      tokenId: validatedFallback.token.tokenId,
    };
  }
  if (validatedFallback.invalidAuth) {
    lastInvalidTokenError = validatedFallback.validationError || lastInvalidTokenError;
  }

  // 某些服务在首次 bind 只返回“绑定成功”，再次 bind 可能返回“用户已绑定token: sk-xxx”
  logger.warn('[JurismindProvider] 首次绑定后仍未拿到 token_key，尝试再次调用 bind 兜底');
  const secondBind = await bindTokenByOpenId(openId, config, auth);
  const validatedSecondBind = await resolveUsableJurismindToken(secondBind.token, '二次绑定返回', {
    allowUnverified: true,
  });
  if (validatedSecondBind.token?.tokenKey) {
    return {
      openId,
      tokenKey: validatedSecondBind.token.tokenKey,
      tokenId: validatedSecondBind.token.tokenId,
    };
  }
  if (validatedSecondBind.invalidAuth) {
    lastInvalidTokenError = validatedSecondBind.validationError || lastInvalidTokenError;
  }

  const fallbackAfterSecondBind = await queryBoundTokenWithRetry(openId, config, auth, 8, 1200);
  const validatedFallbackAfterSecondBind = await resolveUsableJurismindToken(
    fallbackAfterSecondBind,
    '二次绑定后轮询查询',
    { allowUnverified: true }
  );
  if (validatedFallbackAfterSecondBind.token?.tokenKey) {
    return {
      openId,
      tokenKey: validatedFallbackAfterSecondBind.token.tokenKey,
      tokenId: validatedFallbackAfterSecondBind.token.tokenId,
    };
  }
  if (validatedFallbackAfterSecondBind.invalidAuth) {
    lastInvalidTokenError =
      validatedFallbackAfterSecondBind.validationError || lastInvalidTokenError;
  }

  const invalidDetail = lastInvalidTokenError ? `；最后校验结果: ${lastInvalidTokenError}` : '';
  throw new Error(`未获取到可用 token_key，请检查积分服务绑定接口返回: ${bindResult.message}${invalidDetail}`);
}
