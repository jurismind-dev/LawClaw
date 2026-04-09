/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Account-scoped cache registry for Feishu user display names.
 */
export declare class UserNameCache {
    private map;
    private maxSize;
    private ttlMs;
    constructor(maxSize?: number, ttlMs?: number);
    has(openId: string): boolean;
    get(openId: string): string | undefined;
    set(openId: string, name: string): void;
    setMany(entries: Iterable<[string, string]>): void;
    filterMissing(openIds: string[]): string[];
    getMany(openIds: string[]): Map<string, string>;
    clear(): void;
    private evict;
}
export declare function getUserNameCache(accountId: string): UserNameCache;
export declare function clearUserNameCache(accountId?: string): void;
