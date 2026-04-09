"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * UAT (User Access Token) API call wrapper.
 *
 * Provides a safe, auto-refreshing interface for making Feishu API calls on
 * behalf of a user.  Tokens are read from the OS Keychain, refreshed
 * transparently, and **never** exposed to the AI layer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NeedAuthorizationError = void 0;
exports.getValidAccessToken = getValidAccessToken;
exports.callWithUAT = callWithUAT;
exports.revokeUAT = revokeUAT;
const token_store_1 = require("./token-store.js");
const device_flow_1 = require("./device-flow.js");
const lark_logger_1 = require("./lark-logger.js");
const log = (0, lark_logger_1.larkLogger)('core/uat-client');
const feishu_fetch_1 = require("./feishu-fetch.js");
const auth_errors_1 = require("./auth-errors.js");
Object.defineProperty(exports, "NeedAuthorizationError", { enumerable: true, get: function () { return auth_errors_1.NeedAuthorizationError; } });
// ---------------------------------------------------------------------------
// Per-user refresh lock
// ---------------------------------------------------------------------------
/**
 * Guards against concurrent refresh operations for the same user.
 *
 * refresh_token is single-use: if two requests trigger a refresh
 * simultaneously, the second one would use an already-consumed token and
 * fail.  The lock ensures only one refresh runs at a time per user.
 */
const refreshLocks = new Map();
// ---------------------------------------------------------------------------
// Refresh implementation
// ---------------------------------------------------------------------------
async function doRefreshToken(opts, stored) {
    // refresh_token already expired → can't refresh, need re-auth.
    if (Date.now() >= stored.refreshExpiresAt) {
        log.info(`refresh_token expired for ${opts.userOpenId}, clearing`);
        await (0, token_store_1.removeStoredToken)(opts.appId, opts.userOpenId);
        return null;
    }
    const endpoints = (0, device_flow_1.resolveOAuthEndpoints)(opts.domain);
    const requestBody = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken,
        client_id: opts.appId,
        client_secret: opts.appSecret,
    }).toString();
    const callEndpoint = async () => {
        const resp = await (0, feishu_fetch_1.feishuFetch)(endpoints.token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: requestBody,
        });
        return (await resp.json());
    };
    let data = await callEndpoint();
    // Feishu v2 token endpoint returns `code: 0` on success.
    // Some responses use `error` field instead (standard OAuth).
    const code = data.code;
    const error = data.error;
    if ((code !== undefined && code !== 0) || error) {
        const errCode = code ?? error;
        // Transient server error: retry once, then clear.
        if (auth_errors_1.REFRESH_TOKEN_RETRYABLE.has(code)) {
            log.warn(`refresh transient error (code=${errCode}) for ${opts.userOpenId}, retrying once`);
            data = await callEndpoint();
            const retryCode = data.code;
            const retryError = data.error;
            if ((retryCode !== undefined && retryCode !== 0) || retryError) {
                const retryErrCode = retryCode ?? retryError;
                log.warn(`refresh failed after retry (code=${retryErrCode}), clearing token for ${opts.userOpenId}`);
                await (0, token_store_1.removeStoredToken)(opts.appId, opts.userOpenId);
                return null;
            }
        }
        else {
            // Any other error (invalid/expired/revoked token, or unknown): clear and force re-auth.
            log.warn(`refresh failed (code=${errCode}), clearing token for ${opts.userOpenId}`);
            await (0, token_store_1.removeStoredToken)(opts.appId, opts.userOpenId);
            return null;
        }
    }
    if (!data.access_token) {
        throw new Error('Token refresh returned no access_token');
    }
    const now = Date.now();
    const updated = {
        userOpenId: stored.userOpenId,
        appId: opts.appId,
        accessToken: data.access_token,
        // refresh_token is rotated – always use the new one.
        refreshToken: data.refresh_token ?? stored.refreshToken,
        expiresAt: now + (data.expires_in ?? 7200) * 1000,
        refreshExpiresAt: data.refresh_token_expires_in
            ? now + data.refresh_token_expires_in * 1000
            : stored.refreshExpiresAt,
        scope: data.scope ?? stored.scope,
        grantedAt: stored.grantedAt,
    };
    await (0, token_store_1.setStoredToken)(updated);
    log.info(`refreshed UAT for ${opts.userOpenId} (at:${(0, token_store_1.maskToken)(updated.accessToken)})`);
    return updated;
}
/**
 * Refresh with per-user locking.
 */
async function refreshWithLock(opts, stored) {
    const key = `${opts.appId}:${opts.userOpenId}`;
    // Another refresh is already in-flight – wait for it and re-read.
    const existing = refreshLocks.get(key);
    if (existing) {
        await existing;
        return (0, token_store_1.getStoredToken)(opts.appId, opts.userOpenId);
    }
    const promise = doRefreshToken(opts, stored);
    refreshLocks.set(key, promise);
    try {
        return await promise;
    }
    finally {
        refreshLocks.delete(key);
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Obtain a valid access_token for the given user.
 *
 * - Reads from Keychain.
 * - Refreshes proactively if the token is about to expire.
 * - Throws when no token exists or refresh fails irrecoverably.
 *
 * **The returned token must never be exposed to the AI layer.**
 */
async function getValidAccessToken(opts) {
    // Owner 检查已迁移到 owner-policy.ts（由 tool-client.ts 的 invokeAsUser 调用）
    const stored = await (0, token_store_1.getStoredToken)(opts.appId, opts.userOpenId);
    if (!stored) {
        throw new auth_errors_1.NeedAuthorizationError(opts.userOpenId);
    }
    const status = (0, token_store_1.tokenStatus)(stored);
    if (status === 'valid') {
        return stored.accessToken;
    }
    if (status === 'needs_refresh') {
        const refreshed = await refreshWithLock(opts, stored);
        if (!refreshed) {
            throw new auth_errors_1.NeedAuthorizationError(opts.userOpenId);
        }
        return refreshed.accessToken;
    }
    // expired
    await (0, token_store_1.removeStoredToken)(opts.appId, opts.userOpenId);
    throw new auth_errors_1.NeedAuthorizationError(opts.userOpenId);
}
/**
 * Execute an API call with a valid UAT, retrying once on token-expiry errors.
 */
async function callWithUAT(opts, apiCall) {
    const accessToken = await getValidAccessToken(opts);
    try {
        return await apiCall(accessToken);
    }
    catch (err) {
        // Retry once if the server reports token invalid/expired.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const code = err?.code ?? err?.response?.data?.code;
        if (auth_errors_1.TOKEN_RETRY_CODES.has(code)) {
            log.warn(`API call failed (code=${code}), refreshing and retrying`);
            const stored = await (0, token_store_1.getStoredToken)(opts.appId, opts.userOpenId);
            if (!stored)
                throw new auth_errors_1.NeedAuthorizationError(opts.userOpenId);
            const refreshed = await refreshWithLock(opts, stored);
            if (!refreshed)
                throw new auth_errors_1.NeedAuthorizationError(opts.userOpenId);
            return await apiCall(refreshed.accessToken);
        }
        throw err;
    }
}
/**
 * Revoke a user's UAT by removing it from the Keychain.
 */
async function revokeUAT(appId, userOpenId) {
    await (0, token_store_1.removeStoredToken)(appId, userOpenId);
    log.info(`revoked UAT for ${userOpenId}`);
}
