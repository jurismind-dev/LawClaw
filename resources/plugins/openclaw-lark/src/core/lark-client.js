"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Feishu / Lark SDK client management.
 *
 * Provides `LarkClient` — a unified manager for Lark SDK client instances,
 * WebSocket connections, EventDispatcher lifecycle, and bot identity.
 *
 * Consumers obtain instances via factory methods:
 *   - `LarkClient.fromCfg(cfg, accountId)` — resolve account from config
 *   - `LarkClient.fromAccount(account)` — from a pre-resolved account
 *   - `LarkClient.fromCredentials(credentials)` — ephemeral instance (not cached)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LarkClient = void 0;
exports.getResolvedConfig = getResolvedConfig;
const Lark = __importStar(require("@larksuiteoapi/node-sdk"));
const user_name_cache_store_1 = require("../messaging/inbound/user-name-cache-store.js");
const accounts_1 = require("./accounts.js");
const chat_info_cache_1 = require("./chat-info-cache.js");
const lark_logger_1 = require("./lark-logger.js");
const runtime_store_1 = require("./runtime-store.js");
const version_1 = require("./version.js");
const log = (0, lark_logger_1.larkLogger)('core/lark-client');
// ---------------------------------------------------------------------------
// 注入 User-Agent 到所有飞书 SDK 请求
// ---------------------------------------------------------------------------
const GLOBAL_LARK_USER_AGENT_KEY = 'LARK_USER_AGENT';
function installGlobalUserAgent() {
    // node-sdk 内置拦截器最终会读取 global.LARK_USER_AGENT 并覆盖 User-Agent
    globalThis[GLOBAL_LARK_USER_AGENT_KEY] = (0, version_1.getUserAgent)();
}
installGlobalUserAgent();
Lark.defaultHttpInstance.interceptors.request.handlers = [];
// 使用 interceptors 在所有 HTTP 请求中注入 User-Agent header
Lark.defaultHttpInstance.interceptors.request.use((req) => {
    if (req.headers) {
        req.headers['User-Agent'] = (0, version_1.getUserAgent)();
    }
    return req;
}, undefined, { synchronous: true });
// ---------------------------------------------------------------------------
// Brand → SDK domain
// ---------------------------------------------------------------------------
const BRAND_TO_DOMAIN = {
    feishu: Lark.Domain.Feishu,
    lark: Lark.Domain.Lark,
};
/** Map a `LarkBrand` to the SDK `domain` parameter. */
function resolveBrand(brand) {
    return BRAND_TO_DOMAIN[brand ?? 'feishu'] ?? brand.replace(/\/+$/, '');
}
// ---------------------------------------------------------------------------
// LarkClient
// ---------------------------------------------------------------------------
/** Instance cache keyed by accountId. */
const cache = new Map();
/**
 * Compare two SecretRef-shaped objects by their identity fields.
 * Key-order independent, unlike JSON.stringify.
 */
function secretRefsEqual(a, b) {
    return a.source === b.source && a.provider === b.provider && a.id === b.id;
}
/**
 * Compare two credential values that may be strings or SecretRef objects.
 *
 * - Both strings: direct `===`.
 * - Both SecretRef objects: compare `source`, `provider`, `id` explicitly.
 * - Mixed (string vs SecretRef): treat as equal — the platform resolves the
 *   SecretRef at startup (producing the cached string) but `loadConfig()`
 *   returns the raw object on subsequent calls.  Detecting SecretRef identity
 *   changes is not useful here because the platform does not re-resolve
 *   feishu secrets on reload, so a new SecretRef would be equally unusable.
 */
