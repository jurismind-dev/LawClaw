"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Account-scoped cache registry for Feishu user display names.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserNameCache = void 0;
exports.getUserNameCache = getUserNameCache;
exports.clearUserNameCache = clearUserNameCache;
const DEFAULT_MAX_SIZE = 500;
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
class UserNameCache {
    map = new Map();
    maxSize;
    ttlMs;
    constructor(maxSize = DEFAULT_MAX_SIZE, ttlMs = DEFAULT_TTL_MS) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }
    has(openId) {
        const entry = this.map.get(openId);
        if (!entry)
            return false;
        if (entry.expireAt <= Date.now()) {
            this.map.delete(openId);
            return false;
        }
        return true;
    }
    get(openId) {
        const entry = this.map.get(openId);
        if (!entry)
            return undefined;
        if (entry.expireAt <= Date.now()) {
            this.map.delete(openId);
            return undefined;
        }
        this.map.delete(openId);
        this.map.set(openId, entry);
        return entry.name;
    }
    set(openId, name) {
        this.map.delete(openId);
        this.map.set(openId, { name, expireAt: Date.now() + this.ttlMs });
        this.evict();
    }
    setMany(entries) {
        for (const [openId, name] of entries) {
            this.map.delete(openId);
            this.map.set(openId, { name, expireAt: Date.now() + this.ttlMs });
        }
        this.evict();
    }
    filterMissing(openIds) {
        return openIds.filter((id) => !this.has(id));
    }
    getMany(openIds) {
        const result = new Map();
        for (const id of openIds) {
            if (this.has(id)) {
                result.set(id, this.get(id) ?? '');
            }
        }
        return result;
    }
    clear() {
        this.map.clear();
    }
    evict() {
        while (this.map.size > this.maxSize) {
            const oldest = this.map.keys().next().value;
            if (oldest !== undefined)
                this.map.delete(oldest);
        }
    }
}
exports.UserNameCache = UserNameCache;
const registry = new Map();
function getUserNameCache(accountId) {
    let c = registry.get(accountId);
    if (!c) {
        c = new UserNameCache();
        registry.set(accountId, c);
    }
    return c;
}
function clearUserNameCache(accountId) {
    if (accountId !== undefined) {
        registry.get(accountId)?.clear();
        registry.delete(accountId);
    }
    else {
        for (const c of registry.values())
            c.clear();
        registry.clear();
    }
}
