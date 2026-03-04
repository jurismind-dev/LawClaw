/**
 * ClawApp 本地连接器
 *
 * 架构：
 * - 本地连接器 ←WS→ 公网中继 /relay
 * - 本地连接器 ←WS→ 本地 OpenClaw Gateway
 *
 * 无感知目标：
 * - 无需手工填写 CONNECTOR_TOKEN（首次自动浏览器 SSO 授权）
 * - 无需手工填写 OPENCLAW_GATEWAY_TOKEN（默认自动读取本机 OpenClaw 配置）
 */

import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { hostname, homedir } from 'os';
import { createServer } from 'http';
import { spawn } from 'child_process';
import {
  randomUUID,
  generateKeyPairSync,
  createHash,
  sign as ed25519Sign,
  createPrivateKey,
  createPublicKey,
} from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function stripWrappedQuotes(value) {
  if (!value) return value;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadEnvFromFile(filePath) {
  if (!filePath || !existsSync(filePath)) return;
  try {
    const raw = readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      const value = stripWrappedQuotes(trimmed.slice(eq + 1).trim());
      process.env[key] = value;
    }
  } catch {
    // ignore env parse errors
  }
}

loadEnvFromFile(join(__dirname, '.env'));

const STATE_DIR = join(homedir(), '.lawclaw');
const DEFAULT_AUTH_PATH = join(STATE_DIR, 'connector-auth.json');
const DEFAULT_DEVICE_KEY_PATH = join(STATE_DIR, 'connector-device-key.json');

const CONFIG = {
  relayUrl: (process.env.RELAY_URL || '').trim(),
  connectorToken: (process.env.CONNECTOR_TOKEN || '').trim(),
  connectorName: (process.env.CONNECTOR_NAME || hostname() || 'lawclaw-local').trim(),
  gatewayUrl: (process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789').trim(),
  gatewayToken: (process.env.OPENCLAW_GATEWAY_TOKEN || '').trim(),
  authFilePath: (process.env.CONNECTOR_AUTH_FILE || DEFAULT_AUTH_PATH).trim(),
  autoAuthorize: (process.env.CONNECTOR_AUTO_AUTHORIZE || 'true').toLowerCase() !== 'false',
  authorizeMode: (process.env.CONNECTOR_AUTH_MODE || 'pair').trim().toLowerCase(),
  pairFallbackToRedirect: (process.env.CONNECTOR_PAIR_FALLBACK_REDIRECT || 'false').toLowerCase() === 'true',
  authorizeCallbackHost: (process.env.CONNECTOR_AUTH_CALLBACK_HOST || '127.0.0.1').trim(),
  authorizeCallbackPort: parseInt(process.env.CONNECTOR_AUTH_CALLBACK_PORT || '0', 10) || 0,
  authorizeTimeoutMs: Math.max(parseInt(process.env.CONNECTOR_AUTH_TIMEOUT_MS || '300000', 10) || 300000, 30000),
  authorizeOpenBrowser: (process.env.CONNECTOR_AUTH_OPEN_BROWSER || 'true').toLowerCase() !== 'false',
  pairStartPath: (process.env.CONNECTOR_PAIR_START_PATH || '/api/connector/pair/start').trim(),
  pairPollPath: (process.env.CONNECTOR_PAIR_POLL_PATH || '/api/connector/pair/poll').trim(),
  pairPollIntervalMs: Math.max(parseInt(process.env.CONNECTOR_PAIR_POLL_INTERVAL_MS || '2000', 10) || 2000, 500),
  pairOpenBrowser: (process.env.CONNECTOR_PAIR_OPEN_BROWSER || 'false').toLowerCase() !== 'false',
  gatewayTokenAutoDiscover: (process.env.OPENCLAW_GATEWAY_TOKEN_AUTO_DISCOVER || 'true').toLowerCase() !== 'false',
  openclawConfigPath: (process.env.OPENCLAW_CONFIG_PATH || join(homedir(), '.openclaw', 'openclaw.json')).trim(),
  openclawGatewayYamlPath: (process.env.OPENCLAW_GATEWAY_CONFIG_PATH || join(homedir(), '.openclaw', 'gateway.yaml')).trim(),
  deviceKeyPath: (process.env.CONNECTOR_DEVICE_KEY_PATH || DEFAULT_DEVICE_KEY_PATH).trim(),
};

if (!CONFIG.relayUrl) {
  console.error('[FATAL] 缺少 RELAY_URL');
  process.exit(1);
}

const log = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, ...args),
  debug: (msg, ...args) => process.env.DEBUG && console.log(`[DEBUG] ${new Date().toISOString()} ${msg}`, ...args),
};

