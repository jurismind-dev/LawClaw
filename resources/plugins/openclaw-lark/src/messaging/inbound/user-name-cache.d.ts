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
import type { LarkAccount } from '../../core/types';
import { type PermissionError } from './permission';
export { UserNameCache, clearUserNameCache, getUserNameCache } from './user-name-cache-store';
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
export declare function batchResolveUserNames(params: {
    account: LarkAccount;
    openIds: string[];
    log: (...args: unknown[]) => void;
}): Promise<Map<string, string>>;
/**
 * Create a `batchResolveNames` callback for use in `ConvertContext`.
 *
 * The returned function calls `batchResolveUserNames` with the given
 * account and log function, populating the TAT user-name cache.
 */
export declare function createBatchResolveNames(account: LarkAccount, log: (...args: unknown[]) => void): (openIds: string[]) => Promise<void>;
export interface ResolveUserNameResult {
    name?: string;
    permissionError?: PermissionError;
}
/**
 * Resolve a single user's display name.
 *
 * Checks the account-scoped cache first, then falls back to the
 * `contact.user.get` API (same as the old `resolveFeishuSenderName`).
 */
export declare function resolveUserName(params: {
    account: LarkAccount;
    openId: string;
    log: (...args: unknown[]) => void;
}): Promise<ResolveUserNameResult>;