function credentialsEqual(a, b) {
    if (a === b)
        return true;
    if (typeof a === 'string' && typeof b === 'string')
        return false;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        return secretRefsEqual(a, b);
    }
    // Mixed types: keep the cached instance that holds the working string.
    if ((typeof a === 'string' && b && typeof b === 'object') || (typeof b === 'string' && a && typeof a === 'object')) {
        return true;
    }
    return false;
}
class LarkClient {
    account;
    _sdk = null;
    _wsClient = null;
    _botOpenId;
    _botName;
    _lastProbeResult = null;
    _lastProbeAt = 0;
    /** Attached message deduplicator — disposed together with the client. */
    messageDedup = null;
    // ---- Plugin runtime (singleton) ------------------------------------------
    /** Persist the runtime instance for later retrieval (activate 阶段调用一次). */
    static setRuntime(runtime) {
        (0, runtime_store_1.setLarkRuntime)(runtime);
    }
    /** Retrieve the stored runtime instance. Throws if not yet initialised. */
    static get runtime() {
        return (0, runtime_store_1.getLarkRuntime)();
    }
    // ---- Global config (singleton) -------------------------------------------
    //
    // Plugin commands receive an account-scoped config (channels.feishu replaced
    // with the merged per-account config, `accounts` map stripped).  Commands
    // that need cross-account visibility (e.g. doctor, diagnose) read the
    // original global config from here.
    static _globalConfig = null;
    /** Store the original global config (called during monitor startup). */
    static setGlobalConfig(cfg) {
        LarkClient._globalConfig = cfg;
    }
    /** Retrieve the stored global config, or `null` if not yet set. */
    static get globalConfig() {
        return LarkClient._globalConfig;
    }
    // --------------------------------------------------------------------------
    constructor(account) {
        this.account = account;
    }
    /** Shorthand for `this.account.accountId`. */
    get accountId() {
        return this.account.accountId;
    }
    // ---- Static factory / cache ------------------------------------------------
    /** Resolve account from config and return a cached `LarkClient`. */
    static fromCfg(cfg, accountId) {
        return LarkClient.fromAccount((0, accounts_1.getLarkAccount)(cfg, accountId));
    }
    /**
     * Get (or create) a cached `LarkClient` for the given account.
     * If the cached instance has stale credentials it is replaced.
     */
    static fromAccount(account) {
        const existing = cache.get(account.accountId);
        if (existing &&
            existing.account.appId === account.appId &&
            credentialsEqual(existing.account.appSecret, account.appSecret)) {
            return existing;
        }
        // Credentials changed — tear down the stale instance before replacing it.
        if (existing) {
            log.info(`credentials changed, disposing stale instance`, { accountId: account.accountId });
            existing.dispose();
        }
        const instance = new LarkClient(account);
        cache.set(account.accountId, instance);
        return instance;
    }
    /**
     * Create an ephemeral `LarkClient` from bare credentials.
     * The instance is **not** added to the global cache — suitable for
     * one-off probe / diagnose calls that should not pollute account state.
     */
    static fromCredentials(credentials) {
        const base = {
            accountId: credentials.accountId ?? 'default',
            enabled: true,
            brand: credentials.brand ?? 'feishu',
            config: {},
        };
        const account = credentials.appId && credentials.appSecret
            ? { ...base, configured: true, appId: credentials.appId, appSecret: credentials.appSecret }
            : { ...base, configured: false, appId: credentials.appId, appSecret: credentials.appSecret };
        return new LarkClient(account);
    }
    /** Look up a cached instance by accountId. */
    static get(accountId) {
        return cache.get(accountId) ?? null;
    }
    /**
     * Dispose one or all cached instances.
     * With `accountId` — dispose that single instance.
     * Without — dispose every cached instance and clear the cache.
     */
    static async clearCache(accountId) {
        if (accountId !== undefined) {
            cache.get(accountId)?.dispose();
            (0, user_name_cache_store_1.clearUserNameCache)(accountId);
            (0, chat_info_cache_1.clearChatInfoCache)(accountId);
        }
        else {
            for (const inst of cache.values())
                inst.dispose();
            (0, user_name_cache_store_1.clearUserNameCache)();
            (0, chat_info_cache_1.clearChatInfoCache)();
        }
    }
    // ---- SDK client (lazy) -----------------------------------------------------
    /** Lazily-created Lark SDK client. */
    get sdk() {
        if (!this._sdk) {
            const { appId, appSecret } = this.requireCredentials();
            this._sdk = new Lark.Client({
                appId,
                appSecret,
                appType: Lark.AppType.SelfBuild,
                domain: resolveBrand(this.account.brand),
            });
        }
        return this._sdk;
    }
    // ---- Bot identity ----------------------------------------------------------
    /**
     * Probe bot identity via the `bot/v1/openclaw_bot/ping` API.
     * Results are cached on the instance for subsequent access via
     * `botOpenId` / `botName`.
     */
    async probe(opts) {
        const maxAge = opts?.maxAgeMs ?? 0;
        if (maxAge > 0 && this._lastProbeResult && Date.now() - this._lastProbeAt < maxAge) {
            return this._lastProbeResult;
        }
        if (!this.account.appId || !this.account.appSecret) {
            return { ok: false, error: 'missing credentials (appId, appSecret)' };
        }
        try {
            const needBotInfo = opts?.needBotInfo ?? true;
            const res = await this.sdk.request({
                method: 'POST',
                url: '/open-apis/bot/v1/openclaw_bot/ping',
                data: { needBotInfo },
            });
            if (res.code !== 0) {
                const result = {
                    ok: false,
                    appId: this.account.appId,
                    error: `API error: ${res.msg || `code ${res.code}`}`,
                };
                this._lastProbeResult = result;
                this._lastProbeAt = Date.now();
                return result;
            }
            const botInfo = res.data?.pingBotInfo;
            this._botOpenId = botInfo?.botID;
            this._botName = botInfo?.botName;
            const result = {
                ok: true,
                appId: this.account.appId,
                botName: this._botName,
                botOpenId: this._botOpenId,
            };
            this._lastProbeResult = result;
            this._lastProbeAt = Date.now();
            return result;
        }
        catch (err) {
            const result = {
                ok: false,
                appId: this.account.appId,
                error: err instanceof Error ? err.message : String(err),
            };
            this._lastProbeResult = result;
            this._lastProbeAt = Date.now();
            return result;
        }
    }
    /** Cached bot open_id (available after `probe()` or `startWS()`). */
    get botOpenId() {
        return this._botOpenId;
    }
    /** Cached bot name (available after `probe()` or `startWS()`). */
    get botName() {
        return this._botName;
    }
    // ---- WebSocket lifecycle ---------------------------------------------------
    /**
     * Start WebSocket event monitoring.
     *
     * Flow: probe bot identity → EventDispatcher → WSClient → start.
     * The returned Promise resolves when `abortSignal` fires.
     */
    async startWS(opts) {
        const { handlers, abortSignal, autoProbe = true } = opts;
        if (autoProbe)
            await this.probe();
        const dispatcher = new Lark.EventDispatcher({
            encryptKey: this.account.encryptKey ?? '',
            verificationToken: this.account.verificationToken ?? '',
        });
        dispatcher.register(handlers);
        const { appId, appSecret } = this.requireCredentials();
        // Close any existing WSClient before creating a new one to prevent
        // orphaned connections when startWS is called multiple times.
        if (this._wsClient) {
            log.warn(`closing previous WSClient before reconnect`, { accountId: this.accountId });
            try {
                this._wsClient.close({ force: true });
            }
            catch {
                // Ignore — the old client may already be torn down.
            }
            this._wsClient = null;
        }
        this._wsClient = new Lark.WSClient({
            appId,
            appSecret,
            domain: resolveBrand(this.account.brand),
            loggerLevel: Lark.LoggerLevel.info,
        });
        // SDK 的 handleEventData 只处理 type="event"，card action 回调是 type="card" 会被丢弃。
        // 打 patch 将 "card" 类型消息改成 "event" 后交给原 handler，让 EventDispatcher 正常路由。
        const wsClientAny = this._wsClient;
        const origHandleEventData = wsClientAny.handleEventData.bind(wsClientAny);
        wsClientAny.handleEventData = (data) => {
            const msgType = data.headers?.find?.((h) => h.key === 'type')?.value;
            if (msgType === 'card') {
                const patchedData = {
                    ...data,
                    headers: data.headers.map((h) => (h.key === 'type' ? { ...h, value: 'event' } : h)),
                };
                return origHandleEventData(patchedData);
            }
            return origHandleEventData(data);
        };
        await this.waitForAbort(dispatcher, abortSignal);
    }
    /** Whether a WebSocket client is currently active. */
    get wsConnected() {
        return this._wsClient != null;
    }
    /** Disconnect WebSocket but keep instance in cache. */
    disconnect() {
        if (this._wsClient) {
            log.info(`disconnecting WebSocket`, { accountId: this.accountId });
            try {
                this._wsClient.close({ force: true });
            }
            catch {
                // Ignore errors during close — the client may already be torn down.
            }
        }
        this._wsClient = null;
        if (this.messageDedup) {
            log.info(`disposing message dedup`, { accountId: this.accountId, size: this.messageDedup.size });
            this.messageDedup.dispose();
            this.messageDedup = null;
        }
    }
    /** Disconnect + remove from cache. */
    dispose() {
        this.disconnect();
        cache.delete(this.accountId);
    }
    // ---- Private helpers -------------------------------------------------------
    /** Assert credentials exist or throw. */
    requireCredentials() {
        const appId = this.account.appId;
        const appSecret = this.account.appSecret;
        if (!appId || !appSecret) {
            throw new Error(`LarkClient[${this.accountId}]: appId and appSecret are required`);
        }
        return { appId, appSecret };
    }
    /**
     * Start the WSClient and return a promise that resolves when the
     * abort signal fires (or immediately if already aborted).
     */
    waitForAbort(dispatcher, signal) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                this.disconnect();
                return resolve();
            }
            signal?.addEventListener('abort', () => {
                this.disconnect();
                resolve();
            }, { once: true });
            try {
                void this._wsClient.start({ eventDispatcher: dispatcher });
            }
            catch (err) {
                this.disconnect();
                reject(err);
            }
        });
    }
}
exports.LarkClient = LarkClient;
// Inject LarkClient reference into chat-info-cache to break the circular
// dependency (chat-info-cache needs LarkClient.fromCfg but lark-client
// imports clearChatInfoCache from chat-info-cache).
(0, chat_info_cache_1.injectLarkClient)(LarkClient);
// ---------------------------------------------------------------------------
// Config resolution helper
// ---------------------------------------------------------------------------
/**
 * Returns the best available config for account resolution.
 *
 * Priority: live config (has `channels.feishu`) > fallback (has
 * `channels.feishu`) > live config (last resort).
 *
 * The `config` object captured in tool-registration closures may be stale
 * after a hot-reload, so we prefer the live config from
 * `LarkClient.runtime.config.loadConfig()`.  However, `loadConfig()` may
 * return `{}` when the runtime config snapshot has been cleared (e.g. in
 * isolated cron sessions), so we fall back to the closure-captured config
 * when the live result lacks Feishu credentials.
 *
 * @param fallback - Config to use when the runtime is not yet initialised
 *   or when `loadConfig()` returns an incomplete config.
 */
function getResolvedConfig(fallback) {
    try {
        const live = LarkClient.runtime.config.loadConfig();
        // loadConfig() may return {} (empty config) when runtimeConfigSnapshot
        // has been cleared (e.g. after writeConfigFile, secrets teardown, or
        // concurrent cron race conditions in isolated sessions).  In that case
        // the closure-captured fallback still holds a valid resolved config.
        if (live?.channels?.feishu)
            return live;
        if (fallback?.channels?.feishu) {
            log.debug(`loadConfig() returned config without channels.feishu, using fallback`);
            return fallback;
        }
        return live;
    }
    catch {
        // runtime not yet initialised — fall back to passed config
        return fallback;
    }
}
