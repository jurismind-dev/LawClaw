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
  token: JurismindTokenRecord | null;
}

interface JurismindTokenRecord {
  tokenKey: string;
  tokenId: number | null;
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
      `[JurismindProvider] ${sourceLabel} token_key 校验未通过，但接受当前返回值: ${validation.error || 'unknown'}`
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
      `[JurismindProvider] ${sourceLabel} token_key 校验失败: ${validation.error || 'Invalid API key'}`
    );
    return {
      token: null,
      invalidAuth: true,
      validationError: validation.error,
    };
  }

  logger.warn(
    `[JurismindProvider] ${sourceLabel} token_key 无法确认可用: ${validation.error || 'unknown'}`
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

  const token = extractTokenFromPayload(body);
  if (!token?.tokenKey) {
    logger.warn('[JurismindProvider] checkTicket 未返回 token_key');
  }

  return {
    openId,
    token,
  };
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
  const validatedToken = await resolveUsableJurismindToken(auth.token, 'SSO 返回', {
    allowUnverified: true,
  });
  if (validatedToken.token?.tokenKey) {
    logger.info('[JurismindProvider] 已使用 SSO 返回的 token_key');
    return {
      openId,
      tokenKey: validatedToken.token.tokenKey,
      tokenId: validatedToken.token.tokenId,
    };
  }

  if (validatedToken.invalidAuth) {
    throw new Error(
      `SSO 登录成功，但返回的 token_key 不可用: ${validatedToken.validationError || 'Invalid API key'}`
    );
  }

  throw new Error(
    `SSO 登录成功，但未返回可用的 token_key${validatedToken.validationError ? `: ${validatedToken.validationError}` : ''}`
  );
}
