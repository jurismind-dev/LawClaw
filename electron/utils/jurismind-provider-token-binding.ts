import { app, shell } from 'electron';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
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
  avatar?: string;
}

interface SsoAuthContext {
  openId: string;
  token: JurismindTokenRecord | null;
  avatar?: string;
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

function normalizeAvatarUrl(value: unknown): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  return trimmed;
}

function extractAvatarFromAnyLevel(payload: unknown): string {
  const queue: unknown[] = [payload];
  const visited = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const data = current as Record<string, unknown>;
    const avatar = normalizeAvatarUrl(
      data.avatar
      ?? data.avatar_url
      ?? data.avatarUrl
      ?? data.headimgurl
      ?? data.headImgUrl
      ?? data.head_img_url
      ?? data.portrait
      ?? data.picture
    );
    if (avatar) {
      return avatar;
    }

    for (const value of Object.values(data)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return '';
}

function extractAvatar(payload: unknown): string {
  return extractAvatarFromAnyLevel(payload);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let cachedSsoBrandLogoDataUrl: string | null = null;

function getSsoBrandLogoDataUrl(): string {
  if (cachedSsoBrandLogoDataUrl !== null) {
    return cachedSsoBrandLogoDataUrl;
  }

  try {
    const logoPath = app.isPackaged
      ? join(process.resourcesPath, 'resources', 'sso-logo.png')
      : join(__dirname, '../../resources/sso-logo.png');
    const base64 = readFileSync(logoPath).toString('base64');
    cachedSsoBrandLogoDataUrl = `data:image/png;base64,${base64}`;
  } catch (error) {
    logger.warn('[JurismindProvider] 加载 SSO 页头 logo 失败:', error);
    cachedSsoBrandLogoDataUrl = '';
  }

  return cachedSsoBrandLogoDataUrl;
}

function renderSsoCallbackPage(options: {
  tone: 'pending' | 'success' | 'error';
  title: string;
  summaryLines: string[];
  statusText: string;
  footerLines: string[];
}): string {
  const brandLogoUrl = getSsoBrandLogoDataUrl();
  const palette = {
    success: {
      accent: '#22c55e',
      halo: '#f0fdf4',
      statusIcon: `
        <svg class="spinner" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="spinner-track" cx="12" cy="12" r="9"></circle>
          <path class="spinner-head" d="M21 12a9 9 0 0 0-9-9"></path>
        </svg>`,
      hero: `
        <div class="hero success">
          <div class="hero-halo"></div>
          <svg class="hero-svg" viewBox="0 0 52 52" aria-hidden="true">
            <circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none"></circle>
            <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"></path>
          </svg>
        </div>`,
      security: '已通过 Jurismind SSO 安全认证',
    },
    pending: {
      accent: '#eab308',
      halo: '#fefce8',
      statusIcon: `
        <svg class="spinner" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="spinner-track" cx="12" cy="12" r="9"></circle>
          <path class="spinner-head" d="M21 12a9 9 0 0 0-9-9"></path>
        </svg>`,
      hero: `
        <div class="hero pending">
          <div class="hero-halo"></div>
          <div class="hero-spinner-wrap">
            <svg class="hero-spinner" viewBox="0 0 24 24" aria-hidden="true">
              <circle class="spinner-track" cx="12" cy="12" r="9"></circle>
              <path class="spinner-head" d="M21 12a9 9 0 0 0-9-9"></path>
            </svg>
          </div>
        </div>`,
      security: '正在等待 Jurismind SSO 回传授权结果',
    },
    error: {
      accent: '#ef4444',
      halo: '#fef2f2',
      statusIcon: `
        <svg class="status-icon error" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none"></circle>
          <path d="M7 7l6 6M13 7l-6 6" fill="none"></path>
        </svg>`,
      hero: `
        <div class="hero error">
          <div class="hero-halo"></div>
          <svg class="hero-svg" viewBox="0 0 52 52" aria-hidden="true">
            <circle class="error-circle" cx="26" cy="26" r="25" fill="none"></circle>
            <path class="error-mark" fill="none" d="M18 18l16 16M34 18L18 34"></path>
          </svg>
        </div>`,
      security: '本次 Jurismind SSO 未完成有效授权',
    },
  }[options.tone];

  const summaryHtml = options.summaryLines
    .map((line) => escapeHtml(line))
    .join('<br>\n            ');
  const footerHtml = options.footerLines
    .map((line) => escapeHtml(line))
    .join('<br>\n            ');
  const hasSummary = summaryHtml.length > 0;
  const hasStatus = options.statusText.trim().length > 0;
  const summarySection = hasSummary
    ? `
      <p class="summary">
        ${summaryHtml}
      </p>`
    : '';
  const statusSection = hasStatus
    ? `
      <div class="status-box">
        ${palette.statusIcon}
        <span class="status-text">${escapeHtml(options.statusText)}</span>
      </div>`
    : '';
  const footerClass = !hasSummary && !hasStatus ? 'footer footer-compact' : 'footer';
  const brandLogoHtml = brandLogoUrl
    ? `<img src="${brandLogoUrl}" alt="劳有钳 LawClaw" class="brand-logo" />`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)} · LawClaw</title>
    <style>
      :root {
        --accent: ${palette.accent};
        --accent-halo: ${palette.halo};
        --bg: #f8fafc;
        --text: #111827;
        --muted: #6b7280;
        --soft: #9ca3af;
        --card-border: #f1f5f9;
        --status-bg: #f8fafc;
        --status-border: #e5e7eb;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100vh;
      }

      body {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 120px 16px 72px;
        background: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }

      .header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 80px;
        background: rgba(255, 255, 255, 0.96);
        border-bottom: 1px solid #edf2f7;
        box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
        backdrop-filter: blur(10px);
      }

      .header-inner {
        height: 100%;
        width: 100%;
        padding: 0 28px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        user-select: none;
      }

      .brand-logo {
        display: block;
        height: 44px;
        width: auto;
        object-fit: contain;
      }

      .card {
        width: 100%;
        max-width: 520px;
        padding: 56px 36px 38px;
        text-align: center;
        background: #ffffff;
        border: 1px solid var(--card-border);
        border-radius: 28px;
        box-shadow:
          0 30px 60px rgba(15, 23, 42, 0.08),
          0 8px 20px rgba(15, 23, 42, 0.05);
      }

      h1 {
        margin: 0;
        font-size: clamp(30px, 4vw, 38px);
        line-height: 1.18;
        letter-spacing: -0.03em;
      }

      .hero {
        width: 128px;
        height: 128px;
        margin: 0 auto 28px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .hero-halo {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: var(--accent-halo);
      }

      .hero-svg,
      .hero-spinner-wrap {
        position: relative;
        z-index: 1;
        width: 84px;
        height: 84px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .hero-svg circle,
      .hero-svg path,
      .status-icon circle,
      .status-icon path {
        stroke: var(--accent);
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .checkmark-circle,
      .error-circle {
        stroke-width: 2;
        stroke-dasharray: 166;
        stroke-dashoffset: 166;
        animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
      }

      .checkmark-check,
      .error-mark {
        stroke-width: 3;
        stroke-dasharray: 48;
        stroke-dashoffset: 48;
        animation: stroke 0.35s cubic-bezier(0.65, 0, 0.45, 1) 0.55s forwards;
      }

      .hero-spinner,
      .spinner {
        width: 100%;
        height: 100%;
        animation: spin 0.9s linear infinite;
      }

      .spinner-track {
        fill: none;
        stroke: #d1d5db;
        stroke-width: 3;
      }

      .spinner-head {
        fill: none;
        stroke: var(--accent);
        stroke-width: 3;
        stroke-linecap: round;
      }

      .summary {
        margin: 18px 0 30px;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.75;
      }

      .status-box {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin: 0 0 28px;
        padding: 18px 20px;
        border-radius: 18px;
        border: 1px solid var(--status-border);
        background: var(--status-bg);
      }

      .status-icon,
      .spinner {
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
      }

      .status-icon circle,
      .status-icon path {
        stroke-width: 2;
      }

      .status-text {
        color: #374151;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.6;
      }

      .footer {
        margin: 0;
        color: #9ca3af;
        font-size: 13px;
        line-height: 1.8;
      }

      .footer-compact {
        margin-top: 28px;
      }

      .security {
        position: absolute;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 6px;
        color: #9ca3af;
        font-size: 12px;
      }

      .security svg {
        width: 15px;
        height: 15px;
      }

      @keyframes stroke {
        100% {
          stroke-dashoffset: 0;
        }
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 640px) {
        body {
          padding: 96px 12px 72px;
        }

        .header {
          height: 68px;
        }

        .header-inner {
          padding: 0 16px;
        }

        .brand-logo {
          height: 36px;
        }

        .card {
          padding: 44px 24px 30px;
          border-radius: 24px;
        }

        .hero {
          width: 116px;
          height: 116px;
        }

        .security {
          width: calc(100% - 24px);
          text-align: center;
          justify-content: center;
          bottom: 18px;
        }
      }
    </style>
  </head>
  <body>
    <header class="header">
      <div class="header-inner">
        <div class="brand" aria-label="劳有钳 LawClaw">
          ${brandLogoHtml}
        </div>
      </div>
    </header>

    <main class="card">
      ${palette.hero}
      <h1>${escapeHtml(options.title)}</h1>
      ${summarySection}
      ${statusSection}
      <p class="${footerClass}">
        ${footerHtml}
      </p>
    </main>

    <div class="security">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z"></path>
      </svg>
      <span>${escapeHtml(palette.security)}</span>
    </div>
  </body>
</html>`;
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

    const successHtml = renderSsoCallbackPage({
      tone: 'success',
      title: '授权登录成功',
      summaryLines: [
        '您已成功通过 Jurismind 账号验证。',
      ],
      statusText: '',
      footerLines: [
        '确认绑定结果后，您可以安全地关闭此页面。',
      ],
    });
    const failHtml = renderSsoCallbackPage({
      tone: 'error',
      title: '授权登录失败',
      summaryLines: [
        'LawClaw 尚未收到有效的登录回调。',
        '请返回桌面端重新发起 Jurismind 登录授权。',
      ],
      statusText: '当前回调缺少有效 ticket',
      footerLines: [
        '此页面不会自动重试。',
        '请回到 LawClaw 后重新开始绑定流程。',
      ],
    });
    const pendingHtml = renderSsoCallbackPage({
      tone: 'pending',
      title: '正在等待授权完成',
      summaryLines: [
        '请在 Jurismind 登录页完成账号验证。',
        '验证完成后，此页面会自动刷新为授权结果。',
      ],
      statusText: '请暂时保持此页面打开',
      footerLines: [
        '如果长时间未完成，请返回 LawClaw 重新发起登录。',
        '授权成功后，结果会同步回桌面端。',
      ],
    });

    const server = createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${listenPort || 80}`);
        if (reqUrl.pathname !== '/callback') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(pendingHtml);
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
  const avatar = extractAvatar(body);

  const token = extractTokenFromPayload(body);
  if (!token?.tokenKey) {
    logger.warn('[JurismindProvider] checkTicket 未返回 token_key');
  }

  return {
    openId,
    avatar: avatar || undefined,
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
      avatar: auth.avatar,
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
