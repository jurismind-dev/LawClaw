"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Account-scoped LRU cache for Feishu user display names.
 *
 * Provides:
 * - `UserNameCache` — per-account LRU Map with TTL
 * - `getUserNameCache(accountId)` — singleton registry
 * - `batchResolveUserNames()` — batch API via `contact/v3/users/batch`
 * - `resolveUserName()` — single-user fallback via `contact.user.get`
 * - `clearUserNameCache()` — teardown hook (called from LarkClient.clearCache)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserNameCache = exports.clearUserNameCache = exports.UserNameCache = void 0;
exports.batchResolveUserNames = batchResolveUserNames;
exports.createBatchResolveNames = createBatchResolveNames;
exports.resolveUserName = resolveUserName;
const lark_client_1 = require("../../core/lark-client.js");
const user_name_cache_store_1 = require("./user-name-cache-store.js");
const permission_1 = require("./permission.js");
var user_name_cache_store_2 = require("./user-name-cache-store.js");
Object.defineProperty(exports, "UserNameCache", { enumerable: true, get: function () { return user_name_cache_store_2.UserNameCache; } });
Object.defineProperty(exports, "clearUserNameCache", { enumerable: true, get: function () { return user_name_cache_store_2.clearUserNameCache; } });
Object.defineProperty(exports, "getUserNameCache", { enumerable: true, get: function () { return user_name_cache_store_2.getUserNameCache; } });
// ---------------------------------------------------------------------------
// Batch resolve via contact/v3/users/batch
// ---------------------------------------------------------------------------
/** Max user_ids per API call (Feishu limit). */
const BATCH_SIZE = 50;
/**
 * Batch-resolve user display names.
 *
 * 1. Check cache → collect misses
 * 2. Deduplicate
 * 3. Call `GET /open-apis/contact/v3/users/batch` in chunks of 50
 * 4. Write results back to cache
 * 5. Return full Map<openId, name> (cache hits + API results)
 *
 * Best-effort: API errors are logged but never thrown.
 */
async function batchResolveUserNames(params) {
    const { account, openIds, log } = params;
    if (!account.configured || openIds.length === 0) {
        return new Map();
    }
    const cache = (0, user_name_cache_store_1.getUserNameCache)(account.accountId);
    const result = cache.getMany(openIds);
    // Deduplicate missing IDs
    const missing = [...new Set(cache.filterMissing(openIds))];
    if (missing.length === 0)
        return result;
    const client = lark_client_1.LarkClient.fromAccount(account).sdk;
    // Split into chunks of BATCH_SIZE and call SDK method
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        const chunk = missing.slice(i, i + BATCH_SIZE);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await client.contact.user.batch({
                params: {
                    user_ids: chunk,
                    user_id_type: 'open_id',
                },
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items = res?.data?.items ?? [];
            const resolved = new Set();
            for (const item of items) {
                const openId = item.open_id;
                if (!openId)
                    continue;
                const name = item.name || item.display_name || item.nickname || item.en_name || '';
                cache.set(openId, name);
                result.set(openId, name);
                resolved.add(openId);
            }
            // Cache empty names for IDs the API didn't return (no permission, etc.)
            for (const id of chunk) {
                if (!resolved.has(id)) {
                    cache.set(id, '');
                    result.set(id, '');
                }
            }
        }
        catch (err) {
            log(`batchResolveUserNames: failed: ${String(err)}`);
        }
    }
    return result;
}
/**
 * Create a `batchResolveNames` callback for use in `ConvertContext`.
 *
 * The returned function calls `batchResolveUserNames` with the given
 * account and log function, populating the TAT user-name cache.
 */
function createBatchResolveNames(account, log) {
    return async (openIds) => {
        await batchResolveUserNames({ account, openIds, log });
    };
}
/**
 * Resolve a single user's display name.
 *
 * Checks the account-scoped cache first, then falls back to the
 * `contact.user.get` API (same as the old `resolveFeishuSenderName`).
 */
async function resolveUserName(params) {
    const { account, openId, log } = params;
    if (!account.configured || !openId)
        return {};
    const cache = (0, user_name_cache_store_1.getUserNameCache)(account.accountId);
    if (cache.has(openId))
        return { name: cache.get(openId) ?? '' };
    try {
        const client = lark_client_1.LarkClient.fromAccount(account).sdk;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await client.contact.user.get({
            path: { user_id: openId },
            params: { user_id_type: 'open_id' },
        });
        const name = res?.data?.user?.name ||
            res?.data?.user?.display_name ||
            res?.data?.user?.nickname ||
            res?.data?.user?.en_name ||
            '';
        // Cache even empty names to avoid repeated API calls for users
        // whose names we cannot resolve (e.g. due to permissions).
        cache.set(openId, name);
        return { name: name || undefined };
    }
    catch (err) {
        const permErr = (0, permission_1.extractPermissionError)(err);
        if (permErr) {
            log(`feishu: permission error resolving user name: code=${permErr.code}`);
            // Cache empty name so we don't retry a known-failing openId
            cache.set(openId, '');
            return { permissionError: permErr };
        }
        log(`feishu: failed to resolve user name for ${openId}: ${String(err)}`);
        return {};
    }
}