const SCOPES = ['operator.admin', 'operator.approvals', 'operator.pairing', 'operator.read', 'operator.write'];
const REQUEST_TIMEOUT = 30000;
const CONNECT_TIMEOUT = 12000;
const RELAY_MAX_RECONNECT_DELAY = 30000;

const relayState = {
  ws: null,
  reconnectAttempts: 0,
  reconnectTimer: null,
  intentionalClose: false,
};

const localSessions = new Map();

function ensureParentDir(filePath) {
  const parent = dirname(filePath);
  if (!parent || parent === '.' || parent === filePath) return;
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

function toHttpBaseUrl(input) {
  const u = new URL(input);
  if (u.protocol === 'wss:') u.protocol = 'https:';
  if (u.protocol === 'ws:') u.protocol = 'http:';
  u.pathname = '/';
  u.search = '';
  u.hash = '';
  return u;
}

function buildRelayHttpUrl(pathname, query = null) {
  const url = toHttpBaseUrl(CONFIG.relayUrl);
  url.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeConnectorTokenPayload(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const idx = rawToken.lastIndexOf('.');
  if (idx <= 0) return null;
  try {
    return JSON.parse(Buffer.from(rawToken.slice(0, idx), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function isConnectorTokenUsable(rawToken) {
  if (!rawToken) return false;
  const payload = decodeConnectorTokenPayload(rawToken);
  // 非 JWT token（例如 legacy 静态 token）无法判断过期，默认可用
  if (!payload || typeof payload !== 'object') return true;
  if (typeof payload.exp !== 'number') return true;
  return payload.exp > Date.now() + 30 * 1000;
}

function loadSavedConnectorToken() {
  if (!existsSync(CONFIG.authFilePath)) return '';
  try {
    const data = JSON.parse(readFileSync(CONFIG.authFilePath, 'utf8'));
    const token = String(data?.connectorToken || '').trim();
    if (!token) return '';
    if (!isConnectorTokenUsable(token)) return '';
    return token;
  } catch {
    return '';
  }
}

function saveConnectorToken(token) {
  ensureParentDir(CONFIG.authFilePath);
  const payload = decodeConnectorTokenPayload(token);
  const data = {
    connectorToken: token,
    connectorId: payload?.connectorId || null,
    openId: payload?.openId || null,
    expiresAt: payload?.exp || null,
    savedAt: Date.now(),
  };
  writeFileSync(CONFIG.authFilePath, JSON.stringify(data, null, 2));
}

function extractGatewayTokenFromContent(raw) {
  if (!raw) return '';

  // openclaw.json / JSON5 样式
  const json5Match = raw.match(/gateway[\s\S]{0,2000}?auth[\s\S]{0,1000}?token\s*:\s*['\"]([^'\"\n]+)['\"]/i);
  if (json5Match?.[1]) return json5Match[1].trim();

  // 纯 JSON 样式
  const jsonMatch = raw.match(/"gateway"[\s\S]{0,2000}?"auth"[\s\S]{0,1000}?"token"\s*:\s*"([^"\n]+)"/i);
  if (jsonMatch?.[1]) return jsonMatch[1].trim();

  // gateway.yaml 样式
  const yamlMatch = raw.match(/^\s*token\s*:\s*['\"]?([^'\"\s#\n]+)['\"]?\s*$/m);
  if (yamlMatch?.[1]) return yamlMatch[1].trim();

  return '';
}

function discoverGatewayToken() {
  const candidates = [CONFIG.openclawConfigPath, CONFIG.openclawGatewayYamlPath];
  for (const filePath of candidates) {
    if (!filePath || !existsSync(filePath)) continue;
    try {
      const content = readFileSync(filePath, 'utf8');
      const token = extractGatewayTokenFromContent(content);
      if (token) {
        log.info(`已自动读取 Gateway Token: ${filePath}`);
        return token;
      }
    } catch (error) {
      log.warn(`读取 Gateway 配置失败: ${filePath} ${error.message}`);
    }
  }
  return '';
}

function openExternalUrl(url) {
  try {
    if (process.platform === 'darwin') {
      const p = spawn('open', [url], { detached: true, stdio: 'ignore' });
      p.unref();
      return true;
    }
    if (process.platform === 'win32') {
      const p = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
      p.unref();
      return true;
    }
    const p = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    p.unref();
    return true;
  } catch {
    return false;
  }
}

function buildConnectorAuthorizeUrl(callbackUrl) {
  const u = toHttpBaseUrl(CONFIG.relayUrl);
  u.pathname = '/api/connector/authorize';
  u.searchParams.set('redirect', callbackUrl);
  u.searchParams.set('name', CONFIG.connectorName);
  u.searchParams.set('connectorId', deviceKey.deviceId);
  return u.toString();
}

function requestConnectorTokenByBrowser() {
  return new Promise((resolve, reject) => {
    const callbackPath = `/connector/callback/${randomUUID()}`;
    let settled = false;
    let timeout = null;

    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { server.close(); } catch {}
      resolve(value);
    };
    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { server.close(); } catch {}
      reject(error);
    };

    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${CONFIG.authorizeCallbackHost}`);
      if (url.pathname !== callbackPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      const token = String(url.searchParams.get('connector_token') || '').trim();
      if (!token) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h3>连接器授权失败：缺少 connector_token</h3>');
        safeReject(new Error('连接器授权失败：缺少 connector_token'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h3>LawClaw 本地连接器授权成功，你可以关闭此页面。</h3>');
      safeResolve(token);
    });

    server.once('error', (error) => {
      safeReject(new Error(`启动本地授权回调失败: ${error.message}`));
    });

    server.listen(CONFIG.authorizeCallbackPort, CONFIG.authorizeCallbackHost, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : CONFIG.authorizeCallbackPort;
      const callbackUrl = `http://${CONFIG.authorizeCallbackHost}:${port}${callbackPath}`;
      const authorizeUrl = buildConnectorAuthorizeUrl(callbackUrl);

      log.info('需要进行一次 SSO 授权来绑定本机连接器。');
      log.info(`请在浏览器完成登录: ${authorizeUrl}`);

      if (CONFIG.authorizeOpenBrowser) {
        const opened = openExternalUrl(authorizeUrl);
        if (!opened) {
          log.warn('自动打开浏览器失败，请手动复制上面的链接到浏览器。');
        }
      }
    });

    timeout = setTimeout(() => {
      safeReject(new Error('连接器授权超时，请重新执行')); 
    }, CONFIG.authorizeTimeoutMs);
  });
}

async function requestConnectorTokenByPairing() {
  const startUrl = buildRelayHttpUrl(CONFIG.pairStartPath);
  const body = {
    name: CONFIG.connectorName,
    connectorId: deviceKey.deviceId,
  };

  const startResp = await fetch(startUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const startData = await startResp.json().catch(() => null);
  if (!startResp.ok || !startData?.ok) {
    const msg = startData?.error || startData?.msg || `创建绑定会话失败 (${startResp.status})`;
    throw new Error(msg);
  }

  const pairId = String(startData.pairId || '').trim();
  const pairSecret = String(startData.pairSecret || '').trim();
  const authorizeUrl = String(startData.authorizeUrl || '').trim();
  if (!pairId || !pairSecret || !authorizeUrl) {
    throw new Error('绑定会话响应缺少必要字段');
  }

  log.info('请使用手机扫码完成 Jurismind 渠道绑定。');
  log.info(`扫码/打开链接: ${authorizeUrl}`);
  // 方便上层 GUI 进程解析并展示二维码
  console.log(`[PAIR_URL] ${authorizeUrl}`);

  if (CONFIG.pairOpenBrowser) {
    const opened = openExternalUrl(authorizeUrl);
    if (!opened) {
      log.warn('自动打开浏览器失败，请手动扫码或复制链接。');
    }
  }

  const deadline = Date.now() + CONFIG.authorizeTimeoutMs;
  const pollPath = CONFIG.pairPollPath || '/api/connector/pair/poll';

  while (Date.now() < deadline) {
    try {
      const pollUrl = buildRelayHttpUrl(pollPath, { pairId, pairSecret });
      const pollResp = await fetch(pollUrl, { method: 'GET' });
      const pollData = await pollResp.json().catch(() => null);

      if (pollResp.status === 410 || pollData?.status === 'expired') {
        throw new Error('绑定会话已过期，请重新扫码');
      }
      if (!pollResp.ok || !pollData?.ok) {
        const msg = pollData?.error || pollData?.msg || `绑定轮询失败 (${pollResp.status})`;
        log.warn(msg);
      } else if (pollData.status === 'authorized') {
        const token = String(pollData.token || '').trim();
        if (!token) {
          throw new Error('绑定成功但未返回 connector_token');
        }
        return token;
      }
    } catch (error) {
      // 轮询期内允许短暂网络波动，继续重试
      log.debug(`绑定轮询异常: ${error?.message || String(error)}`);
    }

    await sleep(CONFIG.pairPollIntervalMs);
  }

  throw new Error('连接器扫码绑定超时，请重新执行');
}

async function ensureConnectorToken(forceReauthorize = false) {
  if (!forceReauthorize) {
    if (CONFIG.connectorToken && isConnectorTokenUsable(CONFIG.connectorToken)) {
      return;
    }

    if (!CONFIG.connectorToken) {
      const saved = loadSavedConnectorToken();
      if (saved) {
        CONFIG.connectorToken = saved;
      }
    }

    if (CONFIG.connectorToken && isConnectorTokenUsable(CONFIG.connectorToken)) {
      return;
    }
  }

  if (!CONFIG.autoAuthorize) {
    throw new Error('缺少 CONNECTOR_TOKEN，且已禁用自动授权 (CONNECTOR_AUTO_AUTHORIZE=false)');
  }

  let token = '';
  const authMode = CONFIG.authorizeMode === 'redirect' ? 'redirect' : 'pair';

  if (authMode === 'pair') {
    try {
      token = await requestConnectorTokenByPairing();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (CONFIG.pairFallbackToRedirect) {
        log.warn(`扫码绑定失败，将回退到浏览器回调模式: ${message}`);
        token = await requestConnectorTokenByBrowser();
      } else {
        throw new Error(`扫码绑定失败: ${message}`);
      }
    }
  } else {
    token = await requestConnectorTokenByBrowser();
  }

  CONFIG.connectorToken = token;
  saveConnectorToken(token);
}

function ensureGatewayToken() {
  if (CONFIG.gatewayToken) return;
  if (CONFIG.gatewayTokenAutoDiscover) {
    CONFIG.gatewayToken = discoverGatewayToken();
  }
  if (!CONFIG.gatewayToken) {
    throw new Error(
      '缺少 OPENCLAW_GATEWAY_TOKEN，且自动发现失败。请确认本机已安装并初始化 OpenClaw，或手动设置 OPENCLAW_GATEWAY_TOKEN。'
    );
  }
}

function loadOrCreateDeviceKey() {
  function rawPublicKeyBase64UrlFromPem(publicKeyPem) {
    const key = createPublicKey(publicKeyPem);
    const spki = key.export({ type: 'spki', format: 'der' });
    const raw = Buffer.from(spki).subarray(-32);
    return raw.toString('base64url');
  }

  function normalizeDeviceKey(data) {
    if (!data || typeof data !== 'object') return null;
    const privateKeyPem = String(data.privateKeyPem || '').trim();
    if (!privateKeyPem) return null;

    let publicKey = String(data.publicKey || '').trim();
    if (!publicKey) {
      const publicKeyPem = String(data.publicKeyPem || '').trim();
      if (publicKeyPem) {
        try {
          publicKey = rawPublicKeyBase64UrlFromPem(publicKeyPem);
        } catch {
          // ignore and fallback below
        }
      }
    }

    if (!publicKey) return null;

    let deviceId = String(data.deviceId || '').trim();
    if (!deviceId) {
      try {
        deviceId = createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('hex');
      } catch {
        return null;
      }
    }

    return {
      deviceId,
      publicKey,
      privateKeyPem,
    };
  }

  if (existsSync(CONFIG.deviceKeyPath)) {
    try {
      const parsed = JSON.parse(readFileSync(CONFIG.deviceKeyPath, 'utf8'));
      const normalized = normalizeDeviceKey(parsed);
      if (normalized) return normalized;
      log.warn(`设备密钥文件格式无效，将重新生成: ${CONFIG.deviceKeyPath}`);
    } catch (error) {
      log.warn(`读取设备密钥文件失败，将重新生成: ${CONFIG.deviceKeyPath} ${error.message}`);
    }
  }
  ensureParentDir(CONFIG.deviceKeyPath);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubRaw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const dk = {
    deviceId: createHash('sha256').update(pubRaw).digest('hex'),
    publicKey: pubRaw.toString('base64url'),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  writeFileSync(CONFIG.deviceKeyPath, JSON.stringify(dk, null, 2));
  return dk;
}

const deviceKey = loadOrCreateDeviceKey();
const devicePrivateKey = createPrivateKey(deviceKey.privateKeyPem);

function createConnectFrame(nonce) {
  const signedAt = Date.now();
  const payload = ['v2', deviceKey.deviceId, 'gateway-client', 'backend', 'operator', SCOPES.join(','), String(signedAt), CONFIG.gatewayToken, nonce || ''].join('|');
  const signature = ed25519Sign(null, Buffer.from(payload, 'utf8'), devicePrivateKey).toString('base64url');
  return {
    type: 'req',
    id: `connect-${randomUUID()}`,
    method: 'connect',
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: { id: 'gateway-client', version: '1.0.0', platform: 'desktop', mode: 'backend' },
      role: 'operator',
      scopes: SCOPES,
      caps: [],
      auth: { token: CONFIG.gatewayToken },
      device: { id: deviceKey.deviceId, publicKey: deviceKey.publicKey, signedAt, nonce, signature },
      locale: 'zh-CN',
      userAgent: 'LawClaw-Local-Connector/1.1.0',
    },
  };
}

function buildRelayWsUrl() {
  const u = new URL(CONFIG.relayUrl);
  if (u.protocol === 'https:') u.protocol = 'wss:';
  if (u.protocol === 'http:') u.protocol = 'ws:';
  u.pathname = '/relay';
  u.searchParams.set('token', CONFIG.connectorToken);
  u.searchParams.set('name', CONFIG.connectorName);
  return u.toString();
}

function isRelayOpen() {
  return relayState.ws && relayState.ws.readyState === WebSocket.OPEN;
}

function sendRelay(message) {
  if (!isRelayOpen()) return false;
  try {
    relayState.ws.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

function clearRelayReconnectTimer() {
  if (relayState.reconnectTimer) {
    clearTimeout(relayState.reconnectTimer);
    relayState.reconnectTimer = null;
  }
}

function scheduleRelayReconnect() {
  clearRelayReconnectTimer();
  if (relayState.intentionalClose) return;

  const delay = relayState.reconnectAttempts < 3
    ? 1000
    : Math.min(1000 * Math.pow(2, relayState.reconnectAttempts - 2), RELAY_MAX_RECONNECT_DELAY);
  relayState.reconnectAttempts++;

  relayState.reconnectTimer = setTimeout(() => {
    void connectRelay();
  }, delay);
}

function cleanupLocalSession(sid, options = {}) {
  const { notifyRelay = false, reason = 'session closed' } = options;
  const session = localSessions.get(sid);
  if (!session) return;

  if (session._connectTimer) clearTimeout(session._connectTimer);
  if (session._heartbeat) clearInterval(session._heartbeat);

  for (const [, pending] of session.pendingRequests) {
    clearTimeout(pending.timer);
    if (pending.reject) pending.reject(new Error(reason));
  }
  session.pendingRequests.clear();

  if (session.upstream && session.upstream.readyState !== WebSocket.CLOSED) {
    try { session.upstream.close(); } catch {}
  }

  if (notifyRelay) {
    sendRelay({
      type: 'relay.disconnected',
      sid,
      reason,
    });
  }

  localSessions.delete(sid);
}

function cleanupAllLocalSessions(reason = 'relay disconnected') {
  for (const sid of localSessions.keys()) {
    cleanupLocalSession(sid, { notifyRelay: false, reason });
  }
}

function createLocalSession(sid) {
  const session = {
    sid,
    upstream: null,
    state: 'init',
    hello: null,
    snapshot: null,
    pendingRequests: new Map(), // upstreamReqId -> { requestId, timer }
    _connectTimer: null,
    _connectResolve: null,
    _connectReject: null,
    _heartbeat: null,
  };
  localSessions.set(sid, session);
  return session;
}

function handleGatewayMessage(session, rawData) {
  const str = typeof rawData === 'string' ? rawData : rawData.toString();

  let msg;
  try {
    msg = JSON.parse(str);
  } catch {
    return;
  }

  if (session.state !== 'connected') {
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      const nonce = msg.payload?.nonce || '';
      if (session.upstream?.readyState === WebSocket.OPEN) {
        session.upstream.send(JSON.stringify(createConnectFrame(nonce)));
      }
      return;
    }

    if (msg.type === 'res' && String(msg.id || '').startsWith('connect-')) {
      if (msg.ok && !msg.error) {
        session.state = 'connected';
        session.hello = msg.payload;
        session.snapshot = msg.payload?.snapshot || null;
        if (session._connectTimer) {
          clearTimeout(session._connectTimer);
          session._connectTimer = null;
        }
        session._connectResolve?.();
      } else {
        if (session._connectTimer) {
          clearTimeout(session._connectTimer);
          session._connectTimer = null;
        }
        session._connectReject?.(new Error(msg.error?.message || 'Gateway 握手失败'));
      }
      return;
    }

    return;
  }

  if (msg.type === 'res') {
    const pending = session.pendingRequests.get(msg.id);
    if (!pending) return;

    session.pendingRequests.delete(msg.id);
    clearTimeout(pending.timer);

    sendRelay({
      type: 'relay.res',
      sid: session.sid,
      requestId: pending.requestId,
      ok: !!msg.ok,
      payload: msg.payload,
      error: msg.ok ? null : (msg.error?.message || msg.error?.code || '请求失败'),
    });
    return;
  }

  if (msg.type === 'event') {
    sendRelay({
      type: 'relay.event',
      sid: session.sid,
      event: msg,
    });
  }
}

async function connectLocalGateway(session) {
  return new Promise((resolve, reject) => {
    try {
      ensureGatewayToken();
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;

    const safeResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const safeReject = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    session._connectResolve = safeResolve;
    session._connectReject = safeReject;

    const upstream = new WebSocket(CONFIG.gatewayUrl, {
      headers: {
        Origin: CONFIG.gatewayUrl.replace('ws://', 'http://').replace('wss://', 'https://'),
      },
    });

    session.upstream = upstream;
    session.state = 'connecting';

    upstream.on('open', () => {
      session._connectTimer = setTimeout(() => {
        if (session.state === 'connecting' && upstream.readyState === WebSocket.OPEN) {
          upstream.send(JSON.stringify(createConnectFrame('')));
        }
      }, 500);

      setTimeout(() => {
        if (session.state === 'connecting') {
          safeReject(new Error('连接本地 Gateway 超时'));
        }
      }, CONNECT_TIMEOUT);
    });

    upstream.on('message', (data) => {
      handleGatewayMessage(session, data);
    });

    upstream.on('close', (code, reason) => {
      if (session.state === 'connected') {
        sendRelay({
          type: 'relay.disconnected',
          sid: session.sid,
          code,
          reason: String(reason || ''),
        });
        cleanupLocalSession(session.sid, { notifyRelay: false, reason: 'Gateway 连接关闭' });
      } else {
        safeReject(new Error(`Gateway 连接关闭: ${code}`));
      }
    });

    upstream.on('error', (error) => {
      if (session.state !== 'connected') {
        safeReject(new Error(`Gateway 连接错误: ${error.message}`));
      } else {
        log.warn(`Gateway 错误 [${session.sid}]: ${error.message}`);
      }
    });

    session._heartbeat = setInterval(() => {
      if (upstream.readyState === WebSocket.OPEN) {
        try { upstream.ping(); } catch {}
      }
    }, 30000);
  });
}

async function handleRelayConnect(message) {
  const sid = String(message.sid || '');
  if (!sid) return;

  if (localSessions.has(sid)) {
    cleanupLocalSession(sid, { notifyRelay: false, reason: 'replaced' });
  }

  const session = createLocalSession(sid);

  try {
    await connectLocalGateway(session);

    const defaults = session.snapshot?.sessionDefaults;
    const sessionKey = defaults?.mainSessionKey || `agent:${defaults?.defaultAgentId || 'main'}:main`;

    sendRelay({
      type: 'relay.connected',
      sid,
      hello: session.hello,
      snapshot: session.snapshot,
      sessionKey,
    });
  } catch (error) {
    sendRelay({
      type: 'relay.connect.error',
      sid,
      error: error.message || '连接本地 Gateway 失败',
    });
    cleanupLocalSession(sid, { notifyRelay: false, reason: 'connect failed' });
  }
}

function handleRelayRequest(message) {
  const sid = String(message.sid || '');
  const requestId = String(message.requestId || '');
  const method = String(message.method || '');
  const params = message.params || {};

  if (!sid || !requestId || !method) return;

  const session = localSessions.get(sid);
  if (!session || session.state !== 'connected' || !session.upstream || session.upstream.readyState !== WebSocket.OPEN) {
    sendRelay({
      type: 'relay.res',
      sid,
      requestId,
      ok: false,
      error: '本地 Gateway 未连接',
    });
    return;
  }

  const upstreamRequestId = `rpc-${randomUUID()}`;
  const timer = setTimeout(() => {
    session.pendingRequests.delete(upstreamRequestId);
    sendRelay({
      type: 'relay.res',
      sid,
      requestId,
      ok: false,
      error: '本地请求超时',
    });
  }, REQUEST_TIMEOUT);

  session.pendingRequests.set(upstreamRequestId, {
    requestId,
    timer,
  });

  try {
    session.upstream.send(JSON.stringify({
      type: 'req',
      id: upstreamRequestId,
      method,
      params,
    }));
  } catch (error) {
    clearTimeout(timer);
    session.pendingRequests.delete(upstreamRequestId);
    sendRelay({
      type: 'relay.res',
      sid,
      requestId,
      ok: false,
      error: error.message || '发送到本地 Gateway 失败',
    });
  }
}

function handleRelayDisconnect(message) {
  const sid = String(message.sid || '');
  if (!sid) return;
  cleanupLocalSession(sid, { notifyRelay: false, reason: 'relay requested disconnect' });
}

function handleRelayMessage(rawData) {
  let message;
  try {
    message = JSON.parse(typeof rawData === 'string' ? rawData : rawData.toString());
  } catch {
    return;
  }

  const type = message?.type;
  if (!type) return;

  if (type === 'relay.welcome') {
    log.info(`已连接中继: connectorId=${message.connectorId || '-'} openId=${message.openId || '-'}`);
    return;
  }

  if (type === 'relay.connect') {
    void handleRelayConnect(message);
    return;
  }

  if (type === 'relay.req') {
    handleRelayRequest(message);
    return;
  }

  if (type === 'relay.disconnect') {
    handleRelayDisconnect(message);
    return;
  }

  if (type === 'relay.ping') {
    sendRelay({ type: 'relay.pong', now: Date.now() });
  }
}

async function connectRelay() {
  clearRelayReconnectTimer();

  try {
    await ensureConnectorToken(false);
  } catch (error) {
    log.error(`连接器令牌不可用: ${error.message}`);
    scheduleRelayReconnect();
    return;
  }

  const relayWsUrl = buildRelayWsUrl();
  log.info(`连接中继服务: ${relayWsUrl.replace(CONFIG.connectorToken, '***')}`);

  const ws = new WebSocket(relayWsUrl);
  relayState.ws = ws;

  let handshakeRejected = false;

  ws.on('open', () => {
    relayState.reconnectAttempts = 0;
    log.info('中继连接已建立');
    sendRelay({
      type: 'relay.hello',
      name: CONFIG.connectorName,
      now: Date.now(),
    });
  });

  ws.on('unexpected-response', (_request, response) => {
    handshakeRejected = true;
    relayState.ws = null;
    cleanupAllLocalSessions('relay handshake failed');

    const statusCode = response?.statusCode || 0;
    log.warn(`中继握手被拒绝: HTTP ${statusCode}`);

    if ((statusCode === 401 || statusCode === 403) && CONFIG.autoAuthorize) {
      CONFIG.connectorToken = '';
      void (async () => {
        try {
          await ensureConnectorToken(true);
          scheduleRelayReconnect();
        } catch (error) {
          log.error(`重新授权失败: ${error.message}`);
          scheduleRelayReconnect();
        }
      })();
      return;
    }

    scheduleRelayReconnect();
  });

  ws.on('message', (data) => {
    handleRelayMessage(data);
  });

  ws.on('close', (code, reason) => {
    if (handshakeRejected) return;
    log.warn(`中继连接关闭 code=${code} reason=${String(reason || '')}`);
    relayState.ws = null;
    cleanupAllLocalSessions('relay disconnected');
    scheduleRelayReconnect();
  });

  ws.on('error', (error) => {
    log.error(`中继连接错误: ${error.message}`);
  });
}

function shutdown() {
  relayState.intentionalClose = true;
  clearRelayReconnectTimer();

  cleanupAllLocalSessions('shutdown');

  if (relayState.ws && relayState.ws.readyState !== WebSocket.CLOSED) {
    try { relayState.ws.close(); } catch {}
  }

  setTimeout(() => process.exit(0), 200);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function start() {
  log.info(`本地连接器启动: ${CONFIG.connectorName}`);
  log.info(`本地 Gateway: ${CONFIG.gatewayUrl}`);
  log.info(`设备 ID: ${deviceKey.deviceId.slice(0, 12)}...`);

  void connectRelay();
}

start().catch((error) => {
  log.error(`启动失败: ${error.message}`);
  process.exit(1);
});
